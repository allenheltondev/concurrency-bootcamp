"use strict";
/* Distributed Systems Bootcamp — authored content: course config, module
   registry, quiz, drills, flashcards, spot-the-bug cards, write-it exercises,
   lessons, cross-links.

   CONTENT PACKS: js/packs/*.js load AFTER this file and BEFORE the shared
   engine (../js/app.js). A pack appends content by pushing into these
   collections (LESSONS, QUIZ, DRILLS.<module>, CARDS, BUGHUNT, WRITE, MODULES)
   and registering cross-links in DRILL_LESSON / LESSON_PRACTICE. The engine
   computes totals, permutes choices, and renders only at boot, so anything
   pushed here is a first-class citizen: progress bar, test mode, lesson links
   all include it.

   LESSON PLAN (final indices — the lesson packs MUST keep this order):
     content.js  0-6   foundations (0-3) + time (4-6)
     pack 10     7-15  replication (7-9) + consistency (10-11) + delivery (12-15)
     pack 20     16-26 coordination (16-20) + transactions (21-22) + scale (23-26)
     pack 40     27    testing distributed systems (appended by the cloud map pack)
   Cross-links below reference these final indices. */

/* course config: the engine reads storage keys and defaults here */
const COURSE = {
  id: "distributed-systems",
  storagePrefix: "dsys",
};

const MODULES = [
  { id:"learn", label:"lessons", type:"learn" },
  { id:"model", label:"the model", type:"lesson",
    eyebrow:"module 00", title:"The uncertainty model", conceptLesson:1,
    cardNote:"predict the outcome",
    poolTitle:"Predict the outcome", poolQuestion:"What actually happens?",
    lead:`Two axioms generate this whole field: the network is <b style="color:var(--text)">unreliable</b> (messages get lost, delayed, duplicated, reordered) and there is <b style="color:var(--text)">no shared clock</b> (every node's "now" is a little wrong). Everything else — quorums, clocks, consensus, idempotency — is engineering around those two facts.`,
    sub:`Predict each outcome before you tap. One at a time — answer, read why, then step on.` },
  { id:"primitives", label:"primitives", type:"drills",
    eyebrow:"module 01", title:"Build the primitives",
    lead:`Logical clocks, quorums, heartbeats, leases, fencing tokens, idempotency keys, hash rings, elections. Each is a small rule that stays correct while the network misbehaves. Choose the correct line at each decision point, then run the reference to watch the invariant hold on a simulated cluster.` },
  { id:"netsim", label:"unreliable network", type:"sim", renderFn:"renderNetSimModule",
    eyebrow:"module 02", title:"The unreliable network", conceptLesson:12 },
  { id:"tradeoffs", label:"trade-offs", type:"cards",
    eyebrow:"module 03", title:"Trade-offs", conceptLesson:11,
    lead:`No code here — just the judgment calls that separate deploying distributed systems from understanding them. Tap to flip, then advance. Rehearse until they're reflexive.` },
  { id:"bank", label:"problem bank", type:"drills",
    eyebrow:"module 04", title:"Problem bank",
    lead:`Classic distributed problems, built on the same primitives — sagas, two-phase commit, the outbox, split brain, gossip, read repair. State the invariant in your head before you choose.` },
  { id:"toolkit", label:"resilience kit", type:"drills",
    eyebrow:"module 05", title:"Resilience kit",
    lead:`The patterns interviewers actually probe — backoff with jitter, circuit breakers, hedged requests, timeout budgets, bulkheads, quorum fan-out. Same drill: pick the line that holds the invariant, then run it.` },
  { id:"bughunt", label:"spot the bug", type:"bugs",
    eyebrow:"module 06", title:"Spot the bug",
    lead:`A full distributed component — the quorum store, the idempotent consumer, the circuit breaker, the lease — with one scenario describing how it misbehaves in production and one subtle fault hiding in the implementation. Read the whole thing, tap the buggy line(s), then check.`,
    sub:`Reading real code and finding the fault is the actual job. One implementation at a time — read the scenario, scan the code, pick the line(s), then check.` },
  { id:"write", label:"write it", type:"write",
    eyebrow:"module 07", title:"Write it",
    lead:`No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the implementation, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.`,
    sub:`This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. A hung cluster just times out — the sandbox can't freeze the page.` },
  { id:"test", label:"test yourself", type:"test",
    eyebrow:"test yourself", title:"Test mode",
    lead:`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`,
    sub:`Prep tip: once you can pass these cold, rebuild each pattern in a blank file while talking it through out loud — that's the skill the interview actually grades.` },
];

/* ---- model module: predict-the-outcome quiz ---- */
const QUIZ = [
  { code:`// service A sends B two messages over the network
send(B, "msg 1: reserve seat 14A");
send(B, "msg 2: charge the card");
// the network delays msg 1 by 120ms, msg 2 by 15ms`,
    options:["B processes the charge BEFORE the reservation exists",
             "B receives them in send order — the network preserves ordering",
             "the transport holds msg 2 until msg 1 arrives"],
    answer:0,
    whys:[
      "Right. Independent messages race: msg 2 arrives ~105ms early. Unless you add sequence numbers (or a FIFO channel per sender), receivers must survive out-of-order delivery.",
      "There is no global ordering guarantee between independent messages — each takes its own path with its own delay. Send order is not arrival order; that's the reordering fallacy.",
      "Plain transports don't know msg 2 depends on msg 1 — buffering requires the RECEIVER (or a FIFO session) to track sequence numbers. By default, whatever arrives first is processed first."] },

  { code:`// Lamport clocks, both start at 0
A: tick()          // local event
A: stamp() → m     // send a message
B: tick(); tick()  // two local events
B: recv(m)         // what does B's clock read now?`,
    options:["4 — max(2, 2) + 1","3 — B just adds one to its own clock","2 — B adopts the message's timestamp"],
    answer:0,
    whys:[
      "Right. A ticks to 1, stamps m at 2. B is at 2 after two ticks. The receive rule is max(local, message) + 1 = max(2, 2) + 1 = 4 — receives always land strictly after their sends.",
      "Ignoring the message's timestamp breaks the whole point: if B just ticked to 3 from a lower clock, a receive could stamp EARLIER than its send and happened-before would be violated.",
      "Adopting the sender's value without the max risks the clock going BACKWARDS when the receiver is ahead — and without the +1, send and receive could carry the same timestamp."] },

  { code:`// N=3 replicas, W=1, R=1
await store.put("x", "v2");  // acked by replica A, still
                             // propagating to B and C
const r = await store.get("x");  // answered by replica C`,
    options:["r can be the OLD value — 1 + 1 is not > 3",
             "r is \"v2\" — the write returned success",
             "the read blocks until replication finishes"],
    answer:0,
    whys:[
      "Right. W=1 means success = one replica has it. R=1 means the read believes one replica. A and C don't overlap, so C serves whatever it last saw. R + W must exceed N to force an overlap.",
      "The write's success only promised ONE replica (W=1) durably had it. Success doesn't mean replicated — C may not have heard yet. That's the gap R+W>N exists to close.",
      "Nothing blocks: quorum systems answer from whichever replicas respond. Waiting for full replication would be W=N — a different (and less available) configuration."] },

  { code:`// the client charges a card; the RESPONSE is lost
const r1 = await charge(card, 50);  // server applied it,
                                    // but the ack never arrived
// client times out and retries:
const r2 = await charge(card, 50);`,
    options:["the card is charged twice — unless charge() dedupes on an idempotency key",
             "the server notices the retry is a duplicate automatically",
             "the first charge rolls back when its response is lost"],
    answer:0,
    whys:[
      "Right. A timeout is ambiguity: the work may have happened. Retrying is correct — but only safe if the server can recognize the retry (an idempotency key) and return the recorded answer instead of charging again.",
      "The server can't tell a retry from a new legitimate charge of the same amount unless the CLIENT sends a stable key for the operation. Dedup requires cooperation; it isn't free.",
      "Servers don't know their response was lost — from the server's view, the first charge completed fine. Nothing triggers a rollback. The two requests are unrelated unless you relate them."] },

  { code:`// the same cart, edited on two devices while offline
phone  version: [2, 0]
laptop version: [1, 1]
// (vector clocks: [phone edits, laptop edits])`,
    options:["neither happened before the other — it's a real conflict to resolve",
             "the phone wins — 2 > 1 in the first slot",
             "the laptop wins — it has the newer total"],
    answer:0,
    whys:[
      "Right. [2,0] vs [1,1]: the phone is ahead in slot 0 but behind in slot 1. Neither dominates, so the edits are CONCURRENT — the system must merge, ask the user, or apply a policy. Pretending one 'wins' silently drops a real edit.",
      "Comparing one slot isn't the rule. A version only happened-before another if it's ≤ in EVERY slot. [2,0] isn't ≤ [1,1] and [1,1] isn't ≤ [2,0] — concurrent.",
      "Summing slots throws away exactly the causality the vector encodes. Totals being equal or larger says nothing about whether one version saw the other."] },

  { code:`// heartbeats every 10ms, suspicion timeout 30ms
// node N's last heartbeat arrived 45ms ago
detector.status("N") // → ?`,
    options:["\"suspect\" — N is dead OR slow OR partitioned; you can't know which",
             "\"dead\" — 45ms of silence is past the timeout",
             "\"alive\" — wait for 3 missed beats before judging"],
    answer:0,
    whys:[
      "Right. Silence is the SAME observation whether N crashed, is in a GC pause, or the link dropped. A failure detector can only suspect — which is exactly why actions taken on suspicion (like electing a new leader) need fencing.",
      "No amount of silence proves death — N might be paused and about to wake up believing it's still healthy (that's how split brain starts). Declaring 'dead' with certainty is the classic mistake.",
      "The timeout IS the policy (30ms ≈ 3 missed beats here) and it has fired. The answer isn't to wait more — it's to act while acknowledging the verdict is 'suspect', not 'dead'."] },

  { code:`// 6-node cluster; a partition splits it 3 | 3
// the old leader is in the left half
// both halves run an election. who leads now?`,
    options:["nobody — 3 votes is not a majority of 6, so neither side elects",
             "both halves elect a leader — that's fine, they'll merge later",
             "the left half keeps its leader; the right half elects a new one"],
    answer:0,
    whys:[
      "Right. Majority of 6 is 4. Each half has 3 — no quorum, no leader, no writes. Painful but safe: this is why clusters run an ODD number of nodes, so no split can tie.",
      "Two leaders accepting writes is split brain — the divergence may be impossible to merge (two different customers got the last seat). Quorum exists precisely to make this outcome unreachable.",
      "The old leader can't keep leading without a majority acknowledging it — its lease/term expires when it can't renew against a quorum. Leadership isn't a possession; it's a lease the majority keeps granting."] },

  { code:`// last-writer-wins store; A's wall clock runs 80ms fast
t=0    A writes x = "draft"   (stamps ts = 1080)
t=50   B reads it, then writes x = "final"
       (B's clock is honest:   stamps ts = 50)
// LWW keeps the higher timestamp. what's x?`,
    options:["\"draft\" — B's later write loses to A's fast clock and is silently discarded",
             "\"final\" — B's write really happened after A's",
             "the store rejects B's write as a stale timestamp"],
    answer:0,
    whys:[
      "Right. LWW trusts wall clocks, and A's is 80ms fast — so a write that genuinely happened FIRST carries the bigger timestamp and wins forever. Clock skew turns LWW into silent data loss; that's why ordering wants logical clocks.",
      "It really did happen after — but LWW can't see reality, only timestamps. 1080 > 50, so \"final\" is dropped without an error. Physical truth doesn't help if the tiebreaker is a skewed clock.",
      "LWW stores don't reject anything — resolving by timestamp IS the strategy. The write is accepted and then loses the comparison. No error is ever surfaced; that's what makes the failure so quiet."] },
];

