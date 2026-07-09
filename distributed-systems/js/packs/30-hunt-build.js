"use strict";
/* Distributed Systems Bootcamp — pack 30: spot-the-bug + write-it.
   Appends 6 BUGHUNT cards and 6 WRITE exercises: vector clocks, leases +
   fencing, elections, failure detection, sagas, the outbox, backoff,
   circuit breakers, and hash rings. Loads after content.js and the lesson
   packs, before the shared engine — everything pushed here is a
   first-class citizen of progress, test mode, and review. */
(() => {

/* ---- spot-the-bug: six more full implementations, one subtle fault each ---- */
BUGHUNT.push(
  { id:"bug_vclock", title:"Vector clock", why:"the receive is an event too", lesson:5,
    scenario:"Two replicas exchange updates to converge, then keep taking writes. Before the first sync, conflict detection is flawless; after replicas sync, genuinely conflicting edits start comparing as \"equal\" or \"before\" and one side's change is silently overwritten. Which line forgets that something just happened?",
    lines:[
      "class VectorClock {",
      "  constructor(id, n) {",
      "    this.id = id;",
      "    this.v = new Array(n).fill(0);",
      "  }",
      "",
      "  tick() {",
      "    this.v[this.id]++;",
      "    return this.v.slice();",
      "  }",
      "",
      "  stamp() {",
      "    this.v[this.id]++;",
      "    return this.v.slice();",
      "  }",
      "",
      "  recv(remote) {",
      "    for (let i = 0; i < this.v.length; i++)",
      "      this.v[i] = Math.max(this.v[i], remote[i]);",
      "    return this.v.slice();",
      "  }",
      "",
      "  compare(other) {",
      "    let le = true, ge = true;",
      "    for (let i = 0; i < this.v.length; i++) {",
      "      if (this.v[i] > other[i]) le = false;",
      "      if (this.v[i] < other[i]) ge = false;",
      "    }",
      "    if (le && ge) return \"equal\";",
      "    return le ? \"before\" : ge ? \"after\" : \"concurrent\";",
      "  }",
      "}",
    ],
    bug:[19],
    explain:"Line 20 returns straight after the max-merge — recv() never increments this node's own slot. The merge combines both histories, but the receive ITSELF is a new event: without this.v[this.id]++ before the return, the state before the message and the state after it carry identical vectors. Two replicas that just synced now compare \"equal\", and an edit made on top of the sync compares \"before\"/\"after\" the wrong things — real conflicts read as clean overwrites. The rule is two moves in strict order: element-wise max, THEN count the receive in your own slot. (compare() on lines 23–31 looks dense but is correct — that's the standard ≤/≥ dominance test.)" },

  { id:"bug_lease", title:"Lease server", why:"every grant must mint a new token", lesson:20,
    scenario:"During failover drills the standby acquires the lease and starts writing — and when the paused old primary wakes up, its writes land in storage right alongside the new primary's. The fencing check downstream is in place and rejects nothing; whoever writes last wins. Which line disarmed the fence?",
    lines:[
      "class LeaseServer {",
      "  #holder = null;",
      "  #expires = 0;",
      "  #token = 1;",
      "",
      "  acquire(node, now, ttl) {",
      "    if (this.#holder !== null && now < this.#expires)",
      "      return null;             // a live lease exists",
      "    this.#holder = node;",
      "    this.#expires = now + ttl;",
      "    return this.#token;",
      "  }",
      "",
      "  renew(node, now, ttl) {",
      "    if (this.#holder !== node || now >= this.#expires)",
      "      return null;             // lapsed — must re-acquire",
      "    this.#expires = now + ttl;",
      "    return this.#token;        // same grant, same token",
      "  }",
      "",
      "  holder(now) {",
      "    return now < this.#expires ? this.#holder : null;",
      "  }",
      "}",
    ],
    bug:[10],
    explain:"Line 11 returns #token without ever advancing it — every grant, to every holder, forever, carries the same number. Fencing works by comparison: storage rejects tokens LOWER than the highest it has seen, so when the old primary wakes from its pause, its token equals the new primary's and sails through. acquire() must mint a strictly increasing token per grant: return ++this.#token. Line 18 is the decoy that makes this subtle — renew() returning the unchanged token is CORRECT, because a renewal extends the same grant; only a NEW grant fences out the past." },

  { id:"bug_election", title:"Leader election", why:"exactly half is not a majority", lesson:17,
    scenario:"Test clusters of 3 and 5 nodes survive every partition you throw at them. Then the 6-node production cluster hits a clean 3|3 split and both halves elect a leader — writes diverge for nine minutes until the partition heals and nothing merges. Which line let the tie through?",
    lines:[
      "function electLeader(nodes, term) {",
      "  // who can this candidate actually reach?",
      "  const up = nodes.filter(n => n.up);",
      "",
      "  // never elect from a minority partition",
      "  if (up.length * 2 < nodes.length)",
      "    return { leader: null, term, votes: up.length };",
      "",
      "  // highest reachable id wins the new term",
      "  const winner = up.reduce((a, b) => a.id > b.id ? a : b);",
      "  return {",
      "    leader: winner.id,",
      "    term: term + 1,",
      "    votes: up.length,",
      "  };",
      "}",
      "",
      "async function onLeaderSuspected(cluster) {",
      "  const result = electLeader(cluster.nodes, cluster.term);",
      "  if (result.leader === null) return;  // leaderless — safe",
      "  cluster.term = result.term;",
      "  cluster.leader = result.leader;",
      "  await announce(cluster.nodes, result);",
      "}",
    ],
    bug:[5],
    explain:"Line 6 tests up.length * 2 < nodes.length, so exactly-half survives the guard: with 6 nodes split 3|3, 3 × 2 < 6 is false on BOTH sides, both halves proceed, and each elects its highest reachable id — two leaders, two diverging histories. Odd clusters can never tie, which is exactly why 3 and 5 nodes hid the bug. A majority must strictly EXCEED half, so the no-leader guard needs <=: an exact tie leaves both sides leaderless — painful, safe, and the reason quorum clusters run odd sizes. The reduce on line 10 and the term bump on line 13 are fine." },

  { id:"bug_heartbeat", title:"Failure detector", why:"silence past the timeout means suspect", lesson:16,
    scenario:"Failover keeps triggering against nodes that are heartbeating perfectly on schedule, while a node that was unplugged an hour ago still shows healthy. Stranger: the dashboard's live-node list and the per-node status endpoint disagree about the same node at the same instant. Which line?",
    lines:[
      "class FailureDetector {",
      "  #last = new Map();",
      "  #timeout;",
      "",
      "  constructor(timeout) {",
      "    this.#timeout = timeout;",
      "  }",
      "",
      "  beat(node, now) {",
      "    this.#last.set(node, now);",
      "  }",
      "",
      "  status(node, now) {",
      "    const t = this.#last.get(node);",
      "    if (t == null) return \"unknown\";",
      "    return (now - t) > this.#timeout ? \"alive\" : \"suspect\";",
      "  }",
      "",
      "  liveNodes(now) {",
      "    const out = [];",
      "    for (const [node, t] of this.#last)",
      "      if (now - t <= this.#timeout) out.push(node);",
      "    return out;",
      "  }",
      "}",
    ],
    bug:[15],
    explain:"Line 16 has the verdicts swapped: silence PAST the timeout reads \"alive\" and fresh silence reads \"suspect\". A node that beat 5ms ago gets flagged and failed over mid-health; a node unplugged an hour ago passes every check. liveNodes() on line 22 does the same arithmetic the right way round — which is why the dashboard and status() disagree about the same node. The fix flips the branches: (now - t) > timeout ? \"suspect\" : \"alive\" — and note it says suspect, never dead, because a slow node and a dead one produce identical silence." },

  { id:"bug_saga", title:"Saga runner", why:"unwind the stack you built", lesson:22,
    scenario:"Whenever the charge step declines, every compensation runs — yet cleanup intermittently errors and leaves orphaned holds: the itinerary record is already deleted by the time the hotel hold that references it is released. Which line unwinds in the wrong direction?",
    lines:[
      "class Saga {",
      "  #steps = [];",
      "",
      "  step(name, action, compensate) {",
      "    this.#steps.push({ name, action, compensate });",
      "    return this;",
      "  }",
      "",
      "  async run(log = []) {",
      "    const done = [];",
      "    for (const s of this.#steps) {",
      "      try {",
      "        await s.action();",
      "        log.push(\"ok:\" + s.name);",
      "        done.push(s);",
      "      } catch (e) {",
      "        for (const d of done) {",
      "          await d.compensate();",
      "          log.push(\"undo:\" + d.name);",
      "        }",
      "        return { ok: false, log };",
      "      }",
      "    }",
      "    return { ok: true, log };",
      "  }",
      "}",
    ],
    bug:[16],
    explain:"Line 17 compensates in the order the steps RAN, not the reverse. Later steps build on earlier ones — the hotel hold references the itinerary created before it — so undoing forward deletes the foundation first, and downstream undos fire against parents that no longer exist. The unwind must pop the stack it built: for (const d of done.reverse()). Everything around it is correct and worth noticing: only COMPLETED steps are in done (the failed step is never compensated), each undo is awaited, and the catch honestly returns ok: false." },

  { id:"bug_outbox", title:"Order service + outbox relay", why:"the bus doesn't roll back", lesson:14,
    scenario:"Tuesday's deploy added stricter order validation — more requests roll back now. Since then, fulfillment keeps consuming OrderCreated events for order ids that 404 on the orders API. The relay's metrics look completely normal. Which line creates the ghosts?",
    lines:[
      "class OrderService {",
      "  #db; #bus;",
      "",
      "  constructor(db, bus) {",
      "    this.#db = db;",
      "    this.#bus = bus;",
      "  }",
      "",
      "  async createOrder(order) {",
      "    await this.#db.transaction(async (tx) => {",
      "      await tx.insert(\"orders\", order);",
      "      await this.#bus.publish(\"OrderCreated\", order);",
      "    });",
      "    return order.id;",
      "  }",
      "",
      "  // relay: runs every second, drains unsent events",
      "  async relayOutbox() {",
      "    const rows = await this.#db.query(",
      "      \"select * from outbox where sent = false\");",
      "    for (const row of rows) {",
      "      await this.#bus.publish(row.event, row.payload);",
      "      await this.#db.markSent(row.id);",
      "    }",
      "  }",
      "}",
    ],
    bug:[11],
    explain:"Line 12 publishes from INSIDE the transaction callback — but the bus is not a transactional resource. publish() takes effect the instant it's called; when the new validation rolls the transaction back a moment later, the order insert vanishes and the event does not: consumers receive OrderCreated for an order that never existed. The write path should insert the event into the outbox table in the SAME transaction — tx.insert(\"outbox\", { event, payload, sent: false }) — and let relayOutbox() deliver it after commit. The relay itself (lines 18–25) is correct as written: publish-then-mark is at-least-once on a crash between them, which is the contract — consumers dedupe." },
);

/* ---- write-it: six more implementations, assembled and actually run ---- */
WRITE.push(
  { id:"w-vclock", title:"Vector clock — write it", why:"merge with max, then count the receive", lesson:5,
    spec:"Write all three methods. tick() records a local event: increment your own slot, return a snapshot. stamp() does the same for an outgoing message. recv(remote) merges the incoming vector element-wise with Math.max, THEN counts the receive itself as a new event in your own slot, and returns a snapshot. Always return a copy — never the live array. vcCompare is given below the class.",
    pre:`class VectorClock {
  constructor(id, n) {
    this.id = id;
    this.v = new Array(n).fill(0);
  }`,
    post:`}
// given: dominance test over two vectors
function vcCompare(a, b) {
  let le = true, ge = true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) le = false;
    if (a[i] < b[i]) ge = false;
  }
  if (le && ge) return "equal";
  return le ? "before" : ge ? "after" : "concurrent";
}`,
    lines:[
      "  tick() {",
      "    this.v[this.id]++;",
      "    return this.v.slice();",
      "  }",
      "  stamp() {",
      "    this.v[this.id]++;",
      "    return this.v.slice();",
      "  }",
      "  recv(remote) {",
      "    for (let i = 0; i < this.v.length; i++)",
      "      this.v[i] = Math.max(this.v[i], remote[i]);",
      "    this.v[this.id]++;",
      "    return this.v.slice();",
      "  }",
    ],
    distractors:[
      { code:"  recv(remote) {\n    for (let i = 0; i < this.v.length; i++)\n      this.v[i] = Math.max(this.v[i], remote[i]);\n    return this.v.slice();\n  }",
        why:"Merges both histories but never counts the receive itself as an event — 'before the message' and 'after it' carry identical vectors, so genuinely ordered states compare as equal and conflict detection goes quiet after every sync." },
      { code:"    this.v = remote.slice();",
        why:"Overwrites local history with the sender's: every local event the sender hadn't seen vanishes from causality — your replica's own recent writes now compare as never having happened." },
      { code:"    this.v[this.id] = remote[this.id] + 1;",
        why:"Advances your slot from the REMOTE's count of your events — if the sender is behind on your history, your own clock jumps backwards and events you already stamped land in the future." },
    ],
    test:`const A = new VectorClock(0, 2), B = new VectorClock(1, 2);
const a1 = A.tick();                        // A: [1,0]
const b1 = B.tick();                        // B: [0,1]
const rel1 = vcCompare(a1, b1);
assert(rel1 === "concurrent", "independent edits must compare concurrent, got " + rel1);
log("A=[" + a1.join(",") + "] vs B=[" + b1.join(",") + "] -> " + rel1);
const m = A.stamp();                        // A: [2,0]
const b2 = B.recv(m);                       // B: max-merge + self = [2,2]
log("B received [" + m.join(",") + "] -> [" + b2.join(",") + "]");
assert(b2[0] === 2, "recv must merge the sender's history (slot 0), got " + b2[0]);
assert(b2[1] === 2, "recv must count the receive itself in B's own slot, got " + b2[1]);
const rel2 = vcCompare(m, b2);
assert(rel2 === "before", "the send must happen-before the merged receive, got " + rel2);
const b3 = B.recv([0, 1]);                  // a stale vector arrives late
assert(b3[0] === 2 && b3[1] === 3, "a stale vector must not erase merged history, got [" + b3.join(",") + "]");
const rel3 = vcCompare(b2, b3);
assert(rel3 === "before", "B's own history must stay strictly ordered (and snapshots must be copies), got " + rel3);
log("stale [0,1] merged without losing anything: [" + b3.join(",") + "]");`,
    pass:"causality tracked: concurrent edits detected, every receive counted, history never lost",
    takeaway:"A vector clock is one counter per node plus two rules: bump your own slot for your own events, and on receive merge with max THEN bump — the receive is an event too.",
    hint:"tick() and stamp() are the same move: this.v[this.id]++, return this.v.slice(). recv() is two moves in strict order — element-wise Math.max into this.v, THEN this.v[this.id]++ — and returns a copy. The increment is what makes 'after the merge' a different state than the message itself." },

  { id:"w-heartbeat", title:"Failure detector — write it", why:"measure the silence, report suspicion", lesson:16,
    spec:"Write beat() and status(). beat(node, now) records when the node was last heard from. status(node, now) returns \"unknown\" for a node never heard from, \"alive\" while the silence (now − last beat) is within the timeout, and \"suspect\" once it is strictly past — never \"dead\": a slow node and a dead one look identical from here.",
    pre:`class FailureDetector {
  #last = new Map();
  #timeout;
  constructor(timeout) { this.#timeout = timeout; }`,
    post:`}`,
    lines:[
      "  beat(node, now) {",
      "    this.#last.set(node, now);",
      "  }",
      "  status(node, now) {",
      "    const t = this.#last.get(node);",
      "    if (t == null) return \"unknown\";",
      "    return (now - t) > this.#timeout ? \"suspect\" : \"alive\";",
      "  }",
    ],
    distractors:[
      { code:"    return (now - t) > this.#timeout ? \"dead\" : \"alive\";",
        why:"'dead' is certainty no detector has — the node may be mid-GC-pause, about to wake up believing it's healthy (that's how split brain starts). Past the timeout the only honest verdict is 'suspect'." },
      { code:"    return now > this.#timeout ? \"suspect\" : \"alive\";",
        why:"Compares the clock READING to the timeout instead of the silence: once now itself passes the timeout value, every node in the cluster reads suspect forever, however recently it beat. Staleness is now − t." },
      { code:"    this.#last.set(node, this.#timeout);",
        why:"Records the timeout constant instead of when the beat arrived — every node's 'last beat' is frozen at the same fake instant, so staleness grows with the wall clock and fresh beats refresh nothing." },
    ],
    test:`const fd = new FailureDetector(30);
assert(fd.status("n1", 0) === "unknown", "a node that never beat must read unknown");
fd.beat("n1", 10);
assert(fd.status("n1", 25) === "alive", "15ms of silence with a 30ms timeout must read alive");
assert(fd.status("n1", 40) === "alive", "exactly 30ms of silence is AT the threshold, not past it");
assert(fd.status("n1", 41) === "suspect", "31ms of silence must read suspect");
log("n1: unknown -> alive -> suspect as the silence grows");
fd.beat("n1", 100);
assert(fd.status("n1", 110) === "alive", "a fresh beat must resurrect a suspect back to alive");
assert(fd.status("n2", 110) === "unknown", "a different node with no beats stays unknown");
log("a late beat resurrected n1 - suspicion is a verdict, not a tombstone");`,
    pass:"unknown, alive, suspect — and a late beat resurrected the suspect",
    takeaway:"A failure detector never learns facts, only silence — so it reports suspicion with the timeout as policy, and a single late beat is always allowed to change the verdict.",
    hint:"beat() is one line: store now keyed by node. status() reads the stored time: missing → \"unknown\"; then compare the SILENCE (now − t) against the timeout — strictly greater means \"suspect\", otherwise \"alive\"." },

  { id:"w-backoff", title:"Backoff + jitter — write it", why:"double the patience, randomize the moment", lesson:24,
    spec:"Write the retry loop: call fn and return its result; on failure, count the attempt and rethrow once `tries` attempts have failed. Otherwise compute the window — base doubling per attempt, clamped at cap — and wait either the full window (jitter off) or a uniform random slice of it (jitter on), using the injected wait and random.",
    pre:`async function retryBackoff(fn, { tries, base, cap,
                                  jitter, wait, random }) {`,
    post:`}`,
    lines:[
      "  let attempt = 0;",
      "  for (;;) {",
      "    try { return await fn(); }",
      "    catch (err) {",
      "      if (++attempt >= tries) throw err;",
      "      const ceiling = Math.min(cap, base * 2 ** (attempt - 1));",
      "      await wait(jitter ? Math.floor(random() * ceiling) : ceiling);",
      "    }",
      "  }",
    ],
    distractors:[
      { code:"      await wait(base);",
        why:"A constant delay retries at the same cadence forever — no growing patience while the dependency stays down, and every client that failed together retries together. The window has to double." },
      { code:"      const ceiling = base * 2 ** (attempt - 1);",
        why:"No cap: growth is exponential by design, so by attempt 8 the client sleeps 128× base — a transient blip becomes minutes of dead air. Math.min(cap, …) bounds the worst-case patience." },
      { code:"      if (attempt >= tries) throw err;\n      attempt++;",
        why:"Checks the budget BEFORE counting this failure, so the loop always runs one attempt past tries — and a tries:1 call, meant to try exactly once, retries anyway. Count first (++attempt), then compare." },
    ],
    test:`const delays = [];
const wait = async (ms) => { delays.push(ms); };
let calls = 0;
const flaky = async () => { if (++calls < 3) throw new Error("503"); return "ok"; };
const r = await retryBackoff(flaky, { tries: 5, base: 8, cap: 1000, jitter: false, wait, random: () => 0.5 });
assert(r === "ok", "should return fn's value once it succeeds");
assert(delays.join(",") === "8,16", "plain exponential must wait 8 then 16, waited [" + delays.join(",") + "]");
log("plain: failed twice, waited " + delays.join("ms, ") + "ms, then succeeded");
calls = 0; delays.length = 0;
await retryBackoff(flaky, { tries: 5, base: 8, cap: 1000, jitter: true, wait, random: () => 0.5 });
assert(delays.join(",") === "4,8", "full jitter with r=0.5 must wait half of each window, waited [" + delays.join(",") + "]");
log("jittered (r=0.5): waited " + delays.join("ms, ") + "ms - each client picks its own moment");
calls = 0; delays.length = 0;
let threw = false;
try {
  await retryBackoff(async () => { calls++; throw new Error("down"); },
    { tries: 4, base: 8, cap: 20, jitter: false, wait, random: () => 0.5 });
} catch (e) { threw = true; }
assert(threw, "when every attempt fails, the last error must be rethrown");
assert(calls === 4, "exactly tries invocations - got " + calls);
assert(delays.join(",") === "8,16,20", "the cap must clamp the third wait to 20, waited [" + delays.join(",") + "]");
log("always-failing: 4 attempts, waits [" + delays.join(",") + "] (capped), then the error surfaced");`,
    pass:"waits doubled, the cap clamped, jitter spread the herd, and the budget held exactly",
    takeaway:"Exponential backoff bounds one client's patience, the cap bounds the worst case, jitter decorrelates the crowd — three failure modes, one line each, all three load-bearing.",
    hint:"An infinite for(;;) around try { return await fn(); }. In the catch: pre-increment attempt and compare against tries FIRST (rethrow at the budget), then ceiling = Math.min(cap, base * 2 ** (attempt - 1)), then await wait(jitter ? Math.floor(random() * ceiling) : ceiling)." },

  { id:"w-breaker", title:"Circuit breaker — write it", why:"fail fast, probe once, heal", lesson:25,
    spec:"Write call(fn). Open + inside the cooldown: throw WITHOUT touching fn. Open + cooldown elapsed: go half-open and let this call through as the probe. Success closes the breaker AND resets the failure count. Failure counts toward threshold — and from half-open, a single failure re-opens immediately, restarting the cooldown.",
    pre:`class CircuitBreaker {
  #state = "closed";
  #fails = 0;
  #openedAt = 0;
  constructor({ threshold, cooldown, now }) {
    this.threshold = threshold;
    this.cooldown = cooldown;
    this.now = now;
  }
  get state() { return this.#state; }`,
    post:`}`,
    lines:[
      "  async call(fn) {",
      "    if (this.#state === \"open\") {",
      "      if (this.now() - this.#openedAt < this.cooldown)",
      "        throw new Error(\"open — fast fail\");",
      "      this.#state = \"half-open\";",
      "    }",
      "    try {",
      "      const v = await fn();",
      "      this.#state = \"closed\"; this.#fails = 0;",
      "      return v;",
      "    } catch (err) {",
      "      this.#fails++;",
      "      if (this.#state === \"half-open\" ||",
      "          this.#fails >= this.threshold) {",
      "        this.#state = \"open\"; this.#openedAt = this.now();",
      "      }",
      "      throw err;",
      "    }",
      "  }",
    ],
    distractors:[
      { code:"      if (this.now() - this.#openedAt > this.cooldown)\n        throw new Error(\"open — fast fail\");",
        why:"Inverted: it probes DURING the cooldown — hammering the dying dependency — and fast-fails forever once the cooldown elapses, so the breaker can never heal. Fast-fail while the elapsed time is still < cooldown." },
      { code:"      this.#state = \"closed\";",
        why:"Closes without resetting #fails — the stale count means the first blip after recovery re-opens the breaker instantly, and it keeps flapping open on isolated failures instead of counting to threshold again." },
      { code:"    if (this.#state === \"open\")\n      throw new Error(\"open — fast fail\");",
        why:"Open with no way back: the dependency healed hours ago and every call still fast-fails — recovery now needs a human and a redeploy. The cooldown check + half-open transition is the path home." },
    ],
    test:`let clock = 0;
const now = () => clock;
let hits = 0, healthy = false;
const dep = async () => { hits++; if (!healthy) throw new Error("timeout"); return "data"; };
const cb = new CircuitBreaker({ threshold: 3, cooldown: 50, now });
for (let i = 0; i < 3; i++) await cb.call(dep).catch(() => {});
assert(cb.state === "open", "3 failures at threshold 3 must open the breaker, state is " + cb.state);
assert(hits === 3, "the dependency should have been hit exactly 3 times, got " + hits);
clock = 20;
let fastFailed = false;
await cb.call(dep).catch(() => { fastFailed = true; });
assert(fastFailed && hits === 3, "inside the cooldown the call must fail WITHOUT touching the dependency (hits=" + hits + ")");
log("open: fast-failed at t=20, dependency untouched");
clock = 100; healthy = true;
const v = await cb.call(dep);
assert(v === "data" && cb.state === "closed", "a healthy probe after the cooldown must close the breaker");
log("half-open probe at t=100 succeeded -> closed");
healthy = false;
await cb.call(dep).catch(() => {});
assert(cb.state === "closed", "ONE failure after a clean close must not re-open - the count resets on success");
await cb.call(dep).catch(() => {});
await cb.call(dep).catch(() => {});
assert(cb.state === "open", "three fresh failures must re-open");
clock = 200;
await cb.call(dep).catch(() => {});
assert(cb.state === "open", "a failing half-open probe must re-open immediately");
clock = 210;
const before = hits;
await cb.call(dep).catch(() => {});
assert(hits === before, "after the failed probe, the restarted cooldown must fast-fail again");
log("failing probe at t=200 re-opened and restarted the cooldown");`,
    pass:"opened at threshold, fast-failed cold, probed once, healed — and a bad probe re-opened",
    takeaway:"The breaker is a three-state machine with one subtle edge: half-open exists so recovery is discovered by ONE careful probe instead of the entire backed-up crowd.",
    hint:"Three zones. Top: if open, fast-fail while now() − openedAt < cooldown, else flip to half-open and fall through. Middle: await fn(); success sets closed AND fails = 0. Bottom catch: count the failure; open if half-open OR fails >= threshold, stamping openedAt; always rethrow." },

  { id:"w-hashring", title:"Hash ring — write it", why:"only the departed node's keys may move", lesson:23,
    spec:"Write add(), remove(), and owner(). add(node) pushes `vnodes` points hashed from node + \"#\" + i and keeps the ring sorted by hash. remove(node) drops that node's points. owner(key) walks clockwise to the first point at-or-past the key's hash, wrapping to the first point when the walk runs off the end — so removing a node moves only the keys it owned.",
    pre:`// given: 32-bit FNV-1a — a stable string hash
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
class HashRing {
  #ring = [];   // sorted [{ h, node }]
  constructor(nodes, vnodes) {
    this.vnodes = vnodes;
    nodes.forEach(n => this.add(n));
  }`,
    post:`}`,
    lines:[
      "  add(node) {",
      "    for (let i = 0; i < this.vnodes; i++)",
      "      this.#ring.push({ h: fnv1a(node + \"#\" + i), node });",
      "    this.#ring.sort((a, b) => a.h - b.h);",
      "  }",
      "  remove(node) {",
      "    this.#ring = this.#ring.filter(e => e.node !== node);",
      "  }",
      "  owner(key) {",
      "    const h = fnv1a(key);",
      "    for (const e of this.#ring)",
      "      if (e.h >= h) return e.node;",
      "    return this.#ring[0].node;",
      "  }",
    ],
    distractors:[
      { code:"    return this.#ring[fnv1a(key) % this.#ring.length].node;",
        why:"Modulo placement in a ring costume: change the number of points and nearly EVERY key maps to a different index — the mass reshuffle consistent hashing exists to avoid." },
      { code:"    return null;",
        why:"No wrap-around: every key hashing past the last point on the circle — an entire arc of the keyspace — gets no owner. The ring is a circle; the walk must come back to the first point." },
      { code:"    this.#ring.sort((a, b) => a.h > b.h);",
        why:"A boolean comparator returns true/false (1/0) and never -1, so the sort silently corrupts the order — points land unsorted, and owner()'s clockwise walk returns the wrong node for slices of the keyspace." },
    ],
    test:`const keys = [];
for (let i = 0; i < 50; i++) keys.push("user-" + i);
const ring = new HashRing(["n1", "n2", "n3", "n4"], 8);
const before = new Map(keys.map(k => [k, ring.owner(k)]));
for (const k of keys) {
  assert(before.get(k) != null, "every key must have an owner (wrap-around), " + k + " got none");
  assert(ring.owner(k) === before.get(k), "owner() must be deterministic for " + k);
}
const owners = new Set(before.values());
assert(owners.size > 1, "8 vnodes x 4 nodes must spread 50 keys across nodes, all landed on one");
const pts = [];
for (const n of ["n1", "n2", "n3", "n4"])
  for (let i = 0; i < 8; i++) pts.push({ h: fnv1a(n + "#" + i), node: n });
pts.sort((a, b) => a.h - b.h);
const expect = (k) => { const h = fnv1a(k); const e = pts.find(p => p.h >= h); return (e || pts[0]).node; };
for (const k of keys)
  assert(before.get(k) === expect(k), "owner(" + k + ") must be the FIRST point clockwise from the key's hash - got " + before.get(k) + ", want " + expect(k) + " (is the ring actually sorted?)");
log("50 keys placed across " + owners.size + " nodes, every one on the first point clockwise");
ring.remove("n3");
let moved = 0;
for (const k of keys) {
  const o = ring.owner(k);
  assert(o != null && o !== "n3", k + " must not map to the removed node");
  if (o !== before.get(k)) {
    moved++;
    assert(before.get(k) === "n3", k + " moved but belonged to " + before.get(k) + ", not the removed node - placement is unstable");
  }
}
assert(moved > 0, "the removed node owned some keys - they must move somewhere");
log("n3 removed: " + moved + " keys moved, every one of them was n3's");
const ring2 = new HashRing(["n1", "n2", "n3", "n4"], 8);
for (const k of keys) assert(ring2.owner(k) === before.get(k), "a rebuilt ring must place keys identically");
log("a fresh ring reproduced the original placement exactly");`,
    pass:"placement stable — the departed node's keys moved, everyone else's stayed put",
    takeaway:"Hash the nodes onto the same circle as the keys and ownership becomes geometry: membership changes only redraw the arcs that touched the departed node.",
    hint:"add(): push { h: fnv1a(node + \"#\" + i), node } vnodes times, then sort NUMERICALLY — (a, b) => a.h - b.h; a boolean comparator is a trap. owner(): hash the key, scan the sorted ring for the first e.h >= h, and when the loop falls off the end return this.#ring[0].node — the wrap IS the ring." },

  { id:"w-saga", title:"Saga — write it", why:"no rollback? unwind in reverse", lesson:22,
    spec:"Write run(log). Execute the steps in order; after each success push \"ok:\"+name and remember the step. On the first failure, compensate every COMPLETED step in reverse order — awaiting each undo and logging \"undo:\"+name — then return { ok: false, log }. The failed step itself is never compensated. If every step succeeds, return { ok: true, log }.",
    pre:`class Saga {
  #steps = [];
  step(name, action, compensate) {
    this.#steps.push({ name, action, compensate });
    return this;
  }`,
    post:`}`,
    lines:[
      "  async run(log) {",
      "    const done = [];",
      "    for (const s of this.#steps) {",
      "      try {",
      "        await s.action();",
      "        log.push(\"ok:\" + s.name);",
      "        done.push(s);",
      "      } catch (e) {",
      "        for (const d of done.reverse()) {",
      "          await d.compensate();",
      "          log.push(\"undo:\" + d.name);",
      "        }",
      "        return { ok: false, log };",
      "      }",
      "    }",
      "    return { ok: true, log };",
      "  }",
    ],
    distractors:[
      { code:"        for (const d of done) {",
        why:"Forward-order compensation undoes the foundation first — the itinerary is deleted while the hotel hold that references it still exists. Later steps build on earlier ones: unwind in reverse, like popping a call stack." },
      { code:"        for (const d of [...done, s].reverse()) {",
        why:"Compensates the step that FAILED — but its action never completed, so its undo releases a resource that was never acquired (refunding a charge that never landed). Only completed steps get compensated." },
      { code:"        return { ok: true, log };",
        why:"Returning ok:true from the catch swallows the failure — the caller confirms a trip whose card was declined. The saga compensated correctly and then lied about the outcome." },
    ],
    test:`const s1 = new Saga()
  .step("a", async () => {}, async () => {})
  .step("b", async () => {}, async () => {})
  .step("c", async () => {}, async () => {});
const r1 = await s1.run([]);
assert(r1.ok === true, "all steps succeeded - run must report ok:true");
assert(r1.log.join(",") === "ok:a,ok:b,ok:c", "the log must record every step in order, got " + r1.log.join(","));
log("happy path: " + r1.log.join(" -> "));
const undone = [];
const s2 = new Saga()
  .step("a", async () => {}, async () => { await sleep(2); undone.push("a"); })
  .step("b", async () => {}, async () => { await sleep(2); undone.push("b"); })
  .step("c", async () => { throw new Error("card declined"); },
             async () => { undone.push("c"); });
const r2 = await s2.run([]);
assert(r2.ok === false, "a failed step must report ok:false");
assert(r2.log.join(",") === "ok:a,ok:b,undo:b,undo:a", "compensations must run in REVERSE order, got " + r2.log.join(","));
assert(undone.join(",") === "b,a", "each async compensation must be awaited before the next, got " + undone.join(","));
assert(!undone.includes("c"), "the FAILED step must not be compensated - its action never completed");
log("charge failed: " + r2.log.join(" -> "));
const s3 = new Saga()
  .step("a", async () => { throw new Error("no availability"); },
             async () => { undone.push("a!"); });
const r3 = await s3.run([]);
assert(r3.ok === false && r3.log.length === 0, "first step failed - nothing succeeded, nothing to undo, got [" + r3.log.join(",") + "]");
assert(!undone.includes("a!"), "no undo may fire when nothing completed");
log("first step failed: no orphaned compensations");`,
    pass:"compensations ran in reverse, were awaited, and the failure was reported honestly",
    takeaway:"There is no distributed rollback — a saga replaces it with compensations, and the reverse order is load-bearing: later steps build on earlier ones, so the unwind pops the stack.",
    hint:"Track completed steps in done. Per step: await the action, log ok, push into done. In the catch: iterate done.reverse(), awaiting each compensate and logging undo, then return { ok: false, log }. The ok:true return belongs after the loop — never inside the catch." },
);

})();
