/* Concurrency Bootcamp — content pack: cancellation (AbortController/
   AbortSignal) + the two caller-side async-lock hazards (holding a lock
   across an await of foreign code; reentrant acquire).

   Loaded as a classic script AFTER js/content.js and BEFORE js/app.js, in the
   shared global scope. Appends into the existing collections; the app computes
   totals and renders at boot, so everything here is a first-class citizen. */
"use strict";
(() => {

  /* ===========================================================
     DEMOS — return {lines:[{t}...], pass, verdict}
     =========================================================== */

  // abort-unlink invariant: an aborted waiter must never be handed a permit.
  async function demoAbortSem() {
    class AbortSem {
      #permits; #q = [];
      constructor(n) { this.#permits = n; }
      async acquire(signal) {
        if (signal?.aborted) throw signal.reason;
        if (this.#permits > 0) { this.#permits--; return; }
        const e = { d: deferred() };
        this.#q.push(e);
        signal?.addEventListener("abort", () => { e.dead = true; e.d.reject(signal.reason); }, { once: true });
        return e.d.promise;
      }
      release() {
        let e;
        while ((e = this.#q.shift())) { if (!e.dead) { e.dead = true; e.d.resolve(); return; } }
        this.#permits++;
      }
    }
    const s = new AbortSem(1);
    await s.acquire();                              // holder takes the only permit
    const cA = new AbortController(), cB = new AbortController();
    let aRej = false, bGot = false;
    const a = s.acquire(cA.signal).catch(() => { aRej = true; });   // parks (A)
    const b = s.acquire(cB.signal).then(() => { bGot = true; });    // parks (B)
    await sleep(5);
    cA.abort(new Error("A cancelled"));            // A leaves the queue
    await sleep(5);
    s.release();                                   // freed permit must go to B, not dead A
    await Promise.race([b, sleep(40)]);
    void a;
    const pass = aRej && bGot;
    return { lines:[
      { t:"holder releases with an aborted waiter (A) and a live waiter (B) queued" },
      { t:`A rejected on abort: ${aRej} · B got the freed permit: ${bGot}` }],
      pass, verdict: pass ? "aborted waiter unlinked; permit went to the next LIVE request" : `aRej=${aRej} bGot=${bGot} — permit handed to a corpse?` };
  }

  // signal threading + cleanup: whoever registers on the signal unregisters it,
  // whoever holds a resource releases it on the abort path.
  async function demoSignalThread() {
    let cleaned = 0;
    const wait = (signal) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);          // already-aborted fast path
      const t = setTimeout(resolve, 1000);
      const onAbort = () => { clearTimeout(t); cleaned++; reject(signal.reason); };  // release on abort
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const ctrl = new AbortController();
    let rejected = false;
    const p = wait(ctrl.signal).catch(() => { rejected = true; });
    ctrl.abort(new Error("cancelled"));
    await p;
    let fast = false;
    await wait(ctrl.signal).catch(() => { fast = true; });        // signal is already aborted now
    const pass = rejected && cleaned === 1 && fast;
    return { lines:[
      { t:"abort while parked → work stopped, timer cleared, listener fired once" },
      { t:`cleanup ran: ${cleaned} time(s) · already-aborted fast path rejected: ${fast}` }],
      pass, verdict: pass ? "signal threaded in; abort path cleared the timer and rejected — no leak" : `rejected=${rejected} cleaned=${cleaned} fast=${fast}` };
  }

  /* ===========================================================
     LESSONS
     =========================================================== */

  // ---- Lesson: cancellation is a channel, not a kill switch ----
  const liCancel = LESSONS.length;
  LESSONS.push({ eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · cancellation`, title: "Cancellation is a channel, not a kill switch", html: `
    <p class="big">You can't reach into a running promise and stop it. Cancellation in JS is <b class="hl">cooperative</b>: you don't kill the work, you <b class="hl">ask</b> it to stop, and the work has to be listening.</p>
    <p>The standard channel is an <code>AbortController</code>. It owns a <code>signal</code> you thread through every API that does the work; calling <code>controller.abort(reason)</code> flips that one signal, and everyone watching it reacts. The signal is the message bus — <code>abort()</code> is the message.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">a waiter parked in a queue &middot; an abort arrives &middot; the slot is unlinked</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">acquire</div><div class="lstep wait seq" style="--i:0">no permit &rarr; park a waiter in the queue, wire <code>onAbort</code></div>
        <div class="lanehead seq" style="--i:1">signal</div><div class="lstep seq" style="--i:1"><code>abort(reason)</code> fires &rarr; the parked waiter's <code>onAbort</code> runs</div>
        <div class="lanehead seq" style="--i:2">unlink</div><div class="lstep bad seq pop" style="--i:2">remove the slot &amp; <code>reject(signal.reason)</code> &nbsp;&#10007; gone from the queue</div>
        <div class="lanehead seq" style="--i:3">release</div><div class="lstep good seq" style="--i:3">a freed permit skips the corpse &rarr; the next LIVE waiter runs</div>
      </div>
      <div class="dnote seq" style="--i:4">Abort doesn't stop the world &mdash; it <b style="color:var(--race)">unparks one waiter</b> so it can reject and <b style="color:var(--ordered)">clean up its own slot</b>. Miss the unlink and a later permit lands on a corpse.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two ways to react to the signal. At a <b class="hl">suspension point</b> you poll it — check <code>signal.aborted</code>, or call <code>signal.throwIfAborted()</code> to bail with <code>signal.reason</code> before starting more work. While you're <i>parked</i> and can't poll, you <b class="hl">listen</b>: <code>signal.addEventListener("abort", onAbort, { once: true })</code> unparks you. And always take the <b class="hl">already-aborted fast path</b> first — a signal can arrive aborted, so check <code>signal.aborted</code> before you queue anything.</p>
    <p>The other half is the <b class="hl">cleanup contract</b>. Whoever registered on the signal <b class="hl">unregisters</b> — <code>{ once: true }</code> plus <code>removeEventListener</code> on the success path, or listeners pile up on a long-lived signal and leak. Whoever holds a resource <b class="hl">releases it on the abort path</b> — clear the timer, unlink the queued waiter, unlock the mutex — in a <code>finally</code> or the abort handler.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a cancellable wait that threads, listens, and cleans up</div>
      <pre class="code"><span class="cm">// thread the signal in; react at the suspension point AND while parked</span>
function waitForValue(source, signal) {
  if (signal?.aborted) throw signal.reason;      <span class="cm">// already-aborted fast path</span>
  return new Promise((resolve, reject) =&gt; {
    const onAbort = () =&gt; { source.cancel(); reject(signal.reason); };   <span class="cm">// release + reject</span>
    signal?.addEventListener("abort", onAbort, { once: true });
    source.then(
      (v) =&gt; { signal?.removeEventListener("abort", onAbort); resolve(v); },  <span class="cm">// unregister!</span>
      (e) =&gt; { signal?.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

<span class="cm">// build signals: a deadline, or several combined into one</span>
const timeout = AbortSignal.timeout(5000);                 <span class="cm">// self-aborts after 5s</span>
const both = AbortSignal.any([userSignal, timeout]);       <span class="cm">// aborts when EITHER does</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> a timeout that doesn't thread a signal leaves the slow work running in the background (lesson 21's "cancel the loser"); a listener you never remove leaks; a parked waiter you reject but never unlink strands the resource behind it. Cancellation done right is a signal in, a rejection out, and every registration and resource cleaned up on the way.</p>` });
  LESSON_PRACTICE[liCancel] = { mod: "primitives", drill: "abortsem" };

  // ---- Lesson: the lock bugs that aren't in the lock ----
  const liLocks = LESSONS.length;
  LESSONS.push({ eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · async locks`, title: "The lock bugs that aren't in the lock", html: `
    <p class="big">Your mutex can be flawless and your code still deadlocks. The two nastiest lock bugs live in the <b class="hl">caller</b>, not the lock — in <i>what</i> you do while holding it, and in <i>who</i> tries to take it.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">hazard 1 &middot; convoy behind a foreign await &nbsp;|&nbsp; hazard 2 &middot; waiting for yourself</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">hold</div><div class="lstep seq" style="--i:0">acquire &rarr; <code>await fetch(&hellip;)</code> &mdash; foreign code you don't control</div>
        <div class="lanehead seq" style="--i:1">convoy</div><div class="lstep wait seq" style="--i:1">every other caller parks behind one slow round-trip &rarr; p99 spikes</div>
        <div class="lanehead seq" style="--i:2">re-enter</div><div class="lstep bad seq pop" style="--i:2">that foreign code calls back in &amp; awaits the SAME lock &#10007; deadlock</div>
        <div class="lanehead seq" style="--i:3">reentrant</div><div class="lstep bad seq pop" style="--i:3">you hold the lock, a helper <code>await lock.acquire()</code>s it again &rarr; parked behind yourself, forever</div>
      </div>
      <div class="dnote seq" style="--i:4">One thread, no owner identity: an async lock is <b style="color:var(--race)">just a promise queue</b>. It can't tell that the task now waiting is the very task already holding it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p><b class="hl">Hazard 1 — holding across an await of foreign code.</b> The whole point of a lock is to serialize a <i>short</i> critical section. Hold it across <code>await fetch(...)</code> or an <code>await</code> of a callback you don't own, and every other caller convoys behind that I/O — throughput collapses. And if that foreign code (or anything it calls: an interceptor, a retry, a same-key re-entry) tries to acquire the same lock, it awaits a lock its own caller is holding: total deadlock. The rule: <b class="hl">hold locks across YOUR awaits only when the critical section truly requires it.</b> Copy the state you need in, do the slow I/O <i>outside</i> the lock, then re-take it just to commit.</p>
    <p><b class="hl">Hazard 2 — reentrant acquire.</b> A reentrant lock recognizes its current holder and lets it re-acquire. JS async mutexes are <b class="hl">not reentrant</b> — there's no thread or owner to check, just a queue of parked promises. Awaiting a lock you already hold parks you at the back of a line you're blocking at the front of: <b class="hl">self-deadlock</b>. It hides in helpers: a function that acquires the lock, called from a path that already holds it.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the convoy, and the shape that self-deadlocks</div>
      <pre class="code"><span class="cm">// BAD — foreign I/O inside the critical section: convoy + re-entry deadlock</span>
async function get(key) {
  return lock.runExclusive(async () =&gt; {
    if (cache.has(key)) return cache.get(key);
    const v = await fetch("/api/" + key);   <span class="cm">// everyone waits behind this; re-entry hangs</span>
    cache.set(key, v);
    return v;
  });
}

<span class="cm">// GOOD — read under the lock, fetch UNLOCKED, commit under the lock</span>
async function get(key) {
  const hit = await lock.runExclusive(async () =&gt; cache.get(key));
  if (hit !== undefined) return hit;
  const v = await fetch("/api/" + key);     <span class="cm">// slow I/O holds no lock</span>
  return lock.runExclusive(async () =&gt; { cache.set(key, v); return v; });
}

<span class="cm">// SELF-DEADLOCK — a helper re-acquires a lock the caller already holds</span>
async function transfer(a, b, n) {
  await lock.acquire();
  try { await adjust(a, -n); }              <span class="cm">// adjust() does await lock.acquire() -&gt; waits for us</span>
  finally { lock.release(); }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> both bugs pass every unit test that doesn't contend or re-enter, then wreck production under load. Interviewers probe exactly here: name the convoy, name the missing owner identity, and reach for the fix — shrink the critical section, or factor out a lock-free inner function that both the locked and unlocked paths call.</p>` });
  LESSON_PRACTICE[liLocks] = { mod: "bughunt" };

  /* ===========================================================
     DRILLS
     =========================================================== */

  // primitives — the abort-unlink rule
  DRILLS.primitives.push({
    id: "abortsem", title: "Abortable Semaphore", why: "an aborted waiter must never be handed a permit", demo: demoAbortSem,
    pre: `// An abortable semaphore. acquire(signal) parks when no permit is free,
// and an abort while parked marks that waiter dead and rejects it.
class Semaphore {
  #permits; #queue = [];
  constructor(n) { this.#permits = n; }
  async acquire(signal) {
    if (signal?.aborted) throw signal.reason;
    if (this.#permits > 0) { this.#permits--; return; }
    const e = { d: deferred() };
    this.#queue.push(e);
    signal?.addEventListener("abort", () => { e.dead = true; e.d.reject(signal.reason); }, { once: true });
    return e.d.promise;
  }
  release() {`,
    blank: { q: "A parked waiter aborted and is still sitting in the queue as a dead entry. Which release() hands the freed permit to the next LIVE waiter instead of to a corpse?",
      options: [
`    let e;
    while ((e = this.#queue.shift())) {
      if (!e.dead) { e.d.resolve(); return; }   // skip aborted waiters
    }
    this.#permits++;`,
`    const e = this.#queue.shift();
    if (e) e.d.resolve();
    else this.#permits++;`,
`    this.#permits++;
    const e = this.#queue.shift();
    if (e) e.d.resolve();`],
      answer: 0,
      whys: [
        "Right. Walk past aborted (dead) entries and give the permit to the first live waiter; only if none remain does it return to the pool. No ghost grants, no leak.",
        "Resolves the very next entry even when it aborted — the permit lands on a corpse (resolve() on an already-rejected deferred is a no-op) and the next real request starves. Skip dead entries.",
        "Bumps the count AND wakes a waiter — a permit leak — and still hands it to a possibly-dead entry. Increment only when no live waiter remains."] },
    post: `  }
}`,
  });
  DRILL_LESSON.abortsem = liCancel;

  // toolkit — signal threading & cleanup
  DRILLS.toolkit.push({
    id: "signalthread", title: "Thread & clean up a signal", why: "whoever registers on the signal unregisters it", demo: demoSignalThread,
    pre: `// Park until a value arrives OR the caller cancels. Whoever registers on
// the signal must UNregister it — a listener that outlives the wait leaks.
function waitFor(getValue, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);   // already-aborted fast path
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    getValue().then(
      (v) => {`,
    blank: { q: "The value arrives before any abort. Which resolve path stops the abort listener from outliving the wait and leaking on a long-lived signal?",
      options: [
`        signal.removeEventListener("abort", onAbort);
        resolve(v);`,
`        resolve(v);`,
`        signal.dispatchEvent(new Event("abort"));
        resolve(v);`],
      answer: 0,
      whys: [
        "Right. Whoever adds a listener removes it: on success, unregister the abort handler before resolving so nothing lingers on the signal.",
        "Resolves but never removes the abort listener — every completed wait leaves a dead listener wired to the signal, and on a long-lived signal they pile up into a real leak. Unregister what you registered.",
        "Firing 'abort' on success is backwards — it signals cancellation to everyone else sharing this signal. Just remove your own listener and resolve."] },
    post: `      },
      reject,
    );
  });
}`,
  });
  DRILL_LESSON.signalthread = liCancel;

  /* ===========================================================
     BUGHUNT
     =========================================================== */

  BUGHUNT.push({
    id: "bug_cachelock", title: "Cache refresh under lock", why: "don't hold a lock across foreign awaits", lesson: liLocks,
    scenario: "Under load, p99 latency spikes and the refresh path occasionally deadlocks outright. The mutex itself is correct. Which line makes every caller convoy behind one slow fetch — and can deadlock when the refresh re-enters?",
    lines: [
      "class Cache {",
      "  #mutex = new Mutex();",
      "  #store = new Map();",
      "",
      "  async get(key) {",
      "    return this.#mutex.runExclusive(async () => {",
      "      if (this.#store.has(key)) return this.#store.get(key);",
      "      const res = await fetch(\"/api/\" + key);   // foreign code, lock still held",
      "      const value = await res.json();",
      "      this.#store.set(key, value);",
      "      return value;",
      "    });",
      "  }",
      "",
      "  async invalidateAll() {",
      "    await this.#mutex.runExclusive(async () => {",
      "      this.#store.clear();",
      "    });",
      "  }",
      "}",
    ],
    bug: [7, 8],
    explain: "Lines 8–9 hold the mutex across `await fetch` and `await res.json()` — foreign code you don't control. Every other get(), for ANY key, now convoys behind that one network round-trip, spiking p99. Worse, if the fetch path re-enters (an interceptor, a retry, a same-key call) and awaits this same lock, it waits on a lock its own caller is still holding — a self-deadlock. Do the slow I/O OUTSIDE the critical section: read state under the lock, fetch unlocked, then re-take the lock only to store." });

  BUGHUNT.push({
    id: "bug_reentrant", title: "Reentrant acquire", why: "a JS async mutex is not reentrant", lesson: liLocks,
    scenario: "transfer() works in every test until an account goes overdrawn — then that request hangs forever, and because it never releases the lock, every later caller hangs too. Which line parks the task behind a lock it already holds?",
    lines: [
      "const lock = new Mutex();",
      "const balances = new Map();",
      "const audit = [];",
      "",
      "async function logOverdraft(id) {          // helper: acquires the lock itself",
      "  await lock.acquire();",
      "  try {",
      "    audit.push({ id, at: Date.now() });",
      "  } finally {",
      "    lock.release();",
      "  }",
      "}",
      "",
      "async function transfer(from, to, amount) {",
      "  await lock.acquire();",
      "  try {",
      "    const bal = balances.get(from) ?? 0;",
      "    if (bal < amount) {",
      "      await logOverdraft(from);            // still holding the lock here",
      "      return { ok: false };",
      "    }",
      "    balances.set(from, bal - amount);",
      "    balances.set(to, (balances.get(to) ?? 0) + amount);",
      "    return { ok: true };",
      "  } finally {",
      "    lock.release();",
      "  }",
      "}",
    ],
    bug: [18],
    explain: "Line 19 calls logOverdraft while transfer still holds the lock, and logOverdraft's own `await lock.acquire()` (line 6) parks behind a lock the same task is holding. A JS async mutex has no thread or owner identity to recognize a re-entrant caller, so it can never grant the lock to its current holder — the task waits for itself forever, and since transfer never reaches release(), every later caller hangs too. Don't call lock-taking code while holding the lock: release first, or factor out a lock-free inner function both paths call." });

  BUGHUNT.push({
    id: "bug_abortcorpse", title: "Cancelled waiter, stuck queue", why: "unlink an aborted waiter", lesson: liCancel,
    scenario: "A user cancels a pending request; from then on the NEXT request for that resource waits forever, even though a permit is free. Which line rejects the aborted waiter but leaves it parked in the queue?",
    lines: [
      "class Semaphore {",
      "  #permits;",
      "  #queue = [];",
      "",
      "  constructor(n) { this.#permits = n; }",
      "",
      "  async acquire(signal) {",
      "    if (this.#permits > 0) { this.#permits--; return; }",
      "    const d = deferred();",
      "    this.#queue.push(d);",
      "    signal.addEventListener('abort', () => {",
      "      d.reject(signal.reason);            // rejected, but still in #queue",
      "    }, { once: true });",
      "    return d.promise;",
      "  }",
      "",
      "  release() {",
      "    const d = this.#queue.shift();",
      "    if (d) d.resolve();",
      "    else this.#permits++;",
      "  }",
      "}",
    ],
    bug: [11],
    explain: "Line 12 rejects the aborted waiter but never removes it from #queue. It sits there as a corpse; when a permit frees, release() (line 18) shifts that dead deferred and 'grants' it the permit — resolve() on an already-rejected promise does nothing — so the freed permit evaporates and the next live request waits forever. Unlink on abort (remove the entry from #queue), or make release() skip entries whose signal already aborted." });

  /* ===========================================================
     WRITE IT
     =========================================================== */

  WRITE.push({
    id: "w-abortsem", title: "Abortable semaphore — write it", why: "an aborted waiter must never be handed a permit", lesson: liCancel,
    spec: "acquire(signal) grants a permit if one is free; otherwise it parks. An abort while parked must unlink the waiter and reject with signal.reason; an already-aborted signal rejects without ever queueing; an abort AFTER the permit is granted is a no-op. release() hands the permit to the next LIVE waiter, else increments.",
    pre: `class Semaphore {
  #permits;
  #queue = [];
  constructor(n) { this.#permits = n; }`,
    post: `}`,
    lines: [
      "  async acquire(signal) {",
      "    if (signal?.aborted) throw signal.reason;",
      "    if (this.#permits > 0) { this.#permits--; return; }",
      "    const entry = { d: deferred() };",
      "    this.#queue.push(entry);",
      "    const onAbort = () => { entry.dead = true; entry.d.reject(signal.reason); };",
      "    signal?.addEventListener('abort', onAbort, { once: true });",
      "    try { await entry.d.promise; }",
      "    finally { signal?.removeEventListener('abort', onAbort); }",
      "  }",
      "  release() {",
      "    let entry;",
      "    while ((entry = this.#queue.shift())) {",
      "      if (!entry.dead) { entry.dead = true; entry.d.resolve(); return; }",
      "    }",
      "    this.#permits++;",
      "  }",
    ],
    distractors: [
      { code: "    const onAbort = () => { entry.d.reject(signal.reason); };",
        why: "Rejects the parked waiter but never marks it dead. release() then hands the freed permit to this corpse — resolve() on an already-rejected deferred does nothing — and the next LIVE waiter starves. Mark the entry dead (or unlink it) so release() skips it." },
      { code: "    if (signal?.aborted) entry.dead = true;",
        why: "Checks the flag once at park time but never LISTENS for an abort that arrives while parked — that waiter then hangs forever after a cancel. Register signal.addEventListener('abort', …) so a mid-wait abort unparks it." },
      { code: "    if (signal?.aborted) return;",
        why: "An already-aborted signal must REJECT with signal.reason, not quietly return as if the permit were granted — returning hands the caller a permit it never acquired." },
    ],
    test: `const s = new Semaphore(1);
await s.acquire();                       // holder takes the only permit
const ctrlB = new AbortController(), ctrlC = new AbortController();
let bRej = null, cGot = "pending";
const b = s.acquire(ctrlB.signal).catch((e) => { bRej = e; });
const c = s.acquire(ctrlC.signal).then(() => { cGot = "granted"; });
await sleep(5);                          // B and C are parked
ctrlB.abort(new Error("cancel-B"));
await sleep(5);
assert(bRej && bRej.message === "cancel-B", "an abort while parked must reject that waiter with signal.reason");
s.release();                             // freed permit must reach the LIVE waiter C, not dead B
const winner = await Promise.race([c.then(() => "c"), sleep(60).then(() => "timeout")]);
assert(winner === "c", "release() handed the permit to the aborted (dead) waiter - the next live request starved");
assert(cGot === "granted", "C must receive the freed permit");
void b;
log("abort-then-release: permit skipped the corpse and reached the live waiter");

const s2 = new Semaphore(2);
const pre = new AbortController(); pre.abort(new Error("pre"));
let preErr = null;
try { await s2.acquire(pre.signal); } catch (e) { preErr = e; }
assert(preErr && preErr.message === "pre", "acquire() with an already-aborted signal must reject, not return as if granted");
await s2.acquire(); await s2.acquire(); // drain the 2 real permits
const extra = await Promise.race([s2.acquire().then(() => "got"), sleep(40).then(() => "blocked")]);
assert(extra === "blocked", "a pre-aborted acquire must not have consumed a permit - capacity drifted");
log("already-aborted acquire rejected up front and consumed no permit");

const s3 = new Semaphore(1);
await s3.acquire();                      // holder
const ac = new AbortController();
let w = "pending";
const wp = s3.acquire(ac.signal).then(() => { w = "acquired"; }).catch(() => { w = "rejected"; });
await sleep(5);                          // parked
s3.release();                            // hands the permit to the waiter
await sleep(5);
assert(w === "acquired", "a parked waiter handed the permit must acquire it");
ac.abort(new Error("late"));             // abort AFTER acquisition
await sleep(5);
assert(w === "acquired", "abort after the permit was granted must be a no-op, not a late rejection");
void wp;
log("abort-after-acquire was a no-op");`,
    pass: "abort unlinked the waiter, the permit reached the next live request, the already-aborted fast path rejected, and a late abort was a no-op",
    takeaway: "The invariant is 'no permit to a corpse': mark a waiter dead on abort AND have release() skip dead entries. The fast path (reject an already-aborted signal without queueing) and the finally (unregister on the happy path) are what stop the leaks around it.",
    hint: "acquire(): fast path (aborted → throw signal.reason), then free permit → take it, else park an entry, wire onAbort to mark it dead + reject, await, and removeEventListener in finally. release(): shift past dead entries to the first live one; if none, increment." });

  WRITE.push({
    id: "w-cancellable-retry", title: "Cancellable retry — write it", why: "a cancel must break out of the retry, promptly", lesson: liCancel,
    spec: "Retry fn up to `tries` times with exponential backoff, but respect the signal: reject with signal.reason if it is already aborted, and if it aborts DURING a backoff, unpark at once and reject — never fire another attempt after an abort. On exhaustion, rethrow fn's last error. `delay(ms, signal)` (given) is an abortable sleep.",
    pre: `// abortable sleep: resolves after ms, or rejects early with signal.reason.
function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });
}
async function cancellableRetry(fn, tries, baseMs, signal) {`,
    post: `}`,
    lines: [
      "  if (signal?.aborted) throw signal.reason;",
      "  for (let attempt = 1; attempt <= tries; attempt++) {",
      "    try {",
      "      return await fn();",
      "    } catch (err) {",
      "      if (attempt === tries) throw err;",
      "      await delay(baseMs * 2 ** (attempt - 1), signal);",
      "    }",
      "  }",
    ],
    distractors: [
      { code: "      await sleep(baseMs * 2 ** (attempt - 1));",
        why: "A plain sleep ignores the signal: an abort during the backoff waits out the FULL delay, then fires another attempt — the retry runs to exhaustion and rejects with fn's error, never the abort reason. Use the abortable delay(ms, signal) so a cancel unparks it at once." },
      { code: "      try { await delay(baseMs * 2 ** (attempt - 1), signal); } catch {}",
        why: "Catching the backoff's rejection swallows the abort and loops for ANOTHER attempt — a cancel must break out of the retry, not be treated as a retryable failure. Let the abort propagate." },
      { code: "  if (signal?.aborted) return null;",
        why: "An already-aborted signal must REJECT with signal.reason, not resolve with a value as if the work quietly finished — swallowing the cancel hides it from the caller. Throw signal.reason." },
    ],
    test: `let calls3 = 0;
const flaky = async () => { calls3++; if (calls3 < 3) throw new Error("flaky"); return "recovered"; };
const r = await cancellableRetry(flaky, 5, 5);
assert(r === "recovered" && calls3 === 3, "must retry a flaky call to success (got " + r + " in " + calls3 + " tries)");
log("flaky recovered after " + calls3 + " attempts");

let calls4 = 0, e4 = null;
try { await cancellableRetry(async () => { calls4++; throw new Error("always"); }, 3, 5); }
catch (x) { e4 = x; }
assert(e4 && e4.message === "always" && calls4 === 3, "exhausting tries rethrows fn's error after exactly tries attempts (" + calls4 + " calls, '" + (e4 && e4.message) + "')");
log("exhausted after " + calls4 + " attempts -> " + (e4 && e4.message));

const pre = new AbortController(); pre.abort(new Error("pre-cancelled"));
let calls2 = 0, e2 = null, v2 = "none";
try { v2 = await cancellableRetry(async () => { calls2++; return "ok"; }, 3, 10, pre.signal); }
catch (x) { e2 = x; }
assert(e2 && e2.message === "pre-cancelled", "an already-aborted signal must reject with signal.reason before any attempt");
assert(calls2 === 0, "a pre-aborted retry must not run fn at all (ran " + calls2 + " times)");
log("pre-aborted retry rejected up front, " + calls2 + " attempts");

const ctrl = new AbortController();
let calls = 0;
const failing = async () => { calls++; throw new Error("boom#" + calls); };
(async () => { await sleep(15); ctrl.abort(new Error("cancelled")); })();  // abort during the first backoff
const started = Date.now();
let e = null;
try { await cancellableRetry(failing, 5, 80, ctrl.signal); } catch (x) { e = x; }
const elapsed = Date.now() - started;
log("abort mid-backoff: " + calls + " attempt(s), ~" + elapsed + "ms, rejected with '" + (e && e.message) + "'");
assert(e && e.message === "cancelled", "an abort during the backoff must reject with signal.reason, not run more attempts");
assert(calls === 1, "no further attempt may run after an abort (fn ran " + calls + " times)");
assert(elapsed < 60, "an abortable backoff must unpark on abort, not wait out the full delay (took " + elapsed + "ms)");`,
    pass: "retried a flaky call to success, gave up with the real error on exhaustion, rejected an already-aborted signal up front, and unparked promptly on an abort mid-backoff",
    takeaway: "Two checkpoints make a retry cancellable: reject before the first attempt if already aborted, and make the backoff itself abortable so a cancel during the wait rejects at once. Any un-abortable sleep or swallowed abort turns a cancel into 'one more attempt'.",
    hint: "Guard once before the loop (aborted → throw signal.reason). Then loop attempts 1..tries: try return await fn(); on failure, rethrow if it's the last attempt, else await the ABORTABLE delay(...) — and let its rejection propagate straight out." });

  /* ===========================================================
     CARDS
     =========================================================== */

  CARDS.push(["Abort is cooperative — what does the holder of a resource owe the abort path?",
    "Cleanup. Abort kills nothing; it asks the work to stop. So whoever holds a resource must release it on the abort path — clear the timer, remove the listener, unlock the mutex, unlink the queued waiter — in a finally or the abort handler. And whoever registered on the signal unregisters it ({ once: true } + removeEventListener on success). Skip this and a cancel leaks timers, listeners, and permits."]);
  CARDS.push(["Why can't a JS async mutex be reentrant?",
    "A reentrant lock recognizes its current holder and lets it re-acquire. JS has no thread or owner identity to check — an async lock is just a queue of parked promises, and every acquire() awaits that queue with no notion of 'who'. So acquiring a lock you already hold parks you behind yourself: self-deadlock. Don't call lock-taking code while holding the lock; factor out a lock-free inner function instead."]);

})();