/* ---- drill definitions (fill the blank) ---- */
const DRILLS = {
  primitives:[
    { id:"lamport", title:"Lamport Clock", why:"happened-before without a wall clock", demo:demoLamport,
      pre:`class LamportClock {
  #t = 0;
  tick()  { return ++this.#t; }   // local event
  stamp() { return ++this.#t; }   // stamp an outgoing message
  recv(remote) {`,
      blank:{ q:"A message stamped 7 arrives at a node whose clock reads 3 — and sometimes the other way around. Which body keeps every receive strictly AFTER its send, without ever running the clock backwards?",
        options:[
`    this.#t = Math.max(this.#t, remote) + 1;
    return this.#t;`,
`    this.#t = remote + 1;
    return this.#t;`,
`    this.#t = Math.max(this.#t, remote);
    return this.#t;`],
        answer:0,
        whys:["Right. Take the max of both histories, then advance past it. The receive is now later than the send AND later than everything this node already did.",
              "Adopting remote + 1 ignores the local clock: if this node was already at 9, its clock jumps BACKWARDS to 8, and events it already stamped now look like the future.",
              "Without the +1 the receive can carry the SAME timestamp as the send (max(3,7)=7). Send and receive become 'simultaneous' — happened-before needs the receive strictly after."] },
      post:`  }
  now() { return this.#t; }
}` },

    { id:"vclock", title:"Vector Clock", why:"detect concurrency, not just order", demo:demoVClock,
      pre:`class VectorClock {
  constructor(id, n) { this.id = id; this.v = new Array(n).fill(0); }
  tick()  { this.v[this.id]++; return this.v.slice(); }
  stamp() { this.v[this.id]++; return this.v.slice(); }
  recv(remote) {`,
      blank:{ q:"Two replicas exchange updates and later compare versions to detect conflicts. Which recv() keeps the comparison honest — no missed conflicts, no forgotten history?",
        options:[
`    for (let i = 0; i < this.v.length; i++)
      this.v[i] = Math.max(this.v[i], remote[i]);
    this.v[this.id]++;
    return this.v.slice();`,
`    for (let i = 0; i < this.v.length; i++)
      this.v[i] = Math.max(this.v[i], remote[i]);
    return this.v.slice();`,
`    this.v = remote.slice();
    this.v[this.id]++;
    return this.v.slice();`],
        answer:0,
        whys:["Right. Element-wise max merges both histories, and incrementing your own slot records the receive itself as a new event.",
              "Merging without counting the receive means two different states — 'B before the message' and 'B after it' — carry identical vectors. Comparisons start calling genuinely ordered events 'equal'.",
              "Overwriting with the remote vector throws away every local event the sender hadn't seen — your own recent writes vanish from causality and later compare as conflicts (or worse, as never having happened)."] },
      post:`  }
}
// compare(a, b) → "before" | "after" | "concurrent" | "equal"` },

    { id:"quorum", title:"Quorum Write", why:"R + W > N forces reads to overlap writes", demo:demoQuorum,
      pre:`class QuorumStore {
  constructor(replicas, w, r) {
    this.replicas = replicas; this.w = w; this.r = r;
  }
  async put(key, rec) {
    const settled = await Promise.allSettled(
      this.replicas.map(rep => rep.put(key, rec)));
    const acks = settled.filter(s => s.status === "fulfilled").length;`,
      blank:{ q:"One replica is down mid-write. Which check makes put() report success only when the quorum guarantee actually holds?",
        options:[
`    if (acks < this.w) throw new Error(
      "write failed: " + acks + "/" + this.w + " acks");
    return acks;`,
`    if (acks === 0) throw new Error("write failed");
    return acks;`,
`    if (acks < this.replicas.length) throw new Error(
      "write failed: a replica is down");
    return acks;`],
        answer:0,
        whys:["Right. W acks is the contract R+W>N depends on. Fewer than W and a later R-read might not overlap any replica that has this write — success would be a lie.",
              "One ack 'succeeding' with W=2 breaks the overlap math silently: the write lives on one replica, the read quorum can miss it entirely, and a stale answer comes back with full confidence.",
              "Requiring ALL replicas turns every single-node hiccup into a failed write — you've rebuilt synchronous replication to N and thrown away the availability that quorums buy."] },
      post:`  }
  // get(): read R replicas, return the record
  // with the highest version among them
}` },

    { id:"heartbeat", title:"Failure Detector", why:"silence is evidence, never proof", demo:demoHeartbeat,
      pre:`class FailureDetector {
  #last = new Map();
  constructor(timeout) { this.#timeout = timeout; }
  beat(node, now) { this.#last.set(node, now); }
  status(node, now) {
    const t = this.#last.get(node);
    if (t == null) return "unknown";`,
      blank:{ q:"A node goes quiet — maybe crashed, maybe a 40ms GC pause, maybe a dropped link. Which body reports what the detector can actually know?",
        options:[
`    return (now - t) > this.#timeout
      ? "suspect" : "alive";`,
`    if ((now - t) > this.#timeout) {
      this.#last.delete(node);
      return "dead";
    }
    return "alive";`,
`    return this.#last.has(node)
      ? "alive" : "suspect";`],
        answer:0,
        whys:["Right. Past the timeout the only honest verdict is 'suspect' — the observation is identical whether the node died, paused, or got partitioned. Callers act on suspicion and fence accordingly.",
              "'dead' claims certainty no detector has — the node may be about to wake up still believing it's healthy (that's how split brain starts). And deleting the record erases the evidence: a late beat now reads 'unknown'.",
              "Once-seen-forever-alive: a node that beat once and then crashed stays 'alive' for eternity. The timestamp comparison IS the detector; without it there's nothing here."] },
      post:`  }
}` },

    { id:"lease", title:"Lease + Fencing Token", why:"expiring locks need a way to reject the past", demo:demoLease,
      pre:`class LeaseServer {
  #holder = null; #expires = 0; #token = 0;
  acquire(node, now, ttl) {`,
      blank:{ q:"Holder A stalls in a long GC pause; its lease expires; B asks for the lease. Which body hands B the lease in a way the storage layer can later use to fence A out?",
        options:[
`    if (this.#holder !== null && now < this.#expires)
      return null;
    this.#holder = node; this.#expires = now + ttl;
    return ++this.#token;`,
`    this.#holder = node; this.#expires = now + ttl;
    return ++this.#token;`,
`    if (this.#holder !== null && now < this.#expires)
      return null;
    this.#holder = node; this.#expires = now + ttl;
    return this.#token;`],
        answer:0,
        whys:["Right. Refuse while a live lease exists, and mint a strictly increasing token per grant — downstream writes carry the token, so the paused old holder's writes (small token) get rejected.",
              "Granting without checking expiry gives out overlapping leases — two nodes both hold 'the' lease at once. That's not a lease server; it's a split-brain generator.",
              "Reusing the same token number defeats fencing entirely: when A wakes from its pause, its token equals B's, and storage can't tell the zombie from the rightful holder."] },
      post:`  }
}
// storage side: reject any write whose token is
// lower than the highest token it has seen` },

    { id:"idempotency", title:"Idempotent Consumer", why:"at-least-once delivery + dedupe = effectively once", demo:demoIdempotency,
      pre:`// The broker redelivers: every message can arrive MORE
// than once (its ack may have been lost). msg = { id, ... }
class IdempotentConsumer {
  #seen = new Set();
  applied = 0;
  handle(msg) {`,
      blank:{ q:"A charge message arrives twice — its first ack was lost in flight. Which body applies the charge exactly once?",
        options:[
`    if (this.#seen.has(msg.id)) return false;
    this.#seen.add(msg.id);
    this.applied++;
    return true;`,
`    if (this.#seen.has(msg.id)) return false;
    this.applied++;
    return true;`,
`    if (this.#seen.has(msg.amount)) return false;
    this.#seen.add(msg.amount);
    this.applied++;
    return true;`],
        answer:0,
        whys:["Right. Check the stable message id, record it, then apply. The redelivery hits the guard and drops out — the effect happens once no matter how many times the message arrives.",
              "It checks but never RECORDS — #seen stays empty forever, so every duplicate sails through and the customer is charged once per delivery attempt.",
              "Deduping on the payload instead of the id drops legitimate repeats: two genuinely separate $50 charges look identical. The id is what makes 'same operation retried' distinguishable from 'same-looking new operation'."] },
      post:`  }
}` },

    { id:"hashring", title:"Consistent Hash Ring", why:"membership changes should move ~1/N of keys, not all of them", demo:demoHashRing,
      pre:`class HashRing {
  #ring = [];   // sorted [{ h, node }], vnodes per node
  add(node) {
    for (let i = 0; i < this.vnodes; i++)
      this.#ring.push({ h: hash(node + "#" + i), node });
    this.#ring.sort((a, b) => a.h - b.h);
  }
  owner(key) {
    const h = hash(key);`,
      blank:{ q:"A node leaves the cluster. Which owner() keeps every remaining key's placement stable — so only the departed node's keys move?",
        options:[
`    for (const e of this.#ring)
      if (e.h >= h) return e.node;
    return this.#ring[0].node;`,
`    return this.#ring[h % this.#ring.length].node;`,
`    for (const e of this.#ring)
      if (e.h >= h) return e.node;
    return null;`],
        answer:0,
        whys:["Right. Walk clockwise to the first point at or past the key's hash; wrap to the first point past twelve o'clock. Removing a node only reassigns the arcs that pointed at it.",
              "Indexing by h % ring.length is modulo hashing wearing a ring costume: change the ring size and nearly EVERY key lands on a different index — the mass reshuffle the ring exists to avoid.",
              "No wrap-around: every key hashing past the last point on the circle — an entire arc of the keyspace — gets no owner. The ring is a circle; the walk has to come back around."] },
      post:`  }
}` },

    { id:"election", title:"Leader Election", why:"a leader is a majority's opinion, not a node's", demo:demoElection,
      pre:`function electLeader(nodes, term) {
  const up = nodes.filter(n => n.up);`,
      blank:{ q:"A partition splits the cluster. Which guard makes it impossible for both sides to elect — even when the split is exactly half and half?",
        options:[
`  if (up.length * 2 <= nodes.length)
    return { leader: null, term };`,
`  if (up.length === 0)
    return { leader: null, term };`,
`  if (up.length * 2 < nodes.length)
    return { leader: null, term };`],
        answer:0,
        whys:["Right. Strict majority: reachable × 2 must EXCEED the total. Two disjoint majorities can't exist, so at most one side ever elects — the other stays leaderless on purpose.",
              "Electing whenever anyone is reachable means every fragment of a partition elects its own leader — three fragments, three leaders, three diverging histories. Availability bought with split brain.",
              "The off-by-one that bites at even sizes: with 6 nodes split 3|3, up×2 < 6 is false on BOTH sides, so both proceed to elect. Exactly-half must fail the majority test — hence <=."] },
      post:`  const winner = up.reduce((a, b) => a.id > b.id ? a : b);
  return { leader: winner.id, term: term + 1,
           votes: up.length };
}` },
  ],

  bank:[
    { id:"saga", title:"Saga", why:"no distributed rollback? unwind with compensations", demo:demoSaga,
      pre:`// book trip = reserve flight → reserve hotel → charge card
// each step commits LOCALLY; there is no cross-service rollback
async run(log) {
  const done = [];
  for (const s of this.#steps) {
    try { await s.action(); log.push("ok:" + s.name); done.push(s); }
    catch (e) {`,
      blank:{ q:"The card is declined after the flight and hotel are already booked. Which catch block leaves no orphaned bookings behind?",
        options:[
`      for (const d of done.reverse()) {
        await d.compensate();
        log.push("undo:" + d.name);
      }
      return { ok: false, log };`,
`      for (const d of done) {
        await d.compensate();
        log.push("undo:" + d.name);
      }
      return { ok: false, log };`,
`      return { ok: false, log };`],
        answer:0,
        whys:["Right. Compensate every COMPLETED step in reverse order — unwind the stack you built. Later steps may depend on earlier ones, so you release the hotel before the flight it was booked around.",
              "Forward-order compensation undoes the foundation first: you cancel the flight while the hotel booking that references the itinerary still exists. Reverse dependency order is the rule, same as unwinding a call stack.",
              "Returning without compensating strands the flight and hotel as real, billed reservations for a trip that failed. The compensations ARE the saga — without them this is just a loop that gives up."] },
      post:`    }
  }
  return { ok: true, log };
}` },

    { id:"twophase", title:"Two-Phase Commit", why:"all commit or all abort — never a mix", demo:demoTwoPhase,
      pre:`async function twoPhaseCommit(participants) {
  // phase 1: everyone votes ("yes" = prepared, can commit)
  const votes = await Promise.all(
    participants.map(p => p.prepare()));`,
      blank:{ q:"Two of three participants vote yes; one votes no. Which phase-2 keeps the transaction atomic across all of them?",
        options:[
`  if (votes.every(v => v === "yes")) {
    await Promise.all(participants.map(p => p.commit()));
    return "committed";
  }
  await Promise.all(participants.map(p => p.abort()));
  return "aborted";`,
`  if (votes.some(v => v === "yes")) {
    await Promise.all(participants.map(p => p.commit()));
    return "committed";
  }
  await Promise.all(participants.map(p => p.abort()));
  return "aborted";`,
`  await Promise.all(participants.map((p, i) =>
    votes[i] === "yes" ? p.commit() : p.abort()));
  return "mixed";`],
        answer:0,
        whys:["Right. Unanimity or nothing: any single 'no' aborts EVERYONE, including the nodes that were ready. That's the definition of atomic — the outcome is identical at every participant.",
              "Committing on ANY yes forces the no-voter to commit a transaction it declared it cannot apply — it voted no precisely because its local constraints would break.",
              "Committing the yes-voters while aborting the no-voter is the exact partial state 2PC exists to prevent: the inventory service recorded the sale, the payment service didn't take the money."] },
      post:`}
// the dark side: between prepare and the decision,
// participants are BLOCKED holding locks — if the
// coordinator dies there, they wait for its recovery` },

    { id:"outbox", title:"Transactional Outbox", why:"one transaction, one truth — then publish", demo:demoOutbox,
      pre:`// "save the order AND publish OrderCreated" — two systems,
// and a crash can land between any two lines.
async function createOrder(order) {`,
      blank:{ q:"The process can die after any line. Which body guarantees the event is eventually published if — and only if — the order was saved?",
        options:[
`  await db.transaction(async (tx) => {
    await tx.insert("orders", order);
    await tx.insert("outbox", {
      event: "OrderCreated", payload: order, sent: false });
  });
  // a relay polls the outbox and publishes, marking sent`,
`  await db.insert("orders", order);
  await bus.publish("OrderCreated", order);`,
`  await db.transaction(async (tx) => {
    await tx.insert("orders", order);
    await bus.publish("OrderCreated", order);
  });`],
        answer:0,
        whys:["Right. The event row commits or rolls back WITH the order — one atomic truth. The relay then delivers it (at-least-once, so consumers dedupe). A crash anywhere leaves either both facts or neither.",
              "The dual write: a crash between the insert and the publish leaves an order the rest of the company never hears about — silently, with no record that anything was missed.",
              "The bus isn't part of the database transaction — publish() takes effect immediately, even if the transaction rolls back a line later. Now there's an OrderCreated event for an order that doesn't exist: a ghost."] },
      post:`}` },

    { id:"splitbrain", title:"Fencing the Zombie Leader", why:"the old leader always comes back", demo:demoSplitBrain,
      pre:`// Every elected leader gets a fencing token (strictly
// increasing per grant). Storage tracks the highest seen.
class FencedStore {
  #highest = 0;
  log = [];
  write(token, who, value) {`,
      blank:{ q:"A deposed leader wakes from a pause and keeps writing with its old token. Which body rejects the zombie but never blocks the rightful leader's next write?",
        options:[
`    if (token < this.#highest) return false;
    this.#highest = token;
    this.log.push(who + ":" + value);
    return true;`,
`    if (token <= this.#highest) return false;
    this.#highest = token;
    this.log.push(who + ":" + value);
    return true;`,
`    if (who !== this.currentLeader) return false;
    this.log.push(who + ":" + value);
    return true;`],
        answer:0,
        whys:["Right. Reject anything BELOW the highest token seen; accept equal (the same leader writes many times under one grant). The zombie's stale token loses; the real leader keeps working.",
              "Rejecting token <= highest locks out the legitimate leader's SECOND write — tokens are per-grant, not per-write, so the same token must stay valid for its holder's whole reign.",
              "Asking 'who is the current leader?' is answering a distributed question with local state — the store's opinion of leadership is exactly as stale as the zombie's. The token comparison needs no opinion; bigger wins."] },
      post:`  }
}` },

    { id:"gossip", title:"Gossip", why:"epidemics beat broadcasts — O(log N), no coordinator", demo:demoGossip,
      pre:`// One node learns a fact. Every ROUND, each node that
// knows it tells `+"`fanout`"+` random peers.
function spread(n, fanout) {
  const infected = new Set([0]);
  let rounds = 0;
  while (infected.size < n) {
    rounds++;`,
      blank:{ q:"16 nodes, fanout 2. Which loop body reaches everyone in a handful of rounds — the epidemic, not the lecture?",
        options:[
`    for (const i of [...infected])
      for (let k = 1; k <= fanout; k++)
        infected.add(pickPeer(i, k, rounds));`,
`    for (let k = 1; k <= fanout; k++)
      infected.add(pickPeer(0, k, rounds));`,
`    for (const i of [...infected])
      for (let k = 1; k <= fanout; k++)
        infected.add(pickPeer(i, k, 1));`],
        answer:0,
        whys:["Right. EVERY infected node spreads each round, so the informed set roughly multiplies — 1, 3, 9, 16 done. That compounding is what makes gossip O(log N) and coordinator-free.",
              "Only the origin talks — that's a broadcast from one node, fanout nodes per round: 16 nodes take ~8 rounds and the origin is a single point of failure and a hotspot. The whole point is that everyone relays.",
              "Same peers every round (the round never enters the pick): the infected keep re-telling the same neighbors, the frontier stops moving, and the loop spins forever short of n. Fresh targets each round are what keep the epidemic growing."] },
      post:`  }
  return rounds;
}` },

    { id:"readrepair", title:"Read Repair", why:"reads that heal the replicas they touch", demo:demoReadRepair,
      pre:`// quorum read: collect replies, newest version wins.
// one replica missed the last write and is serving v1.
async getRepair(key) {
  const replies = await readQuorum(key);   // [{value, version}]
  const newest = pickNewest(replies);`,
      blank:{ q:"The read just noticed a replica is behind. Which body returns the right answer AND stops the staleness from living on?",
        options:[
`  await Promise.allSettled(this.replicas.map(
    rep => rep.put(key, newest)));
  return newest;`,
`  return newest;`,
`  await Promise.allSettled(this.replicas.map(
    rep => rep.put(key, { value: newest.value,
      version: newest.version + 1 })));
  return newest;`],
        answer:0,
        whys:["Right. Write the newest record back to every replica (same version — it's a repair, not a new write) and return it. The stale replica converges the moment someone notices it.",
              "Correct answer, wasted knowledge: the read PROVED a replica is stale and then walked away. Next read may hit the stale replica with a weaker quorum — repair-on-read is nearly free right here.",
              "Bumping the version turns a repair into a brand-new write — it races any concurrent real write with the same new version and can clobber it. Repairs re-assert an existing version; they never mint one."] },
      post:`}` },

    { id:"logcommit", title:"Replicated Log Commit", why:"committed = a majority has it, not \"the leader wrote it\"", demo:demoLogCommit,
      pre:`class LogLeader {
  #commitIndex = -1;
  async append(entry) {
    const acks = await this.replicate(entry);  // how many
                                               // replicas accepted`,
      blank:{ q:"One follower is slow, another is partitioned away. Which commit rule makes an acknowledged entry survive any single leader crash?",
        options:[
`    if (acks * 2 > this.replicas.length)
      this.#commitIndex++;
    return { acks, committed: this.#commitIndex };`,
`    if (acks > 0)
      this.#commitIndex++;
    return { acks, committed: this.#commitIndex };`,
`    if (acks === this.replicas.length)
      this.#commitIndex++;
    return { acks, committed: this.#commitIndex };`],
        answer:0,
        whys:["Right. Majority ack means any future leader — elected by a majority — must share at least one replica with this write, so a committed entry can never be elected away.",
              "Committing at one ack means an entry can be 'committed' on the leader alone; the leader dies, a majority that never saw it elects a new leader, and a client's confirmed write silently vanishes.",
              "Waiting for ALL replicas means one slow or partitioned follower freezes commits for the whole cluster — you've made availability hostage to the weakest node. Majority is the deliberate middle."] },
      post:`  }
}` },

    { id:"dlq", title:"Poison Message + DLQ", why:"one bad message must not stall the stream", demo:demoDLQ,
      pre:`// consumer loop; handle(m) throws on a malformed message
while (queue.length) {
  const m = queue.shift();
  try { await handle(m); }
  catch (e) {`,
      blank:{ q:"A malformed message fails on every attempt, forever. Which catch keeps the stream flowing without losing anything silently?",
        options:[
`    if (++m.attempts >= MAX_ATTEMPTS) dlq.push(m);
    else queue.push(m);`,
`    queue.unshift(m);`,
`    // log and move on
    console.error("failed", m.id);`],
        answer:0,
        whys:["Right. Bounded retries, then park it in the dead-letter queue — visible, inspectable, replayable after the bug is fixed. The messages behind it keep flowing.",
              "Retrying immediately at the head of the line is head-of-line blocking as a lifestyle: the poison message spins forever and NOTHING behind it is ever processed again.",
              "Dropping on error is silent at-most-once: the malformed message might be a $40,000 order with a weird character in the address. Losing it with only a log line is data loss wearing a seatbelt."] },
      post:`  }
}` },
  ],

  toolkit:[
    { id:"backoff", title:"Backoff + Jitter", why:"spread retries over time AND across clients", demo:demoBackoff,
      pre:`async function retryBackoff(fn, { tries, base, cap,
                                  wait, random }) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (err) {
      if (++attempt >= tries) throw err;
      const ceiling = Math.min(cap, base * 2 ** (attempt - 1));`,
      blank:{ q:"A dependency hiccups and 10,000 clients all saw the same failure at the same instant. Which wait keeps them from re-arriving as one synchronized wave?",
        options:[
`      await wait(Math.floor(random() * ceiling));`,
`      await wait(ceiling);`,
`      await wait(ceiling + Math.floor(random() * 10));`],
        answer:0,
        whys:["Right. Full jitter: each client sleeps a UNIFORM random slice of the window, so the herd smears into a trickle. The exponential ceiling still bounds total patience.",
              "Deterministic backoff keeps the herd perfectly synchronized — 10,000 clients that failed together retry together, at 8ms, then 16, then 32: repeated coordinated stampedes on a recovering service.",
              "±10ms of jitter on a multi-second window decorrelates nothing — the wave arrives 10ms wide instead of 0ms wide. The randomness has to span the WHOLE window to spread the load."] },
      post:`    }
  }
}` },

    { id:"circuitbreaker", title:"Circuit Breaker", why:"stop hammering what's already drowning", demo:demoCircuitBreaker,
      pre:`class CircuitBreaker {
  #state = "closed"; #fails = 0; #openedAt = 0;
  async call(fn) {
    if (this.#state === "open") {`,
      blank:{ q:"The breaker opened during an outage 5 minutes ago; the dependency has long since recovered. Which body finds that out — without slamming it with full traffic to check?",
        options:[
`      if (this.now() - this.#openedAt < this.cooldown)
        throw new Error("open — fast fail");
      this.#state = "half-open";   // let ONE probe through`,
`      throw new Error("open — fast fail");`,
`      if (this.now() - this.#openedAt >= this.cooldown)
        this.#state = "closed";
      else throw new Error("open — fast fail");`],
        answer:0,
        whys:["Right. Fast-fail during the cooldown, then half-open: exactly one probe goes through. Success closes the breaker; failure re-opens it and the cooldown restarts. Recovery is discovered gently.",
              "Open forever: the dependency healed hours ago and you're still failing every request. A breaker with no path back to closed needs a human and a deploy to recover — that's an incident, not a pattern.",
              "Snapping straight to closed sends 100% of traffic at a dependency you last observed mid-collapse — if it's still sick (or barely recovering), you knock it right back down. The probe exists to ask before the crowd arrives."] },
      post:`    }
    try { const v = await fn();
          this.#state = "closed"; this.#fails = 0; return v; }
    catch (err) {
      this.#fails++;
      if (this.#state === "half-open" ||
          this.#fails >= this.threshold) {
        this.#state = "open"; this.#openedAt = this.now();
      }
      throw err;
    }
  }
}` },

    { id:"hedge", title:"Hedged Request", why:"a second bet against the p99 tail", demo:demoHedge,
      pre:`function hedged(taskFactory, hedgeAfter) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const attempt = (which) => {
      taskFactory(which).then(v => {
        if (!settled) { settled = true;
          resolve({ value: v, by: which }); }
      }, onError);
    };
    attempt("primary");`,
      blank:{ q:"Most requests take 8ms; the p99 takes 300ms. Which line clips the tail without doubling the load on every request?",
        options:[
`    sleep(hedgeAfter).then(() => {
      if (!settled) attempt("hedge");
    });`,
`    attempt("hedge");`,
`    taskFactory("primary").then(() => {
      if (!settled) attempt("hedge");
    });`],
        answer:0,
        whys:["Right. The hedge fires only if the primary is still unresolved after the delay — set hedgeAfter near the p95 and only the slowest ~5% of requests ever pay for a second attempt.",
              "Hedging immediately doubles the fleet's load on EVERY request to speed up the 1% — the retry-budget math collapses, and under stress the extra load makes the tail worse, not better.",
              "This starts a SECOND primary and waits for it to finish before hedging — the hedge can only ever fire after a full primary round-trip, which is precisely the latency you were trying to cut."] },
      post:`  });
}` },

    { id:"timeoutbudget", title:"Timeout Budget", why:"deadlines travel with the request", demo:demoTimeoutBudget,
      pre:`// edge gave this request a 50ms budget; service A spent
// 35ms; now A calls B, whose default timeout is 40ms.
async function callDownstream(deadline, defaultTimeout, work) {`,
      blank:{ q:"The caller will give up in 15ms, no matter what. Which body stops B from happily working for 40?",
        options:[
`  const allow = Math.min(defaultTimeout,
                          deadline.remaining());
  if (allow <= 0) throw new Error("deadline exceeded");
  return await withTimeout(work, allow);`,
`  return await withTimeout(work, defaultTimeout);`,
`  if (deadline.expired()) throw new Error("deadline exceeded");
  return await withTimeout(work, defaultTimeout);`],
        answer:0,
        whys:["Right. Offer downstream the REMAINING budget (never more than its own default). Every hop inherits the caller's patience, and nobody burns cycles on an answer that can no longer be delivered.",
              "Using the local default means B works for up to 40ms on a request whose caller gave up at 15 — orphaned work that still occupies threads, connections, and downstream capacity. Multiply by every hop and every retry.",
              "Checking expiry once at the door and then granting the full default is the same bug with a bouncer: 15ms of budget remain, B still gets a 40ms allowance and overruns the caller by 25ms."] },
      post:`}` },

    { id:"bulkhead", title:"Bulkhead", why:"partition the ship so one flood can't sink it", demo:demoBulkhead,
      pre:`class Bulkhead {
  #inflight = 0; #queue = [];
  constructor(limit, maxQueue) {
    this.limit = limit; this.maxQueue = maxQueue;
  }
  async run(fn) {
    if (this.#inflight >= this.limit) {`,
      blank:{ q:"The recommendations service goes slow and every caller piles in behind it. Which body keeps that flood from spreading to the rest of your service?",
        options:[
`      if (this.#queue.length >= this.maxQueue)
        throw new Error("rejected — bulkhead full");
      const d = deferred();
      this.#queue.push(d);
      await d.promise;`,
`      const d = deferred();
      this.#queue.push(d);
      await d.promise;`,
`      throw new Error("rejected — bulkhead full");`],
        answer:0,
        whys:["Right. A small bounded queue absorbs a burst; past that, reject INSTANTLY. Callers get a fast 'no' (degrade, fallback, shed) instead of a slow one, and the slow dependency drowns alone.",
              "An unbounded queue converts 'the dependency is slow' into 'every caller in the building is parked waiting' — memory grows, latency compounds, and the outage propagates through the very waiting that was meant to absorb it.",
              "Zero queue rejects on any instantaneous burst even when the dependency is healthy — two simultaneous arrivals and one gets a failure. A small buffer for jitter, then rejection, is the calibrated version."] },
      post:`    }
    this.#inflight++;
    try { return await fn(); }
    finally {
      this.#inflight--;
      const n = this.#queue.shift(); if (n) n.resolve();
    }
  }
}` },

    { id:"fanout", title:"Quorum Fan-out", why:"resolve at the Nth success — the tail is not invited", demo:demoFanout,
      pre:`// query all 5 replicas, need any 3 answers
function firstN(taskFns, need) {
  return new Promise((resolve, reject) => {
    const wins = []; let fails = 0;
    taskFns.forEach(fn =>
      Promise.resolve().then(fn).then(`,
      blank:{ q:"One replica is down and one is having a 900ms day. Which handlers assemble the answer at the third success — and only give up when success is impossible?",
        options:[
`        v => { wins.push(v);
               if (wins.length === need)
                 resolve(wins.slice()); },
        () => { if (++fails > taskFns.length - need)
                  reject(new Error("quorum impossible")); }`,
`        v => { wins.push(v);
               if (wins.length === taskFns.length)
                 resolve(wins.slice()); },
        () => reject(new Error("a replica failed"))`,
`        v => { wins.push(v);
               resolve(wins.slice()); },
        () => { if (++fails > taskFns.length - need)
                  reject(new Error("quorum impossible")); }`],
        answer:0,
        whys:["Right. Resolve the moment the Nth success lands — the straggler's answer is welcome but not awaited. Reject only when so many failed that N successes can no longer happen.",
              "Waiting for ALL and rejecting on the FIRST failure inverts both halves: the down replica instantly fails a read that four healthy replicas could have served, and the 900ms straggler sets your latency floor.",
              "Resolving at the FIRST success returns a 1-replica answer when the caller asked for a 3-replica quorum — the overlap guarantee (and any stale-read protection) quietly evaporates."] },
      post:`      ));
  });
}` },
  ],
};

/* ---- flashcards: the judgment calls ---- */
const CARDS = [
  ["Synchronous vs asynchronous replication — the one-line trade?","Sync: the write waits for replicas — slower, but an acked write survives the leader's death. Async: fast acks, but a leader crash loses the tail of acknowledged writes. Quorums (W of N) are the dial between them."],
  ["Why do clusters have 3, 5, or 7 nodes — never 4 or 6?","Majorities. 4 nodes tolerate 1 failure (majority 3) — same as 3 nodes, but with more hardware and a 2|2 split that can't elect. Even nodes add cost without adding fault tolerance."],
  ["When is a queue the wrong answer?","When the caller needs the result now (a queue adds latency and an async reply path), when ordering across the whole stream matters (queues scale by partition), or when the backlog would just hide a permanently slower consumer. A queue buys burst absorption, not throughput."],
  ["What does 'exactly-once delivery' actually mean when a vendor claims it?","At-least-once delivery plus deduplication at the consumer — effectively-once PROCESSING. The network can always duplicate a message whose ack was lost; the only question is whether something dedupes before the effect."],
  ["Timeout fired. What do you actually know?","Nothing about the operation — it may have succeeded, failed, or still be running. A timeout is a decision to stop WAITING, not evidence about what happened. That ambiguity is why safe retries need idempotency."],
  ["Why full jitter instead of exponential backoff alone?","Backoff spreads ONE client's retries over time; it does nothing about 10,000 clients that failed at the same instant and now retry on the same schedule. Randomizing the whole wait window decorrelates the herd."],
  ["Retry budget: when should a client NOT retry?","When the error says the request can never succeed (4xx validation), when the deadline is already spent, when the failure is overload (retries feed the fire — respect Retry-After / breaker state), or when the operation isn't idempotent and there's no dedupe key."],
  ["What makes a partition WORSE than a crash?","Both sides keep running. A crashed node does nothing; a partitioned node keeps serving stale reads and accepting writes it may have no right to accept. That's why 'is it dead or just unreachable?' matters — and why fencing exists."],
  ["CAP in one honest sentence?","During a partition you choose: refuse some requests (consistency) or serve possibly-stale data (availability) — and when there's no partition, the real trade is latency vs consistency (that's the PACELC extension)."],
  ["Lease vs lock — why do distributed locks expire?","A holder that crashes while holding a non-expiring lock deadlocks the system forever. So distributed locks are leases: they expire. Which creates the NEXT problem — a paused holder that outlives its lease — which is why every lease needs a fencing token."],
  ["Why isn't a fencing token just the holder's name?","Names don't order events; tokens do. The storage layer can't know who the 'current' leader is (its view is stale too) — but it can compare a monotonic token to the highest it has seen and reject the past. No clock, no membership view, just an integer."],
  ["Hot partition: your hash spread the keys evenly. What went wrong?","Even key spread ≠ even LOAD spread. One celebrity key (one tenant, one device) can carry most of the traffic. Fixes are key-level: split the hot key (append a shard suffix), cache it in front, or isolate that tenant."],
  ["Read-your-writes is broken for a user. What's the usual cause?","Their write went to the leader; their next read hit an async replica that hadn't caught up. Fix by pinning the session to the leader (or to a replica at ≥ the write's position), or by reading with a quorum that overlaps the write."],
  ["When is 2PC the right call — and when a saga?","2PC when participants can hold locks briefly and you control both (short, low-contention, same trust domain). Sagas when steps span services or seconds: each commits locally and compensations undo — you trade isolation for availability and design the 'undo' explicitly."],
  ["An event was published but the DB write rolled back. What pattern was missing?","The transactional outbox. Publishing mid-transaction isn't transactional — the bus doesn't roll back. Write the event to an outbox table in the SAME transaction, and let a relay publish it afterwards (at-least-once, consumers dedupe)."],
  ["Backpressure vs buffering — what's the difference in an incident?","Buffering hides overload: queues grow, latency climbs, and the crash comes later, bigger. Backpressure pushes the slowdown to the source: bounded queues reject or block producers early. Capacity you enforce beats capacity you discover."],
  ["The dashboard says p50 = 4ms. Why does the product still feel slow?","Fan-out: a page touching 100 services experiences the SLOWEST of 100 samples — at p50 each, almost every page hits several p99s. Tail latency compounds; that's why hedging, timeouts, and 'resolve at N of M' target the p99, not the median."],
  ["Idempotency key: what makes a GOOD one?","Stable across retries of the same logical operation, unique across different operations, and chosen by the CALLER (order id + attempt-independent intent, like \"charge-order-4123\"). A timestamp or random-per-attempt value is exactly wrong — every retry looks new."],
];

/* ---- spot-the-bug: real code, one broken scenario, tap the faulty line(s) ---- */
const BUGHUNT = [
  { id:"bug_quorum", title:"Quorum store", why:"the read must overlap the write", lesson:8,
    scenario:"N=3, W=2, R=2. Writes report success honestly, but reads occasionally return a value that was overwritten seconds ago — always when the laggard replica answers fastest. Which line serves the stale value?",
    lines:[
      "class QuorumStore {",
      "  constructor(replicas, w, r) {",
      "    this.replicas = replicas;",
      "    this.w = w;",
      "    this.r = r;",
      "  }",
      "",
      "  async put(key, rec) {",
      "    const settled = await Promise.allSettled(",
      "      this.replicas.map(rep => rep.put(key, rec)));",
      "    const acks = settled",
      "      .filter(s => s.status === \"fulfilled\").length;",
      "    if (acks < this.w)",
      "      throw new Error(\"write failed: \" + acks + \" acks\");",
      "    return acks;",
      "  }",
      "",
      "  async get(key) {",
      "    const replies = await this.collect(key, this.r);",
      "    return replies[0].value;",
      "  }",
      "",
      "  async collect(key, r) {",
      "    // resolves with the first r successful replies,",
      "    // in arrival order",
      "    return firstN(this.replicas.map(",
      "      rep => () => rep.get(key)), r);",
      "  }",
      "}",
    ],
    bug:[19],
    explain:"Line 20 returns the FIRST reply of the quorum instead of the newest. R+W>N only guarantees the read set OVERLAPS the write set — at least one of the R replies has the latest version, but it isn't necessarily the fastest to answer. A quorum read must compare versions across all R replies and return the record with the highest one." },

  { id:"bug_idempotent", title:"Idempotent consumer", why:"record before the gap, not after", lesson:13,
    scenario:"Duplicates are usually dropped correctly — but under load, a redelivered charge that arrives while the original is still being processed gets applied twice. Which line opens the window?",
    lines:[
      "class ChargeConsumer {",
      "  #seen = new Set();",
      "  applied = 0;",
      "",
      "  async handle(msg) {",
      "    if (this.#seen.has(msg.id)) {",
      "      return false;              // duplicate — drop",
      "    }",
      "    await chargeCard(msg.card, msg.amount);",
      "    this.#seen.add(msg.id);",
      "    this.applied++;",
      "    return true;",
      "  }",
      "}",
    ],
    bug:[9],
    explain:"Line 10 records the id AFTER the awaited charge. Between the check on line 6 and the add on line 10 the consumer yields at the await — a concurrent redelivery of the same id passes the #seen check (it isn't recorded yet) and charges again. Record the id BEFORE the side effect (and undo it on failure), or hold a per-key lock across the check-then-act. Same shape as any check-then-act race across an await — the network just supplies the duplicates." },

  { id:"bug_breaker", title:"Circuit breaker", why:"open must mean fast-fail — then heal", lesson:25,
    scenario:"When the dependency starts failing, callers keep hammering it right through the 'open' state — and once the outage ends, the breaker fails fast forever until someone redeploys. One comparison produces both symptoms. Which line?",
    lines:[
      "class CircuitBreaker {",
      "  #state = \"closed\";",
      "  #fails = 0;",
      "  #openedAt = 0;",
      "",
      "  async call(fn) {",
      "    if (this.#state === \"open\") {",
      "      if (this.now() - this.#openedAt > this.cooldown)",
      "        throw new Error(\"open — fast fail\");",
      "      this.#state = \"half-open\";",
      "    }",
      "    try {",
      "      const v = await fn();",
      "      this.#state = \"closed\";",
      "      this.#fails = 0;",
      "      return v;",
      "    } catch (err) {",
      "      this.#fails++;",
      "      if (this.#state === \"half-open\" ||",
      "          this.#fails >= this.threshold) {",
      "        this.#state = \"open\";",
      "        this.#openedAt = this.now();",
      "      }",
      "      throw err;",
      "    }",
      "  }",
      "}",
    ],
    bug:[7],
    explain:"Line 8 has the comparison inverted: it fast-fails when the cooldown HAS elapsed and goes half-open while it hasn't. So during the outage every call sails through to the dying dependency (half-open immediately), and after recovery — once now − openedAt exceeds the cooldown — the breaker throws forever. It should fast-fail while (now − openedAt) < cooldown, and only then let a probe through." },
];

/* ===========================================================
   WRITE IT — assemble the implementation from a shuffled line
   bank. Grading is honest: the assembled code actually RUNS
   against assertions in a sandboxed worker.
   =========================================================== */
const WRITE = [
  { id:"w-lamport", title:"Lamport clock — write it", why:"max, then step past it", lesson:4,
    spec:"Write all three methods. tick() advances the clock for a local event and returns it. stamp() does the same for an outgoing message. recv(remote) merges an incoming message's timestamp so the receive lands strictly after both the send and everything local, and returns the new time.",
    pre:`class LamportClock {
  #t = 0;`,
    post:`  now() { return this.#t; }
}`,
    lines:[
      "  tick() {",
      "    return ++this.#t;",
      "  }",
      "  stamp() {",
      "    return ++this.#t;",
      "  }",
      "  recv(remote) {",
      "    this.#t = Math.max(this.#t, remote) + 1;",
      "    return this.#t;",
      "  }",
    ],
    distractors:[
      { code:"    return this.#t++;",
        why:"Post-increment returns the OLD value — two consecutive events can observe the same timestamp, and 'strictly after' quietly becomes 'at the same time'." },
      { code:"    this.#t = remote + 1;",
        why:"Ignores the local clock: a receiver that was already ahead jumps BACKWARDS, and its earlier events now sit in the future. The merge must take the max of both histories first." },
      { code:"    this.#t = Math.max(this.#t, remote);",
        why:"Merges but never advances — the receive carries the same timestamp as the send. The +1 is what makes the receive a new event that happened after." },
    ],
    test:`const A = new LamportClock(), B = new LamportClock();
assert(A.tick() === 1, "first local event should stamp 1");
const m = A.stamp();
assert(m === 2, "the send should advance A to 2, got " + m);
B.tick(); B.tick(); B.tick();
const r = B.recv(m);
log("B was at 3, received a message stamped 2 -> " + r);
assert(r === 4, "recv must be max(3,2)+1 = 4, got " + r);
const m2 = B.stamp();
assert(m2 === 5, "B's reply should stamp 5, got " + m2);
const r2 = A.recv(m2);
log("A was at 2, received a message stamped 5 -> " + r2);
assert(r2 === 6, "recv must be max(2,5)+1 = 6, got " + r2);
assert(A.now() === 6 && B.now() === 5, "now() must report without advancing");
const low = B.recv(1);
assert(low === 6, "a stale message must never move the clock backwards (max(5,1)+1 = 6)");`,
    pass:"every receive landed strictly after its send, and stale messages never rewound the clock",
    takeaway:"One integer and one rule — merge with max, then increment — is enough to give a cluster a consistent notion of 'before' without any wall clock.",
    hint:"tick() and stamp() are the same operation: pre-increment and return. recv() is the only merge: take the max of the local clock and the message's stamp, add one, store it, return it." },

  { id:"w-quorum", title:"Quorum write — write it", why:"count acks, honor W, tolerate the down replica", lesson:8,
    spec:"Write the quorum write: send the record to EVERY replica concurrently, tolerate individual failures, count the successful acks, and succeed only if at least `w` replicas acknowledged — otherwise throw. Return the ack count.",
    pre:`async function quorumPut(replicas, w, key, rec) {`,
    post:`}`,
    lines:[
      "  const settled = await Promise.allSettled(",
      "    replicas.map(rep => rep.put(key, rec)));",
      "  const acks = settled",
      "    .filter(s => s.status === \"fulfilled\").length;",
      "  if (acks < w)",
      "    throw new Error(\"write failed: \" + acks + \"/\" + w);",
      "  return acks;",
    ],
    distractors:[
      { code:"  const settled = await Promise.all(\n    replicas.map(rep => rep.put(key, rec)));",
        why:"Promise.all rejects on the FIRST down replica — a single unreachable node fails every write, which is exactly the availability quorums exist to preserve. allSettled tolerates the failures and lets you count." },
      { code:"  const acks = settled.length;",
        why:"Counts every OUTCOME as an ack — three replicas that all threw still 'ack' 3. The filter for fulfilled is what separates acknowledgment from mere attempt." },
      { code:"  if (acks === 0)\n    throw new Error(\"write failed: no acks\");",
        why:"Succeeding below W silently voids the R+W>N overlap: the write lives on fewer replicas than the read quorum is guaranteed to intersect, so a later read can miss it entirely while everyone believes it succeeded." },
    ],
    test:`const mkRep = (up) => ({
  put: async () => { await sleep(2); if (!up) throw new Error("unreachable"); return true; }
});
const acks = await quorumPut([mkRep(true), mkRep(false), mkRep(true)], 2, "k", { value: "v1", version: 1 });
log("write with 1 of 3 replicas down: " + acks + " acks (W=2)");
assert(acks === 2, "should succeed with exactly the 2 reachable acks, got " + acks);
let threw = false;
try { await quorumPut([mkRep(true), mkRep(false), mkRep(false)], 2, "k", { value: "v2", version: 2 }); }
catch (e) { threw = true; }
assert(threw, "1 ack with W=2 must throw - success below quorum breaks R+W>N");
log("write with 2 of 3 replicas down correctly failed");
const all = await quorumPut([mkRep(true), mkRep(true), mkRep(true)], 2, "k", { value: "v3", version: 3 });
assert(all === 3, "healthy cluster should report all 3 acks, got " + all);`,
    pass:"quorum honored: down replicas tolerated, below-W writes refused",
    takeaway:"allSettled + count + compare against W is the whole pattern: tolerate individual failures, but never claim a durability level the ack count can't back up.",
    hint:"Fan out with Promise.allSettled (never Promise.all — one down replica must not fail the write). Count status === \"fulfilled\". Throw if the count is below w; otherwise return it." },

  { id:"w-idempotent", title:"Idempotent consumer — write it", why:"close the duplicate window before the await", lesson:13,
    spec:"Write handle(msg): apply each message id's side effect exactly once, even when the SAME id is redelivered concurrently (two handle() calls in flight at once). Return true if this call applied the effect, false for a duplicate. The side effect is the provided `await apply(msg)`.",
    pre:`class IdempotentConsumer {
  #seen = new Set();
  applied = 0;`,
    post:`}`,
    lines:[
      "  async handle(msg, apply) {",
      "    if (this.#seen.has(msg.id)) return false;",
      "    this.#seen.add(msg.id);",
      "    await apply(msg);",
      "    this.applied++;",
      "    return true;",
      "  }",
    ],
    distractors:[
      { code:"    await apply(msg);\n    this.#seen.add(msg.id);",
        why:"Recording AFTER the await leaves a window: a concurrent redelivery of the same id passes the #seen check while the first apply is still in flight — double charge. Claim the id BEFORE yielding." },
      { code:"    if (this.applied > 0) return false;",
        why:"Gates on whether ANYTHING was ever applied, not on this message's id — the consumer processes exactly one message in its lifetime and drops every different message after it." },
      { code:"    this.#seen.add(msg.amount);",
        why:"Dedupes by payload: two legitimately distinct charges for the same amount collide, and the second customer's order is silently dropped. The idempotency key is the id, chosen to be unique per logical operation." },
    ],
    test:`const c = new IdempotentConsumer();
const apply = async () => { await sleep(4); };
const r1 = await c.handle({ id: "chg-1", amount: 50 }, apply);
const r2 = await c.handle({ id: "chg-1", amount: 50 }, apply);
assert(r1 === true && r2 === false, "sequential duplicate must be dropped");
assert(c.applied === 1, "sequential duplicate applied " + c.applied + " times (want 1)");
log("sequential redelivery of chg-1 dropped");
const [a, b] = await Promise.all([
  c.handle({ id: "chg-2", amount: 75 }, apply),
  c.handle({ id: "chg-2", amount: 75 }, apply),
]);
assert(c.applied === 2, "CONCURRENT duplicate applied twice - record the id before the await");
assert((a ? 1 : 0) + (b ? 1 : 0) === 1, "exactly one of the two concurrent deliveries should win");
log("concurrent redelivery of chg-2: only one applied");
const r3 = await c.handle({ id: "chg-3", amount: 50 }, apply);
assert(r3 === true && c.applied === 3, "a DIFFERENT id with the same amount must still apply");`,
    pass:"exactly-once effects held — even against a concurrent duplicate",
    takeaway:"The dedupe set is a lock in disguise: claiming the id synchronously, before the first await, is what closes the check-then-act window the redelivery exploits.",
    hint:"Three beats: check #seen (return false on a hit), add the id immediately — synchronously, before any await — then perform the effect and count it." },
];

/* ===========================================================
   LESSONS — arcs: foundations (0-3), time (4-6). The replication,
   coordination, and scale arcs are appended by the lesson packs;
   see the LESSON PLAN at the top of this file.
   =========================================================== */
const LESSONS = [
  { eb:"lesson 01 · foundations", title:"One computer becomes many", html:`
    <p class="big">You distribute a system for exactly three reasons: the data outgrows one machine, the traffic outgrows one machine, or one machine's failure is an outage you can't accept. Everything you gain is bought with one new problem: <b class="hl">partial failure</b>.</p>
    <p>On a single computer, things fail <i>completely</i> — the process dies, you restart it. In a distributed system, <b class="hl">some</b> nodes are down, <b class="hl">some</b> links are dropping packets, and the rest are fine — all at once, all the time. The system is never fully healthy and never fully broken.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one request &middot; three replicas &middot; one is having a bad day</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="55" width="76" height="40" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="48" y="72" fill="#8e86f0" font-size="9" text-anchor="middle">CLIENT</text>
        <text x="48" y="86" fill="#8b90ab" font-size="8" text-anchor="middle">needs an answer</text>
        <rect x="244" y="8" width="86" height="34" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="287" y="29" fill="#57e0b0" font-size="9" text-anchor="middle">REPLICA A ✓</text>
        <rect x="244" y="58" width="86" height="34" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="287" y="79" fill="#57e0b0" font-size="9" text-anchor="middle">REPLICA B ✓</text>
        <rect x="244" y="108" width="86" height="34" rx="8" fill="#11131c" stroke="#ff9a6b" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="287" y="129" fill="#ff9a6b" font-size="9" text-anchor="middle">REPLICA C ✗</text>
        <line x1="86" y1="66" x2="244" y2="25" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="86" y1="75" x2="244" y2="75" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="86" y1="84" x2="244" y2="125" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.25;0.5;1" keyPoints="0;1;1;1" path="M 86 66 L 244 25"/>
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.5;0.55;1" values="1;1;0;0"/>
        </circle>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.25;0.5;1" keyPoints="0;1;1;1" path="M 86 75 L 244 75"/>
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.5;0.55;1" values="1;1;0;0"/>
        </circle>
        <circle r="6" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.25;0.42;1" keyPoints="0;1;1;1" path="M 86 84 L 170 105"/>
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.25;0.4;0.42;1" values="1;1;.6;0;0"/>
        </circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">plan A</div><div class="lstep bad seq" style="--i:0">wait for all three &rarr; C's failure is now YOUR failure</div>
        <div class="lanehead seq" style="--i:1">plan B</div><div class="lstep good seq" style="--i:1">wait for a majority (2 of 3) &rarr; C fails, nobody notices</div>
      </div>
      <div class="dnote seq" style="--i:2">The whole discipline in one move: design so the system keeps its promises <b style="color:var(--ordered)">while parts of it are failing</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>That reframing changes what "correct" means. A single-machine program is correct if it computes the right answer. A distributed system is correct only if it computes the right answer <b class="hl">while some of its parts are down, slow, or unreachable</b> — because at any real scale, they always are.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the shape of tolerance: ask everyone, need only most</div>
      <pre class="code"><span class="cm">// fragile: one dead replica fails the whole read</span>
const answers = await Promise.all(replicas.map(r =&gt; r.get(key)));

<span class="cm">// tolerant: collect what arrives, act on a majority</span>
const settled = await Promise.allSettled(replicas.map(r =&gt; r.get(key)));
const answers2 = settled.filter(s =&gt; s.status === "fulfilled");
if (answers2.length &gt;= 2) <span class="ok">serve(newestOf(answers2));</span>
else throw new Error("not enough replicas reachable");</pre>
    </div>
    <p><b class="hl">Why it matters:</b> every pattern in this course — quorums, retries, leases, sagas, circuit breakers — is a different answer to the same question: <i>what does this component do when the thing it depends on doesn't answer?</i> Ask that question relentlessly and you're doing distributed systems.</p>` },

  { eb:"lesson 02 · foundations", title:"The network is not reliable", html:`
    <p class="big">Between any two nodes sits a network, and the network makes exactly <b class="hl">zero</b> promises. A message you send can be <b class="hl">delivered</b>, <b class="hl">lost</b>, <b class="hl">delayed</b>, <b class="hl">duplicated</b>, or <b class="hl">reordered</b> — and the sender cannot tell which happened.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">five fates of a message &middot; A sends, B may or may not receive</div>
      <svg class="estage" viewBox="0 0 340 168" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="62" width="60" height="40" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="40" y="86" fill="#8e86f0" font-size="10" text-anchor="middle">A</text>
        <rect x="270" y="62" width="60" height="40" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="300" y="86" fill="#57e0b0" font-size="10" text-anchor="middle">B</text>
        <rect x="120" y="8" width="100" height="148" rx="10" fill="none" stroke="#2c3350" stroke-dasharray="4 5"/>
        <text x="170" y="22" fill="#6a7090" font-size="8" text-anchor="middle">THE NETWORK</text>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.18;1" keyPoints="0;1;1" path="M 70 74 L 270 74"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.18;0.22;1" values="1;1;0;0"/>
        </circle>
        <circle r="6" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.2;0.38;1" keyPoints="0;0;0.55;0.55" path="M 70 88 L 270 88"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.2;0.36;0.4;1" values="0;1;.7;0;0"/>
        </circle>
        <text x="182" y="102" fill="#ff9a6b" font-size="8" opacity="0">✗ lost
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.38;0.42;0.6;0.62;1" values="0;0;1;1;0;0"/></text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.45;0.98;1" keyPoints="0;0;1;1" path="M 70 74 L 270 74"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.45;0.5;0.97;1" values="0;0;1;1;0"/>
        </circle>
        <text x="170" y="132" fill="#8b90ab" font-size="8" text-anchor="middle">delivered &middot; lost &middot; delayed &middot; duplicated &middot; reordered</text>
        <text x="170" y="146" fill="#6a7090" font-size="8" text-anchor="middle">the sender sees the same silence in every case</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">you</div><div class="lstep seq" style="--i:0">send("charge the card") &hellip; start a 2s timer</div>
        <div class="lanehead seq" style="--i:1">2s later</div><div class="lstep wait seq" style="--i:1">no reply. timer fires.</div>
        <div class="lanehead seq" style="--i:2">truth #1</div><div class="lstep seq" style="--i:2">the request was lost &rarr; card NOT charged</div>
        <div class="lanehead seq" style="--i:3">truth #2</div><div class="lstep bad seq pop" style="--i:3">the REPLY was lost &rarr; card WAS charged</div>
      </div>
      <div class="dnote seq" style="--i:4">A timeout is not an answer. It is a decision to <b style="color:var(--race)">stop waiting</b> — the operation may have happened anyway.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This is the first of the classic <b class="hl">fallacies of distributed computing</b> — <i>the network is reliable, latency is zero, bandwidth is infinite, the topology doesn't change&hellip;</i> Every one of them is something a single-machine programmer silently assumes, and every one of them is false between nodes.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; a timeout returns ambiguity, not truth</div>
      <pre class="code">const result = await Promise.race([
  charge(card, 50),
  sleep(2000).then(() =&gt; ({ timedOut: true })),
]);

if (result.timedOut) {
  <span class="cm">// what do we know about the charge? NOTHING.</span>
  <span class="cm">// it failed, OR it succeeded and the ack died.</span>
  <span class="ok">// safe next step: retry WITH an idempotency key,</span>
  <span class="ok">// so "again" can't become "twice". (lesson 14)</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> half this course is machinery for acting sensibly inside that ambiguity — retries that can't double-apply, reads that overlap writes, detectors that say "suspect" instead of "dead". If you remember one sentence: <b class="hl">silence carries no information about what happened.</b></p>` },

  { eb:"lesson 03 · foundations", title:"No shared clock", html:`
    <p class="big">Every node has its own clock, and every clock is wrong by a different, <b class="hl">changing</b> amount. NTP keeps them <i>close</i> — but close means milliseconds to seconds of skew, and in that gap, "what happened first?" becomes unanswerable by timestamp.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">two honest nodes &middot; one fast clock &middot; last-writer-wins</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">node A &middot; clock +80ms fast</div>
          <div class="lstep">t=0 &middot; writes x = "draft"</div>
          <div class="lstep bad">stamps it ts = <b>1080</b></div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">node B &middot; clock honest</div>
          <div class="lstep">t=50 &middot; writes x = "final"</div>
          <div class="lstep">stamps it ts = <b>1050</b></div>
        </div>
      </div>
      <div class="flowarrow seq" style="--i:2">&darr; the store keeps the higher timestamp &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:3">store</div><div class="lstep bad seq pop" style="--i:3">1080 &gt; 1050 &rarr; keeps "draft" &nbsp;&#10007; the LATER write is discarded</div>
        <div class="lanehead seq" style="--i:4">error?</div><div class="lstep wait seq" style="--i:4">none. nothing failed. the data is just&hellip; gone.</div>
      </div>
      <div class="dnote seq" style="--i:5">80ms of skew silently deleted a write. Physical time cannot order events between machines.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two different needs hide inside "what time is it?" — and they want different tools. <b class="hl">Durations and timeouts</b> want a <i>monotonic</i> clock (never jumps backwards). <b class="hl">Ordering events across nodes</b> wants no physical clock at all: it wants a <b class="hl">logical clock</b>, which counts causality instead of seconds — that's the next lesson.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; which clock do you reach for?</div>
      <pre class="code"><span class="cm">// durations on ONE node: monotonic clock — immune to NTP jumps</span>
const t0 = performance.now();
await work();
const elapsed = performance.now() - t0;   <span class="ok">// safe</span>

<span class="cm">// wall clock: fine for humans, logs, certificate expiry</span>
const when = Date.now();                  <span class="cm">// display, not ordering</span>

<span class="cm">// ordering events ACROSS nodes: neither! use a logical clock</span>
<span class="cm">// (Lamport / vector — counts happened-before, not seconds)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we'll timestamp everything and sort" is the most natural design instinct in the world, and it silently loses data exactly as animated above. When an interviewer asks how you'd order events across services, the first sentence out of your mouth is <b class="hl">"not with wall clocks."</b></p>` },

  { eb:"lesson 04 · foundations", title:"The two generals", html:`
    <p class="big">Two armies must attack <b class="hl">together</b> or lose. They coordinate by messenger, and messengers can be captured. Here's the brutal theorem: <b class="hl">no finite number of messages</b> gets both generals to attack with certainty.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the regress &middot; every confirmation needs confirming</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">A &rarr; B</div><div class="lstep seq" style="--i:0">"attack at dawn" &hellip; did it arrive? A can't know.</div>
        <div class="lanehead seq" style="--i:1">B &rarr; A</div><div class="lstep seq" style="--i:1">"got it, dawn" &hellip; did THAT arrive? B can't know.</div>
        <div class="lanehead seq" style="--i:2">A &rarr; B</div><div class="lstep seq" style="--i:2">"got your ack" &hellip; now A is unsure B got this one.</div>
        <div class="lanehead seq" style="--i:3">&forall; n</div><div class="lstep bad seq pop" style="--i:3">message n confirms n&minus;1 &mdash; and needs message n+1. Forever.</div>
      </div>
      <div class="dnote seq" style="--i:4">The last message can always be lost, and whoever sent it can't tell. <b style="color:var(--race)">Certainty is unreachable</b> over an unreliable link.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This isn't a puzzle with a clever answer — the impossibility is the answer. And it's liberating: since perfect agreement over a lossy network is <i>provably</i> off the table, real systems stop chasing certainty and engineer <b class="hl">around</b> its absence.</p>
    <p>The workarounds are the next twenty lessons in miniature: <b class="hl">retry</b> until acknowledged (accepting duplicates, which <b class="hl">idempotency</b> then defuses), require a <b class="hl">majority</b> instead of everyone (quorums, consensus), and let <b class="hl">time-bounded promises</b> (leases) stand in for the confirmations you can't get.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; you can't be certain — you CAN be safe</div>
      <pre class="code"><span class="cm">// the engineering answer to two generals:</span>
<span class="cm">// keep saying it + make hearing it twice harmless</span>
async function reliableSend(msg) {
  for (;;) {
    send(peer, msg);                      <span class="cm">// may be lost</span>
    const ack = await waitAck(msg.id, 500);
    if (ack) return;                      <span class="cm">// heard back — done</span>
    <span class="cm">// no ack: maybe lost, maybe delivered. send AGAIN —</span>
    <span class="ok">// msg.id lets the receiver dedupe the maybe-duplicate</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> interviewers love asking for "guaranteed exactly-once delivery." The senior answer names this lesson: delivery guarantees end at <i>at-least-once</i> or <i>at-most-once</i> — pick one, and if you picked at-least-once, make processing idempotent so it's <b class="hl">effectively</b> once. That's not a compromise; it's the theorem talking.</p>` },

  { eb:"lesson 05 · time", title:"Lamport clocks", html:`
    <p class="big">If wall clocks can't order events, count <b class="hl">causality</b> instead. A Lamport clock is one integer per node and two rules — and it guarantees that if event X could have influenced event Y, then <code>clock(X) &lt; clock(Y)</code>.</p>
    <p>Rule 1: before every local event (including sends), <b class="hl">increment</b>. Rule 2: on receive, set your clock to <b class="hl">max(local, message) + 1</b>. That's the whole algorithm.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">watch the max&plus;1 rule pull B's clock forward</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">A</div><div class="lstep seq" style="--i:0">local event &rarr; A = <b>1</b></div>
        <div class="lanehead seq" style="--i:1">A</div><div class="lstep seq" style="--i:1">send m &rarr; A = <b>2</b>, m carries 2</div>
        <div class="lanehead seq" style="--i:2">B</div><div class="lstep seq" style="--i:2">two local events &rarr; B = <b>2</b></div>
        <div class="lanehead seq" style="--i:3">B</div><div class="lstep good seq pop" style="--i:3">recv m &rarr; max(2, 2) + 1 = <b>4</b> &nbsp;&#10003; receive lands after send</div>
        <div class="lanehead seq" style="--i:4">B</div><div class="lstep seq" style="--i:4">reply m&prime; &rarr; B = <b>5</b>, m&prime; carries 5</div>
        <div class="lanehead seq" style="--i:5">A</div><div class="lstep good seq" style="--i:5">recv m&prime; &rarr; max(2, 5) + 1 = <b>6</b></div>
      </div>
      <div class="dnote seq" style="--i:6">Every arrow in the diagram ends at a bigger number than it started. <b style="color:var(--ordered)">Happened-before is preserved</b> — no wall clock consulted.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; one integer, two rules</div>
      <pre class="code">class LamportClock {
  #t = 0;
  tick()  { return ++this.#t; }          <span class="cm">// rule 1: local event</span>
  stamp() { return ++this.#t; }          <span class="cm">// rule 1: sends count too</span>
  recv(remote) {
    <span class="ok">this.#t = Math.max(this.#t, remote) + 1;</span>  <span class="cm">// rule 2</span>
    return this.#t;
  }
}</pre>
    </div>
    <p>Read the guarantee carefully — it's one-directional. Causally related events get ordered timestamps. But two events with timestamps 4 and 7 might be causally related <i>or</i> might be completely independent: <b class="hl">Lamport clocks cannot tell you which</b>. They order everything, including things that never touched.</p>
    <p><b class="hl">Why it matters:</b> a total-ish order from one integer is astonishingly cheap, and it powers real systems (ordered log merges, distributed mutual exclusion). But the moment the question becomes "did these two writes <i>conflict</i>?" you need to detect concurrency itself — which takes a vector, not a scalar. Next lesson.</p>` },

  { eb:"lesson 06 · time", title:"Vector clocks", html:`
    <p class="big">A Lamport clock compresses history into one number and loses the ability to see <b class="hl">concurrency</b>. A vector clock keeps <b class="hl">one counter per node</b> — and suddenly "these two versions conflict" becomes computable.</p>
    <p>Same two rules, vectorized: increment <b class="hl">your own slot</b> for local events and sends; on receive, take the <b class="hl">element-wise max</b>, then increment your slot. Compare two vectors: if one is &le; the other in every slot, it <b class="hl">happened before</b>. If each is ahead somewhere — <b class="hl">concurrent</b>.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">a cart edited on two offline devices &middot; [phone, laptop]</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">phone</div>
          <div class="lstep">edit &rarr; [1,0]</div>
          <div class="lstep">edit &rarr; [<b>2</b>,0]</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">laptop</div>
          <div class="lstep">sync at [1,0]</div>
          <div class="lstep">edit &rarr; [1,<b>1</b>]</div>
        </div>
      </div>
      <div class="flowarrow seq" style="--i:2">&darr; both sync to the server &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:3">compare</div><div class="lstep seq" style="--i:3">[2,0] vs [1,1] &mdash; phone ahead in slot 0, laptop ahead in slot 1</div>
        <div class="lanehead seq" style="--i:4">verdict</div><div class="lstep bad seq pop" style="--i:4">neither &le; the other &rarr; <b>CONCURRENT</b> &mdash; a genuine conflict</div>
        <div class="lanehead seq" style="--i:5">resolve</div><div class="lstep good seq" style="--i:5">merge the carts / ask the user / apply a policy &mdash; but <b>knowingly</b></div>
      </div>
      <div class="dnote seq" style="--i:6">A wall-clock (or Lamport) comparison would have silently crowned a winner and <b style="color:var(--race)">dropped someone's edit</b>. The vector made the conflict visible.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; merge, then count the receive</div>
      <pre class="code">class VectorClock {
  constructor(id, n) { this.id = id; this.v = new Array(n).fill(0); }
  tick() { this.v[this.id]++; return this.v.slice(); }
  recv(remote) {
    for (let i = 0; i &lt; this.v.length; i++)
      this.v[i] = Math.max(this.v[i], remote[i]);   <span class="cm">// merge histories</span>
    <span class="ok">this.v[this.id]++;</span>                              <span class="cm">// the receive is an event</span>
    return this.v.slice();
  }
}
<span class="cm">// compare: a &le; b everywhere &rarr; a happened-before b.</span>
<span class="cm">// each ahead somewhere &rarr; concurrent — surface the conflict.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the machinery beneath Dynamo-style stores, CRDTs, and every sync engine that says "conflicted copy" instead of eating your edit. The cost is real — the vector grows with the number of writers — which is why systems prune, or accept sibling values, or fall back to LWW <i>knowing exactly what they're giving up</i>.</p>` },

  { eb:"lesson 07 · time", title:"Ordering guarantees", html:`
    <p class="big">"Ordered delivery" is not one thing — it's a ladder, and every rung up costs coordination. Name the rung you actually need: <b class="hl">FIFO</b>, <b class="hl">causal</b>, or <b class="hl">total</b> order.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the ladder &middot; what's guaranteed vs what it costs</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">none</div><div class="lstep seq" style="--i:0">messages arrive in any order &mdash; free, and the default</div>
        <div class="lanehead seq" style="--i:1">FIFO</div><div class="lstep seq" style="--i:1">per SENDER order holds &mdash; costs a sequence number per sender</div>
        <div class="lanehead seq" style="--i:2">causal</div><div class="lstep seq" style="--i:2">if X could have caused Y, X delivers first &mdash; costs vector clocks</div>
        <div class="lanehead seq" style="--i:3">total</div><div class="lstep good seq pop" style="--i:3">EVERY node sees the SAME order &mdash; costs a single sequencer or consensus</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">the trap</div>
        <p style="margin:4px 0 0">FIFO orders one sender's messages. It says <b class="hl">nothing</b> about two senders: A's "reserve seat" and B's "cancel flight" can interleave differently at every replica &mdash; unless you pay for total order.</p>
      </div>
      <div class="dnote seq" style="--i:5">Total order means every replica applies the same operations in the same sequence &mdash; the foundation of replicated state machines. It's also a <b style="color:var(--race)">throughput bottleneck</b>: one line, everyone queues.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; FIFO is cheap — a counter and a hold-back buffer</div>
      <pre class="code"><span class="cm">// sender: stamp every message</span>
send(peer, { seq: nextSeq++, body });

<span class="cm">// receiver: deliver in sequence, hold the early arrivals</span>
const pending = new Map(); let expected = 0;
function onMessage(m) {
  pending.set(m.seq, m);
  while (pending.has(expected)) {
    <span class="ok">deliver(pending.get(expected));</span>
    pending.delete(expected++);          <span class="cm">// gap? wait for it.</span>
  }
}
<span class="cm">// total order has no local trick — SOMEONE must sequence:</span>
<span class="cm">// a leader, a log (Kafka partition), or consensus. (lesson 20)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "do we need ordering?" is the wrong question — the right one is <b class="hl">which</b> ordering, over <b class="hl">which scope</b>. Per-key FIFO (one partition per entity) is usually enough, costs almost nothing, and scales. Global total order is the most expensive thing you can ask a distributed system to do — reach for it last.</p>` },
];

/* ---- lesson <-> skill cross-links ----
   Lessons teach a concept; the matching skill checks comprehension from a
   different angle. Indices reference the FINAL lesson order (see the LESSON
   PLAN at the top of this file) — packs 10/20/40 fill in lessons 7-27. */
// skill (drill) id -> the lesson whose concept it tests (0-based index)
const DRILL_LESSON = {
  lamport:4, vclock:5, quorum:8, heartbeat:16, lease:20, idempotency:13, hashring:23, election:17,
  saga:22, twophase:21, outbox:14, splitbrain:18, gossip:9, readrepair:9, logcommit:19, dlq:15,
  backoff:24, circuitbreaker:25, hedge:25, timeoutbudget:26, bulkhead:25, fanout:8,
};
// lesson index -> where to go practice it { mod, drill? }
const LESSON_PRACTICE = {
  0:{mod:"model"}, 1:{mod:"netsim"}, 2:{mod:"primitives",drill:"lamport"}, 3:{mod:"model"},
  4:{mod:"primitives",drill:"lamport"}, 5:{mod:"primitives",drill:"vclock"}, 6:{mod:"model"},
  7:{mod:"tradeoffs"}, 8:{mod:"primitives",drill:"quorum"}, 9:{mod:"bank",drill:"readrepair"},
  10:{mod:"tradeoffs"}, 11:{mod:"tradeoffs"}, 12:{mod:"netsim"}, 13:{mod:"primitives",drill:"idempotency"},
  14:{mod:"bank",drill:"outbox"}, 15:{mod:"bank",drill:"dlq"}, 16:{mod:"primitives",drill:"heartbeat"},
  17:{mod:"primitives",drill:"election"}, 18:{mod:"bank",drill:"splitbrain"}, 19:{mod:"bank",drill:"logcommit"},
  20:{mod:"primitives",drill:"lease"}, 21:{mod:"bank",drill:"twophase"}, 22:{mod:"bank",drill:"saga"},
  23:{mod:"primitives",drill:"hashring"}, 24:{mod:"toolkit",drill:"backoff"}, 25:{mod:"toolkit",drill:"circuitbreaker"},
  26:{mod:"toolkit",drill:"timeoutbudget"},
};
