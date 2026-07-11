"use strict";
/* Concurrency Bootcamp — authored content: module registry, quiz, drills,
   flashcards, spot-the-bug cards, write-it exercises, lessons, cross-links.

   CONTENT PACKS: js/packs/*.js load AFTER this file and BEFORE js/app.js.
   A pack appends content by pushing into these collections (LESSONS, QUIZ,
   DRILLS.<module>, CARDS, BUGHUNT, WRITE, MODULES) and registering
   cross-links in DRILL_LESSON / LESSON_PRACTICE. The app computes totals,
   permutes choices, and renders only at boot, so anything pushed here is a
   first-class citizen: progress bar, test mode, lesson links all include it. */
/* course config: the engine (js/app.js) reads storage keys and defaults here */
const COURSE = {
  id: "js-concurrency",
  storagePrefix: "cbootcamp",   // keep the historical keys so existing progress survives
};

/* Each entry carries the copy its module page renders (eyebrow/title/lead/sub),
   plus optional cross-link + quiz metadata:
     conceptLesson  index into LESSONS for the "Concept:" backlink
     cardNote       the // comment atop each quiz card (type:"lesson" only)
     poolTitle/poolQuestion   how quiz items appear in test mode
     renderFn       global function name for course-owned module types (sim/custom) */
const MODULES = [
  { id:"learn", label:"lessons", type:"learn" },
  { id:"model", label:"the model", type:"lesson",
    eyebrow:"module 00", title:"The model", conceptLesson:1,
    cardNote:"predict the console output",
    poolTitle:"Predict the output", poolQuestion:"What does this print, in order?",
    lead:`One thread. One stack. A synchronous block runs start to finish before anything else gets a turn — that's why there's no torn read until you add real threads. Async work waits in two queues: <b style="color:var(--text)">microtasks</b> (promise callbacks) drain completely after each task; <b style="color:var(--text)">macrotasks</b> (setTimeout, I/O) get one per loop.`,
    sub:`Predict each output before you tap. One at a time — answer, read why, then step on.` },
  { id:"primitives", label:"primitives", type:"drills",
    eyebrow:"module 01", title:"Build the primitives",
    lead:`Each one is a queue of deferreds plus a rule for whose <code style='font-family:var(--mono)'>resolve()</code> you call next. Choose the correct line at each decision point, then run the reference to watch the invariant hold.` },
  { id:"race", label:"workers & atomics", type:"sim", renderFn:"renderSimModule",
    eyebrow:"module 02", title:"Workers & Atomics", conceptLesson:9 },
  { id:"tradeoffs", label:"trade-offs", type:"cards",
    eyebrow:"module 03", title:"Trade-offs", conceptLesson:22,
    lead:`No code here — just the judgment calls that separate using concurrency from understanding it. Tap to flip, then advance. Rehearse until they're reflexive.` },
  { id:"bank", label:"problem bank", type:"drills",
    eyebrow:"module 04", title:"Problem bank",
    lead:`Classic concurrency problems, built on the same primitives. State the invariant in your head before you choose.` },
  { id:"toolkit", label:"interview kit", type:"drills",
    eyebrow:"module 05", title:"Interview kit",
    lead:`The async utilities interviewers actually ask you to write — <code style='font-family:var(--mono)'>debounce</code>, <code style='font-family:var(--mono)'>throttle</code>, <code style='font-family:var(--mono)'>Promise.all</code>, retry. Same drill: pick the line that holds the invariant, then run it.` },
  { id:"durable", label:"durable execution", type:"drills",
    eyebrow:"module 06", title:"Durable execution",
    lead:`The concurrency model behind workflow engines like <b style='color:var(--text)'>Temporal</b>: code that's re-run from history must stay deterministic, race durable timers, and serialize concurrent signals. Same hazards as async JS — with replay raising the stakes.` },
  { id:"bughunt", label:"spot the bug", type:"bugs",
    eyebrow:"module 07", title:"Spot the bug",
    lead:`A full concurrency class or function — the mutex, the semaphore, the bounded queue, the token bucket — with one scenario describing how it misbehaves and one subtle fault hiding in the implementation. Read the whole thing, tap the buggy line(s), then check.`,
    sub:`Reading real code and finding the fault is the actual job. One implementation at a time — read the scenario, scan the code, pick the line(s), then check.` },
  { id:"write", label:"write it", type:"write",
    eyebrow:"module 08", title:"Write it",
    lead:`No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the implementation, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.`,
    sub:`This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. Deadlocks just time out — the sandbox can't freeze the page.` },
  { id:"test", label:"test yourself", type:"test",
    eyebrow:"test yourself", title:"Test mode",
    lead:`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`,
    sub:`Prep tip: once you can pass these cold, rebuild each pattern in a blank file while talking it through out loud — that's the skill the interview actually grades.` },
];

/* ---- model module: predict-output quiz ---- */
const QUIZ = [
  { code:`queueMicrotask(() => console.log('M'));
setTimeout(() => console.log('T'), 0);
console.log('S');
Promise.resolve().then(() => console.log('P'));`,
    options:["S M P T","S T M P","M S P T"], answer:0,
    whys:[
      "Right. Sync runs first (S). Then the microtask queue drains in FIFO order — queueMicrotask's M was enqueued before the .then's P — so M, then P. setTimeout (T) is a macrotask and waits until the queue is empty.",
      "Microtasks beat macrotasks. M and P are microtasks (queueMicrotask, .then); T is a setTimeout macrotask, so it can't slip into second place — the timer runs last, after both.",
      "S is synchronous, so it logs before any deferred callback — M can't precede it. The order is sync (S), then microtasks (M, P), then the timer (T)."] },
  { code:`async function f(){ console.log(1); await null; console.log(3); }
console.log(0);
f();
console.log(2);`,
    options:["0 1 2 3","0 1 3 2","1 0 2 3"], answer:0,
    whys:[
      "Right. await null suspends f as a microtask: it logs 1, yields, the rest of the sync code logs 2, then the microtask resumes and logs 3.",
      "This assumes f() runs to completion before returning. But await null suspends it — after 1 it yields, sync code logs 2, and only then does 3 run. So 2 precedes 3.",
      "0 logs first: f() isn't called until after console.log(0). Code runs in source order until something suspends, and f() hasn't even been invoked when 0 prints."] },
  { code:`setTimeout(() => console.log('T1'));
Promise.resolve()
  .then(() => console.log('P1'))
  .then(() => console.log('P2'));
setTimeout(() => console.log('T2'));`,
    options:["T1 T2 P1 P2","P1 P2 T1 T2","P1 T1 P2 T2"], answer:1,
    whys:[
      "Timers don't go first. The whole microtask chain (P1 then P2) drains before the event loop services the timer queue, so both promises print before either timeout.",
      "Right. The promise chain (P1 then P2) is all microtasks and drains before the event loop ever reaches the timer queue (T1, T2).",
      "Microtasks don't yield to timers between steps. After P1 runs it queues P2 as another microtask; the loop drains microtasks to exhaustion (P1, P2) before touching T1."] },
  { code:`async function a(){ console.log(1); await null; console.log(4); }
async function b(){ console.log(2); await null; console.log(5); }
a();
b();
console.log(3);`,
    options:["1 2 3 4 5","1 4 2 5 3","1 2 3 5 4"], answer:0,
    whys:[
      "Right. Each function runs synchronously up to its first await, so 1 then 2 print; then the trailing sync line, 3. The two suspended functions resume in the order they parked — 4, then 5 — as the microtask queue drains.",
      "await doesn't run the rest of the function inline — it suspends. After 1, a() yields instead of printing 4, so the sync work (2, then 3) happens before either function resumes.",
      "The microtask queue is FIFO: a() parked before b(), so it resumes first and prints 4 before 5 — not after."] },
  { code:`console.log('A');
setTimeout(() => console.log('B'));
Promise.resolve().then(() => {
  console.log('C');
  setTimeout(() => console.log('D'));
});
console.log('E');`,
    options:["A E C B D","A E C D B","A B C E D"], answer:0,
    whys:[
      "Right. Sync prints A and E. The microtask runs next — C — which schedules D's timer. But B's timer was queued earlier (before C ran), and timers fire in registration order, so B precedes D.",
      "D is registered from inside the microtask, after B's timer is already queued. Timers fire in the order they were set, so B comes before D, not after.",
      "The .then microtask drains before any timer, so C can't wait behind B; and E is synchronous, so it prints before every callback."] },
  { code:`Promise.resolve()
  .then(() => console.log(1))
  .then(() => console.log(3));
Promise.resolve()
  .then(() => console.log(2))
  .then(() => console.log(4));`,
    options:["1 2 3 4","1 3 2 4","1 2 4 3"], answer:0,
    whys:[
      "Right. Both chains' first .then are queued before either runs, so 1 then 2. Each then queues its successor — 3 behind 1, 4 behind 2 — so the second layer drains 3, then 4.",
      "Chained .then callbacks don't run back-to-back: after 1 runs, 3 is only just queued, behind 2 which was already waiting. The two chains interleave a layer at a time.",
      "The chains are enqueued in source order, so the second trails the first at every step: 1,2 then 3,4 — 4 never jumps ahead of 3."] },
  { code:`async function run(){
  for (const n of [1, 2]) {
    await Promise.resolve();
    console.log(n);
  }
  console.log('done');
}
console.log('start');
run();
console.log('end');`,
    options:["start end 1 2 done","start 1 2 done end","start end 1 done 2"], answer:0,
    whys:[
      "Right. run() executes to its first await and suspends, so both sync lines — start, end — print first. Then each loop iteration resumes from a microtask: 1, then 2, then done.",
      "Calling run() doesn't block: its first await suspends it and control returns to the sync code, so end prints before any loop body. It isn't run-to-completion here.",
      "await inside the loop serializes the iterations — 1 fully precedes 2 — and done prints only after the loop finishes, so 2 comes before done."] },
];

/* ---- drill definitions (fill the blank) ---- */
const DRILLS = {
  primitives:[
    { id:"mutex", title:"Mutex", why:"one holder at a time", demo:demoMutex,
      pre:`class Mutex {
  #locked = false;
  #queue = [];
  async acquire() {
    if (!this.#locked) { this.#locked = true; return; }
    const d = deferred();
    this.#queue.push(d);
    await d.promise;          // park until someone hands me the lock
  }
  release() {`,
      blank:{ q:"A waiter is queued when release() runs. Which body stops a brand-new acquire() from barging in and giving you two holders?",
        options:[
`    const next = this.#queue.shift();
    if (next) next.resolve();
    else this.#locked = false;`,
`    this.#locked = false;
    const next = this.#queue.shift();
    if (next) next.resolve();`,
`    const next = this.#queue.shift();
    if (next) next.resolve();`],
        answer:0,
        whys:["Right. The lock is never observably free while a waiter exists — it transfers directly, so no newcomer can slip in between.",
              "This unlocks AND wakes a waiter, so a brand-new acquire() can grab the lock at the same time as the woken one. Two holders.",
              "This never sets #locked = false, so once the queue empties the mutex is stuck locked forever."] },
      post:`  }
}` },

    { id:"semaphore", title:"Semaphore", why:"N permits (a mutex is N = 1)", demo:demoSemaphore,
      pre:`class Semaphore {
  #permits; #queue = [];
  constructor(p) { this.#permits = p; }
  async acquire() {
    if (this.#permits > 0) { this.#permits--; return; }
    const d = deferred(); this.#queue.push(d); await d.promise;
  }
  release() {`,
      blank:{ q:"Run this under load for a while and one version slowly lets more than N run at once. Which release() keeps the permit count from drifting?",
        options:[
`    const next = this.#queue.shift();
    if (next) next.resolve();
    else this.#permits++;`,
`    this.#permits++;
    const next = this.#queue.shift();
    if (next) next.resolve();`,
`    const next = this.#queue.shift();
    if (next) next.resolve();`],
        answer:0,
        whys:["Right. Either a waiter inherits the permit directly, or it returns to the pool — never both.",
              "Incrementing AND waking a waiter leaks a permit: capacity drifts above N over time.",
              "When no one is waiting the permit just vanishes instead of going back to the pool, so capacity drifts DOWN over time and eventually deadlocks. It needs the else branch that does #permits++."] },
      post:`  }
}` },

    { id:"latch", title:"Latch", why:"one-shot gate: open once, all waiters go", demo:demoLatch,
      pre:`class Latch {
  #d = deferred();
  wait() { return this.#d.promise; }   // everyone awaits the same promise
  open() {`,
      blank:{ q:"Two tasks are already parked in wait(). Which open() actually releases them — and keeps the latch one-shot, so it never re-closes on a later waiter?",
        options:[
`    this.#d.resolve();`,
`    this.#d = deferred();`,
`    this.#d.resolve();
    this.#d = deferred();`],
        answer:0,
        whys:["Right. One shared promise, resolved once. A latch is one-shot — it never re-closes (that's what makes it a latch, not a gate).",
              "Replacing the promise leaves every existing waiter parked on the OLD one forever.",
              "This wakes the parked waiters, but replacing the promise re-closes the latch: anyone who calls wait() after this gets a fresh, unresolved promise and blocks forever. A latch is one-shot — it stays open."] },
      post:`  }
}` },

    { id:"barrier", title:"Barrier", why:"N parties; nobody proceeds until all arrive", demo:demoBarrier,
      pre:`class Barrier {
  #parties; #count = 0; #d = deferred();
  constructor(p) { this.#parties = p; }
  async arrive() {`,
      blank:{ q:"All N parties call arrive() concurrently. Which body releases them together — instead of leaving everyone, or all but the last, blocked forever?",
        options:[
`    if (++this.#count === this.#parties) this.#d.resolve();
    await this.#d.promise;`,
`    const d = deferred();
    if (++this.#count === this.#parties) d.resolve();
    await d.promise;`,
`    await this.#d.promise;
    if (++this.#count === this.#parties) this.#d.resolve();`],
        answer:0,
        whys:["Right. Everyone awaits one shared promise; the last arrival resolves it and the whole group releases together.",
              "A fresh local deferred per call means each party waits on its own promise — nobody is ever released.",
              "Awaiting before counting means the count never reaches #parties: all parties block before incrementing. Deadlock."] },
      post:`  }
}` },

    { id:"queue", title:"Async Queue", why:"producer/consumer; pull() blocks for a value", demo:demoQueue,
      pre:`class AsyncQueue {
  #values = []; #waiters = [];
  push(v) {`,
      blank:{ q:"A consumer already called pull() and is parked when a value arrives. Which push() delivers it exactly once — never zero times, never twice?",
        options:[
`    const w = this.#waiters.shift();
    if (w) w.resolve(v);
    else this.#values.push(v);`,
`    this.#values.push(v);`,
`    this.#values.push(v);
    const w = this.#waiters.shift();
    if (w) w.resolve(v);`],
        answer:0,
        whys:["Right. If a consumer is already waiting, deliver straight to it; otherwise buffer. Exactly one of the two.",
              "Always buffering means a consumer that called pull() first stays parked forever — the push never wakes it.",
              "Buffering AND handing to a waiter delivers the value twice: once now, once when the buffer is later drained."] },
      post:`  }
  async pull() {
    if (this.#values.length) return this.#values.shift();
    const d = deferred(); this.#waiters.push(d); return d.promise;
  }
}` },

    { id:"sequencer", title:"Sequencer", why:"release turns in a fixed order — the print-in-order pattern", demo:demoSequencer,
      pre:`class Sequencer {
  #next = 0; #gates = new Map();
  acquire(seq) {
    if (seq <= this.#next) return Promise.resolve();
    return new Promise(res => this.#gates.set(seq, res));
  }
  release(seq) {`,
      blank:{ q:"Turn 0 just finished. Which release() wakes only the one waiter whose turn is now current — without stalling the chain or releasing everyone at once?",
        options:[
`    this.#next = seq + 1;
    const n = this.#gates.get(this.#next);
    if (n) { this.#gates.delete(this.#next); n(); }`,
`    this.#next = seq + 1;
    for (const r of this.#gates.values()) r();`,
`    const n = this.#gates.get(seq + 1);
    if (n) n();`],
        answer:0,
        whys:["Right. Advance the turn, then wake only the one waiter whose turn it now is. The chain self-propagates.",
              "Waking ALL waiters destroys the ordering — everyone runs at once instead of one turn at a time.",
              "Forgetting to advance #next means the next acquire() never sees its turn as current, so it parks forever."] },
      post:`  }
}` },

    { id:"condvar", title:"Condition Variable", why:"wait for a predicate; signal when the state it depends on changes", demo:demoCondVar,
      pre:`// Tasks wait for a predicate to hold; a producer signals when the state
// it depends on changes, so the waiters can re-check and proceed.
class CondVar {
  #waiters = [];
  async wait(pred) {                  // park until pred() is true
    while (!pred()) {                 // re-check on every wake — spurious wakeups!
      const d = deferred();
      this.#waiters.push(d.resolve);
      await d.promise;
    }
  }
  signalAll() {                       // state changed: wake the waiters to re-check`,
      blank:{ q:"State changed, and several tasks wait on different predicates. Which signalAll() wakes them to re-check without a lost wakeup or leaving stale entries behind?",
        options:[
`    const ws = this.#waiters;
    this.#waiters = [];
    ws.forEach(resolve => resolve());`,
`    const w = this.#waiters.shift();
    if (w) w();`,
`    this.#waiters.forEach(resolve => resolve());`],
        answer:0,
        whys:["Right. Wake every waiter and clear the list. Each re-tests its own predicate in the while-loop, so only those whose condition now holds proceed.",
              "Waking only one waiter risks a lost wakeup: if that waiter's predicate is still false it parks again, while another waiter whose condition IS true was never woken.",
              "Resolving without clearing leaves already-resolved deferreds queued; the next signal 'wakes' stale entries and real waiters get miscounted. Wake, then clear."] },
      post:`  }
}` },

    { id:"atomiclock", title:"Atomic Lock (CAS)", why:"build a lock from one shared int + compare-and-swap — atomics are what locks are made of", demo:demoAtomicLock,
      pre:`// A lock with no higher-level primitive — just one shared integer and an
// atomic compare-and-swap. 0 = free, 1 = held. (Across real threads the
// cell lives in a SharedArrayBuffer.)
const cell = new Int32Array(1);
function tryAcquire() {`,
      blank:{ q:"Two threads run tryAcquire() at the very same instant. Which version guarantees only one of them walks away holding the lock?",
        options:[
`  return Atomics.compareExchange(cell, 0, 0, 1) === 0;`,
`  if (cell[0] === 0) { cell[0] = 1; return true; }
  return false;`,
`  if (Atomics.load(cell, 0) === 0) {
    Atomics.store(cell, 0, 1);
    return true;
  }
  return false;`],
        answer:0,
        whys:["Right. compareExchange sets 0→1 only if it's currently 0, in one indivisible step, and tells you whether you won. That test-and-set is the heart of every lock.",
              "Read-then-write is two steps — two threads can both read 0 and both 'acquire'. The whole point of CAS is to test and set atomically.",
              "Atomics.load then Atomics.store are two separate atomic steps with a gap between them — two threads can both load 0 and both store 1. Each op is atomic; the pair isn't. Closing that gap is exactly what compare-and-swap is for."] },
      post:`}
function release() {
  Atomics.store(cell, 0, 0);            // free it
}
// Blocking version: park on Atomics.wait, wake waiters with Atomics.notify.` },

    { id:"rwlock", title:"Read/Write Lock", why:"many readers in parallel, or one exclusive writer", demo:demoRWLock,
      pre:`// Many readers can hold it at once, but a writer needs it alone (no
// readers, no other writer). Grant the lock at release time — hand it off.
class RWLock {
  #readers = 0; #writing = false; #rq = []; #wq = [];
  async acquireRead()  { if (this.#writing || this.#wq.length) { const d = deferred(); this.#rq.push(d); await d.promise; } else this.#readers++; }
  releaseRead()  { this.#readers--; this.#dispatch(); }
  async acquireWrite() { if (this.#writing || this.#readers > 0 || this.#wq.length) { const d = deferred(); this.#wq.push(d); await d.promise; } else this.#writing = true; }
  releaseWrite() { this.#writing = false; this.#dispatch(); }
  #dispatch() {`,
      blank:{ q:"A writer is queued behind three active readers while more readers keep arriving. Which dispatch() gives the writer exclusivity AND keeps it from starving?",
        options:[
`    if (this.#writing) return;
    if (this.#readers === 0 && this.#wq.length) {
      this.#writing = true; this.#wq.shift().resolve();
    } else if (!this.#wq.length) {
      while (this.#rq.length) { this.#readers++; this.#rq.shift().resolve(); }
    }`,
`    while (this.#rq.length) { this.#readers++; this.#rq.shift().resolve(); }
    if (this.#wq.length) { this.#writing = true; this.#wq.shift().resolve(); }`,
`    if (this.#wq.length) { this.#writing = true; this.#wq.shift().resolve(); }`],
        answer:0,
        whys:["Right. Grant a writer only when no readers hold it (one at a time); otherwise release all waiting readers — but only when no writer is queued, so writers don't starve.",
              "Waking readers first and then a writer regardless of readers lets the writer run while readers are active, and starves writers behind a steady reader stream.",
              "Granting a writer without checking #readers lets it run while readers still hold the lock — exactly the overlap a RW lock must prevent."] },
      post:`  }
}` },

    { id:"once", title:"Run Once (lazy init)", why:"initialize exactly once, even under concurrent callers", demo:demoOnce,
      pre:`// Run an initializer at most once, even if called concurrently; every
// caller gets the same result (lazy singleton — a one-shot memo).
function once(fn) {
  let p;                       // the single in-flight / settled promise
  return () => {`,
      blank:{ q:"Four callers hit this in the same tick, before init resolves. Which body runs the initializer exactly once and hands all four the same in-flight result?",
        options:[
`    return (p ??= fn());`,
`    p = fn();
    return p;`,
`    if (!p) p = fn();
    return fn();`],
        answer:0,
        whys:["Right. ??= calls fn() and stores its promise only the first time; every later call returns that same promise — one initialization, shared by all.",
              "Reassigning p on every call re-runs fn each time — p is overwritten before it can ever guard anything. Assign only when p is still empty, which is exactly what ??= does.",
              "Storing p but then returning a fresh fn() still runs the initializer every call — the guard does nothing."] },
      post:`  };
}` },
  ],

  bank:[
    { id:"printorder", title:"Print in Order", why:"the classic 'print in order' problem: A → B → C each cycle", demo:demoPrintOrder,
      pre:`class OrderedLogger {
  #pos = { first:0, second:1, third:2 };
  #cycle = { first:0, second:0, third:0 };
  #seq = new Sequencer();
  async #run(slot, action) {
    const cycle = this.#cycle[slot]++;`,
      blank:{ q:"Cycle 2 must come strictly after cycle 1 for every slot. Which seq formula gives a flat, collision-free order across cycles — so later cycles can advance?",
        options:[
`    const seq = cycle * 3 + this.#pos[slot];`,
`    const seq = this.#pos[slot];`,
`    const seq = cycle + this.#pos[slot];`],
        answer:0,
        whys:["Right. Cycle c, slot p maps to 3c + p, giving the flat order A0 B0 C0 A1 B1 C1 …",
              "Without the cycle term, every cycle reuses seq 0/1/2 — the second cycle can never advance past the first.",
              "cycle + pos collides (cycle 1 slot 0 = 1 = cycle 0 slot 1), so the ordering scrambles."] },
      post:`    await this.#seq.acquire(seq);
    await action();          // release ONLY after success -> order survives a retry
    this.#seq.release(seq);
  }
  printFirst(a){return this.#run('first',a);}
  printSecond(a){return this.#run('second',a);}
  printThird(a){return this.#run('third',a);}
}` },

    { id:"pool", title:"Concurrency Pool", why:"run N at a time, no more (the p-limit pattern)", demo:demoPool,
      pre:`async function pool(items, limit, worker) {
  const results = []; const executing = new Set();
  for (const [i, item] of items.entries()) {
    const p = Promise.resolve().then(() => worker(item, i));
    results.push(p);
    executing.add(p);
    p.finally(() => executing.delete(p));`,
      blank:{ q:"You raise `limit` from 2 to 10 but throughput barely moves — one option secretly runs jobs in lock-step batches. Which line keeps the pool steadily full?",
        options:[
`    if (executing.size >= limit) await Promise.race(executing);`,
`    if (executing.size >= limit) await Promise.all(executing);`,
`    await Promise.race(executing);`],
        answer:0,
        whys:["Right. When full, wait for the FIRST job to finish (race), freeing exactly one slot, then continue.",
              "Promise.all drains the whole batch before starting the next — that's batching, not a steady pool, and tanks throughput.",
              "Racing on every iteration (no size check) serializes everything: you never let the pool fill to `limit`."] },
      post:`  }
  return Promise.all(results);
}` },

    { id:"dining", title:"Dining Philosophers", why:"break the circular wait with a global lock order", demo:demoDining,
      pre:`async function dine(n, rounds) {
  const fork = Array.from({ length: n }, () => new Mutex());
  let meals = 0;
  const seat = async (i) => {
    const left = i, right = (i + 1) % n;
    for (let r = 0; r < rounds; r++) {`,
      blank:{ q:"All five philosophers grab for forks at the same instant. Which acquisition order makes the circular wait impossible — not merely rarer?",
        options:[
`      const [a, b] = left < right ? [left, right] : [right, left];`,
`      const [a, b] = [left, right];`,
`      const [a, b] = [right, left];`],
        answer:0,
        whys:["Right. One global lock order (lowest index first) makes a circular wait impossible — the wrap-around philosopher reaches for fork 0 first, so the five can't each hold a left fork and block on the right.",
              "The classic deadlock: every philosopher grabs their left fork at the same await point, then all block forever on a right fork their neighbor is holding.",
              "Still an inconsistent order — most philosophers grab the higher fork first, but the wrap-around one doesn't, so the circular wait just re-forms the other way."] },
      post:`      await fork[a].acquire();
      await fork[b].acquire();
      try { meals++; await sleep(rnd(6)); }   // eat
      finally { fork[b].release(); fork[a].release(); }
    }
  };
  await Promise.all(Array.from({ length: n }, (_, i) => seat(i)));
  return meals;
}` },

    { id:"tokenbucket", title:"Token Bucket", why:"rate limiter: burst up to capacity, then steady refill", demo:demoTokenBucket,
      pre:`class TokenBucket {
  #capacity; #tokens; #ratePerMs; #last = Date.now();
  constructor(capacity, ratePerSec) {
    this.#capacity = capacity;
    this.#tokens = capacity;            // start full: one burst allowed
    this.#ratePerMs = ratePerSec / 1000;
  }
  #refill() {
    const now = Date.now();
    const gained = (now - this.#last) * this.#ratePerMs;
    this.#last = now;`,
      blank:{ q:"The bucket sits idle a full minute, then a caller bursts. Which refill stops idle time from banking an unbounded burst — yet still lets a steady caller through?",
        options:[
`    this.#tokens = Math.min(this.#capacity, this.#tokens + gained);`,
`    this.#tokens = this.#tokens + gained;`,
`    this.#tokens = Math.min(this.#capacity, gained);`],
        answer:0,
        whys:["Right. Tokens accrue while the bucket is idle but never past capacity — that ceiling is what bounds the burst. Drain it and you're throttled to the steady refill rate.",
              "No ceiling: tokens pile up without limit while idle, so after a long pause one caller can fire an unbounded burst and the rate limit silently disappears.",
              "This throws away the tokens already saved and counts only the latest drip, so a steady caller is throttled far below the intended rate."] },
      post:`  }
  async take() {
    this.#refill();
    while (this.#tokens < 1) {            // empty: wait for a token to drip in
      await sleep((1 - this.#tokens) / this.#ratePerMs);
      this.#refill();
    }
    this.#tokens -= 1;
  }
}` },

    { id:"boundedqueue", title:"Bounded Blocking Queue", why:"producer/consumer with capacity — block when full (backpressure)", demo:demoBoundedQueue,
      pre:`// Producers block when the queue is full; consumers block when it's
// empty. Capacity IS backpressure — it stops a fast producer from running
// away from a slow consumer — the capacity is the flow control.
class BoundedQueue {
  #cap; #buf = []; #pushW = []; #pullW = [];
  constructor(cap) { this.#cap = cap; }
  async push(v) {`,
      blank:{ q:"The queue is full with two producers blocked; one slot frees and they race for it. Which push() keeps the capacity bound from being overshot?",
        options:[
`    while (this.#buf.length >= this.#cap) {
      const d = deferred(); this.#pushW.push(d); await d.promise;
    }
    this.#buf.push(v);
    const w = this.#pullW.shift(); if (w) w.resolve();`,
`    this.#buf.push(v);
    const w = this.#pullW.shift(); if (w) w.resolve();`,
`    if (this.#buf.length >= this.#cap) {
      const d = deferred(); this.#pushW.push(d); await d.promise;
    }
    this.#buf.push(v);
    const w = this.#pullW.shift(); if (w) w.resolve();`],
        answer:0,
        whys:["Right. Park while full, re-checking capacity on every wake; once there's room, enqueue and wake a blocked consumer. That's backpressure.",
              "No capacity check makes it unbounded — a fast producer piles items up without limit, the backlog grows until memory dies, and backpressure is gone.",
              "An `if` checks capacity only once; after a wake the queue can be full again (another producer raced in), so push proceeds and overflows the bound. Re-check in a while-loop."] },
      post:`  }
  async pull() {
    while (this.#buf.length === 0) {
      const d = deferred(); this.#pullW.push(d); await d.promise;
    }
    const v = this.#buf.shift();
    const w = this.#pushW.shift(); if (w) w.resolve();   // wake a blocked producer
    return v;
  }
}` },

    { id:"logproc", title:"Concurrent Log Processor", why:"process A→B→C in order, and survive a subsystem failing mid-cycle", demo:demoLogProcessor,
      pre:`// Subsystems A, B, C log independently and concurrently, but must be
// PROCESSED in order A → B → C each cycle. Bonus: a subsystem can fail
// transiently and must resume without breaking the order. Ordering via a
// Sequencer; robustness via retry.
async function process(slot, action) {
  const seq = cycle[slot]++ * 3 + pos[slot];
  await sequencer.acquire(seq);        // wait for this slot's turn`,
      blank:{ q:"B fails on its turn, then succeeds on retry. Which version keeps C from printing before B — while still recovering from the blip?",
        options:[
`  await retry(action, { tries: 5 });
  sequencer.release(seq);`,
`  try { await action(); }
  finally { sequencer.release(seq); }`,
`  sequencer.release(seq);
  await retry(action, { tries: 5 });`],
        answer:0,
        whys:["Right. Retry the action while still holding the turn, and release only once it has actually succeeded — a transient failure pauses the pipeline instead of corrupting the order. Bonus solved.",
              "Releasing in finally advances the order even when the action threw — the next slot proceeds, so a failed B lets C run before B ever succeeds. Order broken on failure.",
              "Releasing before doing the work lets the next slot start immediately — the ordering guarantee is gone whether or not anything fails."] },
      post:`}` },

    { id:"select", title:"Select (first ready)", why:"wait on several async sources; take whichever is ready first", demo:demoSelect,
      pre:`// Proceed with whichever of several async sources is ready first —
// first response wins, racing replicas, value-or-timeout, and so on.
function select(sources) {           // sources: [{ label, promise }]`,
      blank:{ q:"You race three replicas and want the fastest reply plus which one it was. Which version settles on the first to finish — not the first in the list, not the slowest?",
        options:[
`  return Promise.race(
    sources.map(s => s.promise.then(v => ({ label: s.label, value: v })))
  );`,
`  return Promise.all(
    sources.map(s => s.promise.then(v => ({ label: s.label, value: v })))
  );`,
`  return Promise.race(sources.map(s => s.promise));`],
        answer:0,
        whys:["Right. Tag each source with its label, then race — the first to settle wins and you know which one it was.",
              "Promise.all waits for EVERY source, so you lose the first-ready behaviour entirely — you block on the slowest.",
              "Racing the bare promises does settle on the first ready — but you've thrown away which source won, and the scenario needs the label too. Tag each promise with its label before racing."] },
      post:`}
// A faithful channel-select also avoids consuming the losers;
// Promise.race settles first but the other promises still run.` },
  ],

  toolkit:[
    { id:"debounce", title:"Debounce", why:"a burst of calls fires fn once, after it goes quiet", demo:demoDebounce,
      pre:`function debounce(fn, wait) {
  let t;                       // the pending timer
  return function (...args) {`,
      blank:{ q:"A user types 8 keystrokes fast, then pauses. Which body fires fn exactly once, after the typing stops — not once per keystroke?",
        options:[
`    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);`,
`    t = setTimeout(() => fn.apply(this, args), wait);`,
`    t = setTimeout(() => fn.apply(this, args), wait);
    clearTimeout(t);`],
        answer:0,
        whys:["Right. Each call cancels the previous pending timer and starts a fresh one, so fn runs only after calls stop for `wait` ms — trailing-edge debounce.",
              "Without clearing, every call schedules its own timer — fn fires once per call, not once per burst. That isn't debouncing at all.",
              "The clear runs after the schedule, so it cancels the very timer just set — fn never fires at all. Clear the PREVIOUS timer first, then schedule the new one."] },
      post:`  };
}` },

    { id:"throttle", title:"Throttle", why:"run fn at most once per interval, however often it's called", demo:demoThrottle,
      pre:`function throttle(fn, interval) {
  let last = 0;                // when fn last ran
  return function (...args) {`,
      blank:{ q:"Calls pour in continuously. Which version truly caps fn to one call per `interval` — rather than never firing, or firing on every call?",
        options:[
`    const now = Date.now();
    if (now - last >= interval) {
      last = now; fn.apply(this, args);
    }`,
`    const now = Date.now();
    last = now;
    if (now - last >= interval) fn.apply(this, args);`,
`    const now = Date.now();
    if (now - last >= interval) fn.apply(this, args);`],
        answer:0,
        whys:["Right. fn fires only when at least `interval` ms have passed since the last accepted call, and `last` advances only then — leading-edge throttle.",
              "Setting `last = now` before the check makes `now - last` always 0, so the condition never passes and fn never runs.",
              "Never updating `last` means once the first interval elapses, every call fires — the rate limit is gone."] },
      post:`  };
}` },

    { id:"promiseall", title:"Promise.all from scratch", why:"resolve to results in input order; reject on the first failure", demo:demoPromiseAll,
      pre:`function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let done = 0;
    if (promises.length === 0) resolve(results);
    promises.forEach((p, i) => {
      Promise.resolve(p).then((v) => {`,
      blank:{ q:"Input is [slow, fast, medium] and they settle out of order. Which body returns results in INPUT order and resolves exactly once, after the last settles?",
        options:[
`        results[i] = v;
        if (++done === promises.length) resolve(results);`,
`        results.push(v);
        if (results.length === promises.length) resolve(results);`,
`        results[i] = v;
        resolve(results);`],
        answer:0,
        whys:["Right. Index assignment preserves input order no matter who finishes first, and the counter resolves exactly once — after the last one settles.",
              "push records results in completion order, not input order: a fast promise at index 3 lands in slot 0 and the output is scrambled.",
              "Resolving on the first settle returns a half-filled array. (A promise ignores resolve() after the first call, so the rest are silently dropped.)"] },
      post:`      }, reject);   // any rejection rejects the whole thing
    });
  });
}` },

    { id:"retry", title:"Retry with backoff", why:"retry a flaky call — bounded, with exponential backoff", demo:demoRetry,
      pre:`async function retry(fn, { tries = 3, base = 10 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {`,
      blank:{ q:"The dependency is down hard. Which version backs off AND eventually gives up — instead of hammering it forever at a fixed rate?",
        options:[
`      if (++attempt >= tries) throw err;
      await sleep(base * 2 ** (attempt - 1));`,
`      await sleep(base * 2 ** attempt);
      attempt++;`,
`      if (++attempt >= tries) throw err;
      await sleep(base);`],
        answer:0,
        whys:["Right. Re-throw once attempts are exhausted; otherwise wait an exponentially growing delay before looping. Bounded and backed off.",
              "No tries cap means a permanently-failing dependency loops forever — an unbounded retry storm. Always bound the attempts.",
              "A constant delay hammers a struggling service at a fixed rate. Exponential backoff gives it room to recover and avoids synchronized retry stampedes."] },
      post:`    }
  }
}` },

    { id:"memoize", title:"Dedupe concurrent calls", why:"many callers ask for the same key at once — compute it only once", demo:demoMemoize,
      pre:`// Cache an async function so concurrent callers for the same key share
// ONE computation (request dedup / a safe concurrent memo). The trick:
// cache the PROMISE, not the resolved value.
function memoizeAsync(fn) {
  const cache = new Map();        // key -> in-flight or settled promise
  return (key) => {
    if (cache.has(key)) return cache.get(key);`,
      blank:{ q:"Five callers ask for the same key in one tick, and the fetch can fail. Which body collapses them to one call yet still lets a later caller retry after a failure?",
        options:[
`    const p = fn(key).catch(e => { cache.delete(key); throw e; });
    cache.set(key, p);
    return p;`,
`    const v = await fn(key);
    cache.set(key, v);
    return v;`,
`    const p = fn(key);
    cache.set(key, p);
    return p;`],
        answer:0,
        whys:["Right. Store the in-flight promise immediately so concurrent callers share it; on failure, evict the key so a later call can retry.",
              "Awaiting before storing means concurrent callers all miss the cache (nothing is set yet) and each starts its own fn — no dedup at all.",
              "Caching the promise dedupes, but a rejected promise stays cached forever, so every future caller inherits the failure. Evict on error."] },
      post:`  };
}` },

    { id:"canceltimeout", title:"Cancel the Loser", why:"a timeout that actually cancels the slow work (AbortController)", demo:demoCancelTimeout,
      pre:`// Promise.race alone leaves the losing work running in the background.
// Pass an AbortSignal and abort it when the timer wins, so the slow work
// stops and cleans up.
function withTimeout(workFn, ms) {
  const ctrl = new AbortController();
  const work = workFn(ctrl.signal).then(v => ({ ok: v }), () => ({ aborted: true }));
  const timer = sleep(ms).then(() => {`,
      blank:{ q:"The timer wins the race. Which body actually stops the losing work — no leaked background fetch — AND tells the caller it timed out?",
        options:[
`    ctrl.abort();
    return { timedOut: true };`,
`    return { timedOut: true };`,
`    ctrl.abort();`],
        answer:0,
        whys:["Right. Abort the signal so the losing work stops and cleans up, and return a marker so the caller knows it was a timeout — no leaked background work.",
              "Returning the marker without aborting leaves the slow work running to completion in the background — the resource leak the timeout was meant to prevent.",
              "Aborting without returning a result resolves the race with undefined, so the caller can't tell a timeout happened."] },
      post:`  });
  return Promise.race([work, timer]);
}` },

    { id:"errgroup", title:"Cancel on First Error", why:"run tasks together; the first failure cancels the rest (errgroup)", demo:demoErrgroup,
      pre:`// Run tasks concurrently, but the FIRST failure cancels the others — no
// point finishing work whose result you'll throw away. Each task gets a
// shared AbortSignal.
async function errgroup(taskFns) {
  const ctrl = new AbortController();
  const tasks = taskFns.map(fn =>`,
      blank:{ q:"One of five concurrent tasks fails early. Which body cancels the other four AND surfaces the real error — rather than letting them finish or swallowing it?",
        options:[
`    fn(ctrl.signal).catch(err => { ctrl.abort(); throw err; })`,
`    fn(ctrl.signal)`,
`    fn(ctrl.signal).catch(() => { ctrl.abort(); })`],
        answer:0,
        whys:["Right. Share one signal; the first task to fail aborts it (cancelling the siblings) and rethrows, so Promise.all rejects with the real error.",
              "Without aborting on failure, Promise.all still rejects on the first error — but the other tasks keep running to completion, wasting work you've already decided to discard.",
              "Swallowing the error makes the failed task resolve to undefined, so Promise.all never rejects and the caller never learns it failed."] },
      post:`  );
  return Promise.all(tasks);
}` },
  ],

  durable:[
    { id:"replay", title:"Deterministic replay", why:"workflow code is re-run from history — nondeterminism must replay, not recompute", demo:demoReplay,
      pre:`// A durable workflow is re-executed from its event history to rebuild
// state. If the code branches differently on replay than it did the
// first time, it no longer matches history and the run is rejected. So
// any nondeterministic value (time, randomness) is recorded once, then
// replayed verbatim.
function sideEffect(fn) {
  if (replaying) {`,
      blank:{ q:"The worker restarts and re-runs the workflow over its history. Which branch keeps the code matching history — instead of recomputing a value that diverges?",
        options:[
`    return history[cursor++];`,
`    return fn();`,
`    const v = fn(); history.push(v); return v;`],
        answer:0,
        whys:["Right. On replay you return the exact value recorded on the first run, so every branch lands the same way and the code still matches history.",
              "Re-running a nondeterministic fn on replay yields a different value, the workflow takes a branch history doesn't record, and Temporal rejects the run as nondeterministic.",
              "Re-recording on every replay both re-runs the nondeterministic fn AND grows the log past where the cursor is — double nondeterminism."] },
      post:`  }
  const v = fn();                  // first run: execute it...
  history.push(v); cursor++;       // ...and record it for future replays
  return v;
}` },

    { id:"durabletimeout", title:"Durable timeout", why:"race the activity against a durable timer; first to settle wins", demo:demoDurableTimeout,
      pre:`// Give an activity a deadline: run it and a durable timer concurrently
// and take whichever finishes first. (In Temporal both survive a worker
// crash; here we model the race itself.)
function withTimeout(work, ms) {`,
      blank:{ q:"The activity hangs indefinitely. Which version lets the timer cut it off — instead of waiting for both to settle, or never starting the timer?",
        options:[
`  return Promise.race([
    work,
    sleep(ms).then(() => ({ timedOut: true })),
  ]);`,
`  return Promise.all([
    work,
    sleep(ms).then(() => ({ timedOut: true })),
  ]).then(([w]) => w);`,
`  const w = await work;
  await sleep(ms);
  return w;`],
        answer:0,
        whys:["Right. race settles the moment either the activity finishes or the timer fires — the durable timeout. The loser keeps running unless you cancel it (Temporal uses a CancellationScope).",
              "Promise.all waits for BOTH to settle, so a hung activity is never cut off — there is no timeout at all.",
              "Awaiting the work before the timer makes them sequential: a hung activity blocks forever and the timer never gets to fire."] },
      post:`}` },

    { id:"signalmutex", title:"Serialize concurrent signals", why:"signal handlers interleave at awaits — a critical section needs a lock", demo:demoSignalMutex,
      pre:`// A running workflow receives signals concurrently. Handlers are
// coroutines on one thread — no mid-statement preemption, but they DO
// interleave at every await. A read-modify-write that spans an await
// loses updates without a lock.
const mutex = new Mutex();
async function onWithdraw(amount) {`,
      blank:{ q:"Two withdraw signals interleave at the await between read and write. Which body stops the second from reading a stale balance — without committing before checkLimits can reject it?",
        options:[
`  await mutex.runExclusive(async () => {
    const bal = balance;
    await checkLimits(amount);
    balance = bal - amount;
  });`,
`  const bal = balance;
  await checkLimits(amount);
  balance = bal - amount;`,
`  const bal = balance;
  balance = bal - amount;
  await checkLimits(amount);`],
        answer:0,
        whys:["Right. The mutex serializes the whole read-await-write, so a second signal can't read `balance` until the first has written it back — no lost updates.",
              "With no lock, a second signal reads `balance` during the first one's await; both write back stale values — a lost update across the await.",
              "Writing before the await dodges this one case, but it commits the change before checkLimits can reject it, and any handler that must await between read and write is still unsafe."] },
      post:`}` },

    { id:"condition", title:"Wait for a signal", why:"block the workflow until a signal flips state true — Temporal's condition()", demo:demoCondition,
      pre:`// condition(): suspend the workflow until a signal makes the predicate
// true. Re-check on every wake — a still-false predicate (another
// signal, a spurious wake) has to keep waiting.
async function wait(pred) {`,
      blank:{ q:"A different signal notifies while your predicate is still false. Which body keeps waiting until it is genuinely true — without busy-polling the loop?",
        options:[
`  while (!pred()) {
    const d = deferred();
    waiters.push(d.resolve);
    await d.promise;
  }`,
`  if (!pred()) {
    const d = deferred();
    waiters.push(d.resolve);
    await d.promise;
  }`,
`  while (!pred()) {
    await sleep(0);
  }`],
        answer:0,
        whys:["Right. Park on a deferred, and on every notify re-check the predicate in a loop — you only proceed once it's genuinely true.",
              "An `if` proceeds on the first notify even if the predicate is still false (a different signal, a spurious wake). Re-check in a loop, not once.",
              "Polling with sleep(0) busy-waits the event loop instead of parking until a signal arrives — wasteful, and in a deterministic workflow, nondeterministic."] },
      post:`}` },
  ],
};

/* ---- flashcards ---- */
const CARDS = [
  ["When is spinning a thread the wrong call?","Per-unit work is tiny (~1ms). Spawn + message-passing + serialization cost dwarfs the work. Threads pay off only for CPU-bound work big enough to amortize them."],
  ["I/O-bound vs CPU-bound — which wants workers?","CPU-bound wants workers (genuine parallel compute). I/O-bound is better single-threaded async: you're waiting, not computing, so a thread just sits idle."],
  ["Where do data races actually exist in JS?","Only across worker_threads / Web Workers sharing a SharedArrayBuffer. Single-threaded run-to-completion rules them out everywhere else."],
  ["What does strict ordering cost you?","Availability. A stalled producer blocks everyone behind it. Ordering trades availability for consistency — recognize the trade before it bites you."],
  ["Unbounded retry against a dead dependency?","An unbounded backlog. Robustness isn't free: cap retries, add a circuit breaker or dead-letter path, and bound the queue."],
  ["Why Atomics.add over view[0]++ across threads?","view[0]++ is read-modify-write — three steps that interleave and lose updates. Atomics.add is one indivisible step."],
  ["Why can't a durable workflow call Date.now() or Math.random() directly?","Workflow code is re-executed from history on replay to rebuild state. Wall-clock and randomness differ each run, so replay would diverge from history. Route them through the runtime (workflow time, sideEffect) so the recorded value replays exactly."],
  ["A long-running workflow's event history keeps growing — then what?","History is replayed on every wake, so unbounded history means unbounded replay cost and a hard size cap. continue-as-new starts a fresh execution, carrying state forward with an empty history — the same instinct as capping a queue."],
  ["An activity ran, then the worker died before its result was recorded. Does it run again?","Yes — execution is at-least-once, so an activity can run more than once. Make activities idempotent (dedupe by a stable key) so a retry doesn't double-charge."],
  ["Two signals hit a running workflow at once — is its state safe?","Handlers are coroutines on one thread: no mid-statement preemption, but they interleave at every await. A read-modify-write spanning an await needs a mutex — the same hazard as any async critical section."],
  ["Condition variable: why `while (!ready) wait()` and never `if`?","Spurious wakeups and multiple waiters. A waiter can wake while the predicate is still false (another waiter consumed the change, or a bare wake). Re-check the predicate in a loop, not with a one-time `if`."],
  ["How do atomics implement a lock?","A lock sits on an atomic compare-and-swap: in one indivisible step, test 'is it 0?' and set it to 1. Win the CAS and you hold the lock; lose and you wait/retry. Atomics are the primitive beneath mutexes and semaphores."],
  ["Bounded vs unbounded queue?","Unbounded hides backpressure: a fast producer grows the backlog until memory dies. A bounded queue blocks the producer when full, pushing the slowdown back to the source — capacity IS the flow control."],
  ["Wait for N concurrent tasks to finish — how?","`await Promise.all([...])` resolves once every task settles (use `Promise.allSettled` to get results even when some reject). This barrier is 'all done' — distinct from a rendezvous barrier, which is 'all start together'."],
  ["Blocking vs non-blocking vs async, one line each?","Blocking: stop the thread until ready. Non-blocking: return now with success-or-not, caller retries. Async: hand off, keep going, get a callback later. You're trading thread-cost ↔ control ↔ throughput."],
  ["Thread pool / executor — the JS equivalent?","Bound parallelism with a concurrency pool: launch tasks up to a limit, then `await Promise.race(inFlight)` to free a slot before starting the next. Each task is just a promise you await — promises are JS's futures."],
  ["Wait on whichever of several async sources is ready first?","Tag each source, then `Promise.race` them — the first to settle wins and you know which. (A true channel-select also avoids consuming the losers; race alone doesn't.)"],
];

/* ---- spot-the-bug: real code, one broken scenario, tap the faulty line(s) ---- */
const BUGHUNT = [
  { id:"bug_semaphore", title:"Semaphore", why:"N permits, never more", lesson:3,
    scenario:"Run this under load and it slowly lets more than `count` callers run at once — capacity drifts upward over time. Which line leaks a permit?",
    lines:[
      "class Semaphore {",
      "  #permits;",
      "  #queue = [];",
      "",
      "  constructor(count) {",
      "    this.#permits = count;",
      "  }",
      "",
      "  async acquire() {",
      "    if (this.#permits > 0) {",
      "      this.#permits--;",
      "      return;",
      "    }",
      "    const d = deferred();",
      "    this.#queue.push(d);",
      "    await d.promise;",
      "  }",
      "",
      "  release() {",
      "    this.#permits++;",
      "    const next = this.#queue.shift();",
      "    if (next) next.resolve();",
      "  }",
      "",
      "  get available() {",
      "    return this.#permits;",
      "  }",
      "}",
    ],
    bug:[19],
    explain:"Line 20 always bumps the count, and then lines 21–22 also hand a permit to a waiter — so every release with someone queued adds a permit that was never returned, and capacity climbs above `count`. Increment only when nobody is waiting: hand the permit straight to the next waiter, else this.#permits++." },

  { id:"bug_boundedqueue", title:"Bounded blocking queue", why:"capacity is the backpressure", lesson:10,
    scenario:"Two producers block on a full queue; one slot frees, both wake, and the buffer ends up over capacity. pull() handles this correctly — the bug is in push(). Which line lets the bound be overshot?",
    lines:[
      "class BoundedQueue {",
      "  #cap;",
      "  #buf = [];",
      "  #notFull = [];",
      "  #notEmpty = [];",
      "",
      "  constructor(capacity) {",
      "    this.#cap = capacity;",
      "  }",
      "",
      "  async push(value) {",
      "    if (this.#buf.length >= this.#cap) {",
      "      const d = deferred();",
      "      this.#notFull.push(d);",
      "      await d.promise;",
      "    }",
      "    this.#buf.push(value);",
      "    const w = this.#notEmpty.shift();",
      "    if (w) w.resolve();",
      "  }",
      "",
      "  async pull() {",
      "    while (this.#buf.length === 0) {",
      "      const d = deferred();",
      "      this.#notEmpty.push(d);",
      "      await d.promise;",
      "    }",
      "    const value = this.#buf.shift();",
      "    const w = this.#notFull.shift();",
      "    if (w) w.resolve();",
      "    return value;",
      "  }",
      "}",
    ],
    bug:[11],
    explain:"Line 12 re-checks capacity with `if`, so a woken producer proceeds even when another producer already took the freed slot. pull() gets it right on line 23 with `while` — push() needs the same: re-test capacity on every wake, not once." },

  { id:"bug_mutex", title:"Mutex", why:"exactly one holder at a time", lesson:3,
    scenario:"This mutex occasionally lets two tasks into the critical section at once. acquire() and runExclusive() are correct — the bug is in release(). Which line lets a newcomer barge in?",
    lines:[
      "class Mutex {",
      "  #locked = false;",
      "  #queue = [];",
      "",
      "  async acquire() {",
      "    if (!this.#locked) {",
      "      this.#locked = true;",
      "      return;",
      "    }",
      "    const d = deferred();",
      "    this.#queue.push(d);",
      "    await d.promise;",
      "  }",
      "",
      "  release() {",
      "    this.#locked = false;",
      "    const next = this.#queue.shift();",
      "    if (next) next.resolve();",
      "  }",
      "",
      "  async runExclusive(fn) {",
      "    await this.acquire();",
      "    try {",
      "      return await fn();",
      "    } finally {",
      "      this.release();",
      "    }",
      "  }",
      "}",
    ],
    bug:[15],
    explain:"Line 16 clears #locked while a waiter is still queued, so for a moment the lock reads as free — a brand-new acquire() grabs it in the same tick the woken waiter resumes believing it holds the lock. Two holders. Transfer the lock instead: only set #locked = false when the queue is empty, otherwise just resolve the next waiter." },

  { id:"bug_tokenbucket", title:"Token bucket", why:"burst to capacity, then steady refill", lesson:14,
    scenario:"Leave the bucket idle for a minute, then one caller fires a burst that sails straight past the rate limit. Which line lets idle time bank unlimited tokens?",
    lines:[
      "class TokenBucket {",
      "  #capacity;",
      "  #tokens;",
      "  #ratePerMs;",
      "  #last = Date.now();",
      "",
      "  constructor(capacity, ratePerSec) {",
      "    this.#capacity = capacity;",
      "    this.#tokens = capacity;",
      "    this.#ratePerMs = ratePerSec / 1000;",
      "  }",
      "",
      "  #refill() {",
      "    const now = Date.now();",
      "    const elapsed = now - this.#last;",
      "    this.#last = now;",
      "    this.#tokens = this.#tokens + elapsed * this.#ratePerMs;",
      "  }",
      "",
      "  async take() {",
      "    this.#refill();",
      "    while (this.#tokens < 1) {",
      "      await sleep((1 - this.#tokens) / this.#ratePerMs);",
      "      this.#refill();",
      "    }",
      "    this.#tokens -= 1;",
      "  }",
      "}",
    ],
    bug:[16],
    explain:"Line 17 adds the elapsed tokens with no ceiling, so a long idle stretch accrues unbounded tokens and the next caller bursts without limit — the rate cap silently disappears. Clamp to capacity: this.#tokens = Math.min(this.#capacity, this.#tokens + elapsed * this.#ratePerMs)." },

  { id:"bug_rwlock", title:"Read/write lock", why:"many readers, or one lone writer", lesson:7,
    scenario:"Readers and writers are meant to be mutually exclusive, but a writer sometimes runs while readers still hold the lock. acquireWrite() correctly queues behind active readers — the bug is in how the lock is handed out at release. Which line grants a writer too eagerly?",
    lines:[
      "class RWLock {",
      "  #readers = 0;",
      "  #writing = false;",
      "  #readQ = [];",
      "  #writeQ = [];",
      "",
      "  async acquireRead() {",
      "    if (this.#writing || this.#writeQ.length) {",
      "      const d = deferred();",
      "      this.#readQ.push(d);",
      "      await d.promise;",
      "    } else this.#readers++;",
      "  }",
      "",
      "  async acquireWrite() {",
      "    if (this.#writing || this.#readers > 0) {",
      "      const d = deferred();",
      "      this.#writeQ.push(d);",
      "      await d.promise;",
      "    } else this.#writing = true;",
      "  }",
      "",
      "  releaseRead()  { this.#readers--; this.#dispatch(); }",
      "  releaseWrite() { this.#writing = false; this.#dispatch(); }",
      "",
      "  #dispatch() {",
      "    if (this.#writeQ.length) {",
      "      this.#writing = true;",
      "      this.#writeQ.shift().resolve();",
      "    } else {",
      "      while (this.#readQ.length) {",
      "        this.#readers++;",
      "        this.#readQ.shift().resolve();",
      "      }",
      "    }",
      "  }",
      "}",
    ],
    bug:[26],
    explain:"Line 27 grants a queued writer whenever one is waiting, without checking that every reader has left. When a reader releases while others are still active, #dispatch() hands the writer the lock mid-read — the exact overlap the lock must prevent. Guard it on the reader count: if (this.#writeQ.length && this.#readers === 0)." },

  { id:"bug_pool", title:"Concurrency pool", why:"keep N running, no batching", lesson:12,
    scenario:"You raise `limit` from 2 to 10 but throughput barely moves — jobs run in lock-step batches instead of a steady stream. Which line stalls the pool?",
    lines:[
      "async function pool(items, limit, worker) {",
      "  const results = [];",
      "  const executing = new Set();",
      "",
      "  for (const [i, item] of items.entries()) {",
      "    const p = Promise.resolve().then(() => worker(item, i));",
      "    results.push(p);",
      "    executing.add(p);",
      "    p.finally(() => executing.delete(p));",
      "",
      "    if (executing.size >= limit) {",
      "      await Promise.all(executing);",
      "    }",
      "  }",
      "  return Promise.all(results);",
      "}",
    ],
    bug:[11],
    explain:"Line 12 waits for the entire in-flight set to drain before continuing, so work runs in batches of `limit` and the slowest job in each batch gates the next. Free just one slot instead: await Promise.race(executing)." },

  { id:"bug_condvar", title:"Condition variable", why:"re-check the predicate on every wake", lesson:5,
    scenario:"A task waits for its predicate to hold. Another signal fires notifyAll() while the predicate is still false, and the waiter charges ahead anyway. Which line lets a false predicate through?",
    lines:[
      "class CondVar {",
      "  #waiters = [];",
      "",
      "  async wait(predicate) {",
      "    if (!predicate()) {",
      "      const d = deferred();",
      "      this.#waiters.push(d.resolve);",
      "      await d.promise;",
      "    }",
      "  }",
      "",
      "  notifyAll() {",
      "    const woken = this.#waiters;",
      "    this.#waiters = [];",
      "    woken.forEach(resolve => resolve());",
      "  }",
      "}",
    ],
    bug:[4],
    explain:"Line 5 checks the predicate once with `if`, so a single notify lets the waiter proceed even when its condition is still false — a different signal, or a spurious wake. Re-test on every wake: while (!predicate()) { ... }." },

  { id:"bug_memoize", title:"Async dedup", why:"concurrent callers share one call", lesson:19,
    scenario:"Five callers ask for the same key in the same tick, but fn still runs five times — no dedup at all. Which line defeats the cache?",
    lines:[
      "function memoizeAsync(fn) {",
      "  const cache = new Map();",
      "",
      "  return async (key) => {",
      "    if (cache.has(key)) {",
      "      return cache.get(key);",
      "    }",
      "    const value = await fn(key);",
      "    cache.set(key, value);",
      "    return value;",
      "  };",
      "}",
    ],
    bug:[7],
    explain:"Line 8 awaits fn(key) before anything is stored, so all five concurrent callers miss the cache and each launches its own fn. Cache the in-flight PROMISE synchronously — cache.set(key, fn(key)) — so callers in the same tick share one computation (evict on rejection so failures can retry)." },

  { id:"bug_dining", title:"Dining philosophers", why:"break the circular wait", lesson:13,
    scenario:"All n philosophers sit down at once and the program hangs — nobody ever eats. Which line(s) create the circular wait?",
    lines:[
      "async function dine(n, rounds) {",
      "  const forks = Array.from({ length: n }, () => new Mutex());",
      "  let meals = 0;",
      "",
      "  const philosopher = async (i) => {",
      "    const left = i;",
      "    const right = (i + 1) % n;",
      "    for (let r = 0; r < rounds; r++) {",
      "      await forks[left].acquire();",
      "      await forks[right].acquire();",
      "      meals++;",
      "      await eat();",
      "      forks[right].release();",
      "      forks[left].release();",
      "    }",
      "  };",
      "",
      "  await Promise.all(",
      "    Array.from({ length: n }, (_, i) => philosopher(i))",
      "  );",
      "  return meals;",
      "}",
    ],
    bug:[8,9],
    explain:"Lines 9 and 10 always take the left fork then the right, in seat order. When every philosopher grabs their left fork at the same instant, each blocks on a right fork its neighbour holds — a circular wait. Impose one global order: acquire the lower-numbered fork first, e.g. const [a, b] = left < right ? [left, right] : [right, left]." },

  { id:"bug_replay", title:"Durable workflow", why:"replay must match history", lesson:21,
    scenario:"This workflow runs fine until a worker restart replays it from history, where Temporal rejects it as nondeterministic. Which line produces a value that won't match the recorded history?",
    lines:[
      "async function reservationWorkflow(ctx, order) {",
      "  const reservationId = Math.random().toString(36).slice(2);",
      "  await ctx.activity('reserveInventory', order, reservationId);",
      "",
      "  const paid = await ctx.condition(() => ctx.state.paid, '15m');",
      "  if (!paid) {",
      "    await ctx.activity('releaseInventory', reservationId);",
      "    return { status: 'expired' };",
      "  }",
      "",
      "  await ctx.activity('ship', order, reservationId);",
      "  return { status: 'shipped', reservationId };",
      "}",
    ],
    bug:[1],
    explain:"Line 2 calls Math.random() directly in workflow code. On replay it produces a different id than the original run, so the following activity calls no longer match history and the run is rejected. Generate nondeterministic values through the runtime (a recorded side effect) so the value replays verbatim." },
];

/* ===========================================================
   WRITE IT — assemble the implementation from a shuffled line
   bank (Parsons problems with distractors). Grading is honest:
   the assembled code actually RUNS against assertions in a
   sandboxed worker — any arrangement that passes the tests
   passes. Each exercise:
     lines       the reference body, in order (shown on solve)
     distractors plausible trap lines; each explains itself if
                 it's in the build when the tests fail
     test        source appended after the user's code in the
                 sandbox; log()/assert() like the demo runners
   =========================================================== */
const WRITE = [
  { id:"w-mutex", title:"Mutex — write it", why:"one holder at a time, handed over directly", lesson:3,
    spec:"Write both methods. acquire() takes the lock if it's free, otherwise parks on the queue. release() must hand the lock DIRECTLY to the next waiter — the lock must never look free while someone is queued.",
    pre:`class Mutex {
  #locked = false;
  #queue = [];`,
    post:`}`,
    lines:[
      "  async acquire() {",
      "    if (!this.#locked) { this.#locked = true; return; }",
      "    const d = deferred();",
      "    this.#queue.push(d);",
      "    await d.promise;",
      "  }",
      "  release() {",
      "    const next = this.#queue.shift();",
      "    if (next) next.resolve();",
      "    else this.#locked = false;",
      "  }",
    ],
    distractors:[
      { code:"    this.#locked = false;",
        why:"Clearing #locked while a waiter exists makes the lock observably free for an instant — a brand-new acquire() barges in while the woken waiter also proceeds: two holders." },
      { code:"    if (next) this.#locked = false;",
        why:"Backwards. When a waiter exists the lock transfers and STAYS held; only when the queue is empty do you clear #locked." },
      { code:"    this.#queue.push(deferred());",
        why:"Pushes a deferred but awaits nothing — acquire() returns immediately without the lock. Park on the SAME deferred you queued: await d.promise." },
    ],
    test:`const m = new Mutex();
let inside = 0, peak = 0, finished = 0;
async function job(name) {
  await m.acquire();
  inside++; peak = Math.max(peak, inside);
  await sleep(5);
  inside--; finished++;
  m.release();
}
await Promise.all([job("A"), job("B"), job("C")]);
log("3 jobs through the critical section, peak occupancy " + peak);
assert(finished === 3, "all 3 jobs must finish - release() has to wake the queue");
assert(peak === 1, "two jobs were inside the critical section at once - mutual exclusion broken");
const m2 = new Mutex();
await m2.acquire();
let holders = 0;
const enter = async () => { await m2.acquire(); holders++; };
const parked = enter();     // parks on the queue
m2.release();               // must hand over directly...
const barger = enter();     // ...so this newcomer must queue, not barge
await sleep(10);
log("release with one waiter parked + an instant barge attempt: " + holders + " holder(s)");
assert(holders === 1, "the lock looked free for an instant - a barger got in alongside the woken waiter");`,
    pass:"mutual exclusion held, and release() handed over with no gap for a barger",
    takeaway:"The whole trick is the direct handoff: release() never clears #locked while a waiter exists, so there is no instant where a newcomer can slip in ahead of the queue.",
    hint:"acquire() first: fast path (free → take it and return), slow path (make a deferred, queue it, await it). Then release(): wake the next waiter if there is one; otherwise — and only otherwise — clear #locked." },

  { id:"w-queue", title:"Async queue — write it", why:"producer/consumer handoff, exactly once", lesson:3,
    spec:"push() delivers an item to exactly one place: a parked waiter if one exists, else the buffer. pop() returns a buffered item immediately, or parks until a push wakes it with the item.",
    pre:`class AsyncQueue {
  #items = [];
  #waiters = [];`,
    post:`}`,
    lines:[
      "  push(item) {",
      "    const w = this.#waiters.shift();",
      "    if (w) w.resolve(item);",
      "    else this.#items.push(item);",
      "  }",
      "  async pop() {",
      "    if (this.#items.length > 0) return this.#items.shift();",
      "    const d = deferred();",
      "    this.#waiters.push(d);",
      "    return d.promise;",
      "  }",
    ],
    distractors:[
      { code:"    this.#items.push(item);",
        why:"Unconditional store: when a waiter exists the item lands in the buffer AND wakes the waiter — deliver to exactly one place or you double-count (or strand the item)." },
      { code:"    if (w) w.resolve(this.#items.shift());",
        why:"The item in hand never entered #items — this wakes the waiter with undefined (or an older item) and loses the new one." },
      { code:"    return d;",
        why:"Returns the deferred wrapper itself, immediately — the caller gets an object instead of parking until push() delivers the item. Return d.promise." },
    ],
    test:`const q = new AsyncQueue();
const first = q.pop();          // consumer arrives before any item
q.push("a");
assert(await first === "a", "a parked pop() must be woken by the next push, with the item");
log("pop-before-push: parked consumer got \\"a\\"");
q.push("b"); q.push("c");       // producer runs ahead
assert(await q.pop() === "b", "buffered items must come out in FIFO order");
assert(await q.pop() === "c", "buffered items must come out in FIFO order");
log("push-before-pop: b, c buffered and served in order");
const p = q.pop();
q.push("d");
assert(await p === "d", "each item must be delivered exactly once");
const empty = await Promise.race([q.pop(), sleep(15).then(() => "still-waiting")]);
assert(empty === "still-waiting", "pop() on an empty queue must park, not return");
log("exactly-once delivery held; empty pop parks");`,
    pass:"handoff worked both directions, FIFO held, nothing lost or duplicated",
    takeaway:"push() and pop() are mirror images: each checks the other side's line first (a parked waiter / a buffered item) and only then falls back to its own (buffer it / park).",
    hint:"push(): try to hand the item to a parked waiter first; only buffer when nobody is waiting. pop(): drain the buffer first; only park when it's empty." },

  { id:"w-pool", title:"Concurrency pool — write it", why:"N workers drain a shared cursor", lesson:12,
    spec:"Run fn over every item with at most `limit` in flight, and return the results in input order. The worker-pool pattern: a shared cursor, `limit` workers that loop claiming the next index.",
    pre:`async function mapPool(items, limit, fn) {`,
    post:`}`,
    lines:[
      "  const results = new Array(items.length);",
      "  let next = 0;",
      "  async function worker() {",
      "    while (next < items.length) {",
      "      const i = next++;",
      "      results[i] = await fn(items[i], i);",
      "    }",
      "  }",
      "  const n = Math.min(limit, items.length);",
      "  await Promise.all(Array.from({ length: n }, worker));",
      "  return results;",
    ],
    distractors:[
      { code:"      results[i] = await fn(items[next], i);",
        why:"By the time fn runs, other workers have advanced next — you'd process a shifted (or undefined) item. Claim the index once (const i = next++) and use i everywhere after." },
      { code:"      const i = ++next;",
        why:"Pre-increment claims the slot AFTER advancing: index 0 is never processed and the last worker runs one past the end." },
      { code:"  await Promise.race(Array.from({ length: n }, worker));",
        why:"race settles when the FIRST worker drains its last item — the others are still mid-flight, so you return with holes in results." },
    ],
    test:`let running = 0, peak = 0, calls = 0;
const fn = async (x) => { calls++; running++; peak = Math.max(peak, running); await sleep(10); running--; return x * 2; };
const out = await mapPool([1, 2, 3, 4, 5], 2, fn);
log("5 items, limit 2 -> results [" + out.join(", ") + "], peak in-flight " + peak);
assert(Array.isArray(out) && out.length === 5, "must return one result per item");
assert(out.join(",") === "2,4,6,8,10", "results must line up with their input positions");
assert(calls === 5, "every item must be processed exactly once (fn ran " + calls + " times)");
assert(peak === 2, "with limit 2, exactly 2 items should be in flight at the busiest moment (peak was " + peak + ")");
const one = await mapPool(["only"], 4, async (x) => x.toUpperCase());
assert(one.length === 1 && one[0] === "ONLY", "limit larger than the item count must still work");
log("limit > items handled");`,
    pass:"all items processed once each, in-order results, in-flight count pinned at the limit",
    takeaway:"The shared cursor IS the coordination: next++ atomically claims a slot (single-threaded JS — no torn read), so `limit` copies of the same loop never collide and the pool self-balances.",
    hint:"Shape: results array + cursor, an inner async worker() that loops { claim i = next++, results[i] = await fn(...) }, then launch min(limit, items.length) workers and await them ALL." },

  { id:"w-tokenbucket", title:"Token bucket — write it", why:"burst up to capacity, then the drip rate", lesson:14,
    spec:"refill() drips one token per tick but never past capacity. tryRemove() spends a token if one exists, else denies. The constructor (given) starts the bucket full and ticks refill() on an interval.",
    pre:`class TokenBucket {
  constructor(capacity, refillMs) {
    this.capacity = capacity;
    this.tokens = capacity;
    setInterval(() => this.refill(), refillMs);
  }`,
    post:`}`,
    lines:[
      "  refill() {",
      "    if (this.tokens < this.capacity) this.tokens++;",
      "  }",
      "  tryRemove() {",
      "    if (this.tokens === 0) return false;",
      "    this.tokens--;",
      "    return true;",
      "  }",
    ],
    distractors:[
      { code:"    this.tokens++;",
        why:"Refilling with no cap lets tokens pile up through every quiet period — then one giant burst blows straight past the limit. Capacity IS the burst budget." },
      { code:"    if (this.tokens === 0) this.tokens = this.capacity;",
        why:"Refill-to-full-on-empty turns the limiter into a pulse: starve, then full burst. The steady one-per-tick drip (capped) is what smooths the rate." },
      { code:"    return this.tokens >= 0;",
        why:"Zero tokens must deny. This lets the request through without ever spending a token, so the bucket never pushes back at all." },
    ],
    test:`const b = new TokenBucket(3, 15);
let granted = 0;
for (let i = 0; i < 10; i++) if (b.tryRemove()) granted++;
log("burst of 10 asks against capacity 3: " + granted + " granted");
assert(granted === 3, "a fresh bucket of capacity 3 must grant exactly 3 of a burst of 10 (granted " + granted + ")");
await sleep(50);                 // ~3 refill ticks
let refilled = 0;
for (let i = 0; i < 10; i++) if (b.tryRemove()) refilled++;
log("after ~3 ticks: " + refilled + " granted");
assert(refilled >= 2 && refilled <= 4, "about 3 tokens should have dripped back (got " + refilled + ")");
await sleep(200);                // long quiet period: ~13 ticks
let burst = 0;
for (let i = 0; i < 10; i++) if (b.tryRemove()) burst++;
assert(burst === 3, "tokens must cap at capacity during quiet periods - a burst of " + burst + " means the bucket overfilled");
log("long quiet period: bucket capped at capacity");`,
    pass:"burst capped at capacity, tokens dripped back, and the quiet period didn't overfill the bucket",
    takeaway:"Two rules make the limiter: spend-if-available (deny at zero, no debt) and drip-with-a-ceiling (quiet time buys you at most `capacity` of future burst, never more).",
    hint:"refill() is one guarded increment — the guard against capacity is the entire point. tryRemove() is deny-at-zero, else decrement and allow." },

  { id:"w-debounce", title:"Debounce — write it", why:"only the last call in a burst fires", lesson:16,
    spec:"Return a wrapped function. Every call cancels the pending timer and arms a fresh one — so fn runs once, ms after the burst goes quiet, with the LAST call's arguments.",
    pre:`function debounce(fn, ms) {`,
    post:`}`,
    lines:[
      "  let timer = null;",
      "  return (...args) => {",
      "    clearTimeout(timer);",
      "    timer = setTimeout(() => fn(...args), ms);",
      "  };",
    ],
    distractors:[
      { code:"    timer = setTimeout(fn(...args), ms);",
        why:"fn(...args) CALLS fn right now and hands its return value to setTimeout — the burst isn't quieted at all. Wrap it in a closure: () => fn(...args)." },
      { code:"    if (timer) return;",
        why:"Ignoring calls while a timer is pending means the FIRST call in the burst wins — a broken throttle. Debounce must reset the countdown so the LAST call and its args win." },
      { code:"  let timer = setTimeout(fn, ms);",
        why:"Arming a timer before any call schedules a stray invocation of fn with no arguments — start with nothing pending." },
    ],
    test:`const hits = [];
const save = debounce((v) => hits.push(v), 30);
save(1); await sleep(10); save(2); await sleep(10); save(3);
await sleep(60);
log("burst 1,2,3 inside the window -> fired with: [" + hits.join(", ") + "]");
assert(hits.length === 1, "a burst of 3 calls inside the window must collapse to exactly 1 run (got " + hits.length + ")");
assert(hits[0] === 3, "the LAST call's arguments must win (fired with " + hits[0] + ")");
save(4);
await sleep(60);
assert(hits.length === 2 && hits[1] === 4, "a lone call after quiet must fire on its own, once");
log("lone call after quiet fired once");`,
    pass:"the burst collapsed to one trailing call carrying the final arguments",
    takeaway:"Debounce is one line of state (the pending timer) and one rule (every call resets it). If you find yourself checking the timer instead of clearing it, you've drifted into throttle.",
    hint:"One `timer` variable in the closure. The wrapper does exactly two things, in order: clearTimeout(timer), then arm a new setTimeout that closes over THIS call's args." },

  { id:"w-promiseall", title:"Promise.all — write it", why:"fan out, keep order, first rejection wins", lesson:17,
    spec:"Resolve with every value at its input index (plain non-promise values allowed), reject as soon as any input rejects, and handle the empty array. Count settlements — don't trust array length.",
    pre:`function promiseAll(promises) {
  return new Promise((resolve, reject) => {`,
    post:`  });
}`,
    lines:[
      "    const results = new Array(promises.length);",
      "    let remaining = promises.length;",
      "    if (remaining === 0) return resolve(results);",
      "    promises.forEach((p, i) => {",
      "      Promise.resolve(p).then((v) => {",
      "        results[i] = v;",
      "        if (--remaining === 0) resolve(results);",
      "      }, reject);",
      "    });",
    ],
    distractors:[
      { code:"        results.push(v);",
        why:"push stores by completion order, not input position — the fastest promise steals slot 0. Write to results[i] so each value lands at its own index." },
      { code:"      p.then((v) => {",
        why:"Plain values have no .then — Promise.all accepts non-promises too, so normalize each input with Promise.resolve(p) first." },
      { code:"        if (results.length === promises.length) resolve(results);",
        why:"new Array(n) already HAS length n — this resolves on the very first settlement, long before the slow inputs land. Count settlements down, don't measure length." },
    ],
    test:`const slow = sleep(30).then(() => "slow");
const fast = sleep(5).then(() => "fast");
const out = await promiseAll([slow, fast, "plain"]);
log("mixed inputs resolved to: [" + out.join(", ") + "]");
assert(out.length === 3 && out[0] === "slow" && out[1] === "fast" && out[2] === "plain",
  "values must keep INPUT order even when they settle out of order (and plain values pass through)");
const none = await promiseAll([]);
assert(Array.isArray(none) && none.length === 0, "an empty array must resolve immediately with []");
log("empty array resolved immediately");
let err = null;
try { await promiseAll([sleep(5).then(() => "ok"), sleep(10).then(() => { throw new Error("boom"); })]); }
catch (e) { err = e; }
assert(err && err.message === "boom", "one rejection must reject the whole thing with that error");
log("first rejection propagated");`,
    pass:"order preserved under out-of-order completion, empty input handled, rejection propagated",
    takeaway:"The two load-bearing choices: store by input index (results[i] = v), and count settlements down to zero. Everything that looks simpler — push, length checks — breaks under out-of-order completion.",
    hint:"Preallocate results and a `remaining` counter (resolve now if it's already 0). For each input: normalize with Promise.resolve, store at its own index, decrement, resolve when the count hits zero — and pass reject as the second .then handler." },

  { id:"w-retry", title:"Retry with backoff — write it", why:"await inside try, or catch sees nothing", lesson:18,
    spec:"Call fn up to `tries` times. Success returns immediately. Each failure before the last waits baseMs × 2^(attempt−1), then retries; the final failure rethrows the original error.",
    pre:`async function retry(fn, tries, baseMs) {`,
    post:`}`,
    lines:[
      "  for (let attempt = 1; ; attempt++) {",
      "    try {",
      "      return await fn();",
      "    } catch (err) {",
      "      if (attempt >= tries) throw err;",
      "      await sleep(baseMs * 2 ** (attempt - 1));",
      "    }",
      "  }",
    ],
    distractors:[
      { code:"      return fn();",
        why:"Without await, the pending promise is returned before it settles — the catch block never sees the rejection, so a failing call escapes on attempt 1 with zero retries." },
      { code:"      if (attempt > tries) throw err;",
        why:"Off-by-one: this lets tries + 1 calls happen. The `tries`-th failure is the last — rethrow when attempt REACHES tries." },
      { code:"    } catch {",
        why:"Catching without binding the error throws it away — when retries are exhausted there's nothing left to rethrow. Bind it: catch (err)." },
    ],
    test:`let calls = 0;
const flaky = async () => { calls++; if (calls < 3) throw new Error("flaky #" + calls); return "recovered"; };
let v = null, unexpected = null;
try { v = await retry(flaky, 5, 5); } catch (e) { unexpected = e; }
assert(!unexpected, "a call that eventually succeeds must not reject (retry gave up with: " + (unexpected && unexpected.message) + ")");
log("flaky call: " + calls + " attempts -> " + v);
assert(v === "recovered", "must resolve with fn's value once it succeeds");
assert(calls === 3, "must stop retrying the moment fn succeeds (made " + calls + " calls)");
calls = 0;
let err = null;
try { await retry(async () => { calls++; throw new Error("down"); }, 3, 5); }
catch (e) { err = e; }
log("always-failing call: " + calls + " attempts, then threw '" + (err && err.message) + "'");
assert(calls === 3, "tries = 3 means exactly 3 attempts, no more, no fewer (made " + calls + ")");
assert(err && err.message === "down", "after the last attempt the ORIGINAL error must surface");`,
    pass:"retried to success, stopped at the cap, and the original error surfaced at the end",
    takeaway:"`return await fn()` is the whole exercise: without that await, the rejection settles after you've already left the try block, and your retry loop silently never loops.",
    hint:"A forever-for loop with attempt starting at 1. Inside: try { return await fn() } catch (err) { rethrow if attempt >= tries, else sleep baseMs × 2^(attempt−1) }." },

  { id:"w-dedupe", title:"In-flight dedup — write it", why:"share the fetch while it's flying, then let go", lesson:19,
    spec:"Wrap an async fn so concurrent calls with the same key share ONE in-flight promise. When it settles, evict that key — a later call fetches fresh. Other keys are untouched.",
    pre:`function dedupe(fn) {`,
    post:`}`,
    lines:[
      "  const inflight = new Map();",
      "  return (key) => {",
      "    if (inflight.has(key)) return inflight.get(key);",
      "    const p = fn(key).finally(() => inflight.delete(key));",
      "    inflight.set(key, p);",
      "    return p;",
      "  };",
    ],
    distractors:[
      { code:"    const p = fn(key);",
        why:"Nothing ever evicts the entry — after the fetch settles, every future call for that key gets the stale first promise forever. That's an unbounded cache, not in-flight dedup." },
      { code:"    const p = fn(key).finally(() => inflight.clear());",
        why:"clear() evicts EVERY key when one settles — a concurrent fetch for a different key loses its dedup entry mid-flight and the next caller launches a duplicate." },
      { code:"    if (inflight.has(key)) return fn(key);",
        why:"Backwards — on a hit this launches ANOTHER fetch. A hit is exactly when you must return the promise that's already in flight." },
    ],
    test:`const gates = {};
const launches = { a: 0, b: 0 };
const fetcher = (key) => { launches[key]++; gates[key] = deferred(); return gates[key].promise; };
const get = dedupe(fetcher);
const p1 = get("a"), p2 = get("a"), pb = get("b");
assert(p1 === p2, "two calls for the same key in flight must share ONE promise");
assert(launches.a === 1, "the underlying fetch for 'a' must launch once (launched " + launches.a + " times)");
log("concurrent get(a), get(a): one launch, one shared promise");
gates.a.resolve("A1");
assert(await p1 === "A1", "callers must receive the fetched value");
await sleep(1);
get("a");
assert(launches.a === 2, "after the fetch settles the entry must be evicted - a new call refetches (launched " + launches.a + " times)");
log("post-settle get(a) launched a fresh fetch");
const pb2 = get("b");
assert(pb === pb2 && launches.b === 1, "evicting 'a' must not touch 'b', still in flight (b launched " + launches.b + " times)");
log("b's in-flight entry survived a's eviction");
gates.b.resolve("B1"); gates.a.resolve("A2");`,
    pass:"one launch per key while in flight, per-key eviction on settle, fresh fetch afterward",
    takeaway:"The lifetime of a map entry IS the semantics: set on launch, delete-that-key on settle (.finally). Forget the eviction and you built a cache; evict too broadly and you un-dedup everyone else.",
    hint:"Map hit → return the stored promise. Miss → launch fn(key), chain .finally(() => inflight.delete(key)) BEFORE storing, store it, return it." },
];

/* ---- lessons: illustrated primer, one chapter at a time ---- */
const LESSONS = [
  { eb:"lesson 01 · the model", title:"One thread, many turns", html:`
    <p class="big">JavaScript runs your code on <b class="hl">one thread</b>. There's a single call stack, and a function runs to completion before anything else gets a turn — it is never interrupted mid-statement.</p>
    <p>So how does it juggle timers, clicks, and network calls at once? It <b class="hl">defers</b> them. That work doesn't run inline — it's queued and picked up later by the <b class="hl">event loop</b>, which runs one piece at a time in the gaps between your synchronous blocks.</p>
    <div class="diagram anim">
      <div class="dlabel">the runtime &middot; watch one turn of the loop</div>
      <svg class="elsvg" viewBox="0 0 320 214" width="100%" style="max-width:344px;display:block;margin:6px auto 0" font-family="ui-monospace,monospace">
        <path d="M 78 170 L 160 42 L 242 170 L 78 170 Z" fill="none" stroke="#244155" stroke-width="1.5" stroke-dasharray="4 5"/>
        <rect x="110" y="22" width="100" height="42" rx="8" fill="#071726" stroke="#4eaeff"/>
        <text x="160" y="39" fill="#4eaeff" font-size="9" text-anchor="middle">CALL STACK</text>
        <text x="160" y="54" fill="#c6d8e6" font-size="9.5" text-anchor="middle">run to empty</text>
        <rect x="8" y="170" width="124" height="40" rx="8" fill="#071726" stroke="#fb923c"/>
        <text x="70" y="187" fill="#fb923c" font-size="9" text-anchor="middle">MACROTASKS</text>
        <text x="70" y="201" fill="#c6d8e6" font-size="9" text-anchor="middle">take one</text>
        <rect x="188" y="170" width="124" height="40" rx="8" fill="#071726" stroke="#34d3bf"/>
        <text x="250" y="187" fill="#34d3bf" font-size="9" text-anchor="middle">MICROTASKS</text>
        <text x="250" y="201" fill="#c6d8e6" font-size="9" text-anchor="middle">drain all</text>
        <circle r="7.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.30;0.42;0.72;0.84;1" keyPoints="0;0.326;0.326;0.651;0.651;1"
            path="M 78 170 L 160 42 L 242 170 L 78 170 Z"/>
        </circle>
      </svg>
      <div class="dnote seq" style="--i:0"><span class="spin" style="color:var(--accent)">&#8635;</span> <b style="color:var(--accent)">event loop:</b> take <b style="color:var(--race)">one</b> macrotask &rarr; run the stack to empty &rarr; drain <b style="color:var(--ordered)">all</b> microtasks &rarr; repeat.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two queues feed that loop, and they aren't equal. <b class="hl">Macrotasks</b> — <code>setTimeout</code>, I/O and message callbacks — are taken one per turn. <b class="hl">Microtasks</b> — promise reactions and <code>await</code> continuations — are drained <i>completely</i> after each macrotask, before the next one runs. That's the rule the whole next chapter builds on.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the loop the runtime runs for you</div>
      <pre class="code">const macrotasks = [];   <span class="cm">// setTimeout, I/O, message callbacks</span>
const microtasks = [];   <span class="cm">// .then / await continuations, queueMicrotask</span>

function turn() {
  const task = macrotasks.shift();   <span class="cm">// 1. take exactly ONE macrotask</span>
  if (task) task();                  <span class="cm">// 2. run it start-to-finish (never interrupted)</span>
  while (microtasks.length)          <span class="cm">// 3. then drain EVERY microtask</span>
    microtasks.shift()();            <span class="cm">//    (new ones enqueued here run too)</span>
}
<span class="cm">// the runtime calls turn() forever — that is the event loop</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> because a block can't be interrupted, ordinary synchronous code is safe from torn reads — no lock needed. But the instant you <code>await</code>, step 2 ends and you hand the thread back. That gap is where the ordering surprises and the races in the next chapters live.</p>` },

  { eb:"lesson 02 · the model", title:"Microtasks beat macrotasks", html:`
    <p class="big">Deferred work isn't one queue. After each macrotask, the loop drains the <b class="hl">entire</b> microtask queue before it touches the next macrotask.</p>
    <p><b class="hl">Microtasks</b> are promise reactions — <code>.then</code>, <code>await</code> continuations, <code>queueMicrotask</code>. <b class="hl">Macrotasks</b> are <code>setTimeout</code>, message and I/O callbacks. Microtasks always cut the line.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one tick &middot; what order prints?</div>
      <pre class="code" style="margin:0 0 12px">console.log('A');                        <span class="cm">// sync</span>
setTimeout(() =&gt; console.log('B'));       <span class="cm">// macro</span>
Promise.resolve().then(() =&gt; console.log('C'));  <span class="cm">// micro</span>
console.log('D');                        <span class="cm">// sync</span></pre>
      <div class="histtape">
        <span class="chip2 sync seq pop" style="--i:0">A</span><span class="chip2 sync seq pop" style="--i:1">D</span>
        <span class="flowarrow seq" style="--i:2;margin:0 2px">&rsaquo;</span>
        <span class="chip2 micro seq pop" style="--i:3">C</span>
        <span class="flowarrow seq" style="--i:4;margin:0 2px">&rsaquo;</span>
        <span class="chip2 macro seq pop" style="--i:5">B</span>
      </div>
      <div class="dnote seq" style="--i:6"><span style="color:var(--accent)">sync first</span> (A, D) &rarr; <span style="color:var(--ordered)">every microtask</span> (C) &rarr; <span style="color:var(--race)">then one macrotask</span> (B).</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The reason is step 3 of the loop: it drains microtasks to <b class="hl">exhaustion</b>. If a microtask enqueues another microtask, that one runs in the same drain — the queue only has to be empty <i>once</i> for the loop to move on to the next macrotask. So a chain that keeps re-queuing itself never lets a timer run.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a microtask chain starves a timer</div>
      <pre class="code">setTimeout(() =&gt; console.log('timer'));   <span class="cm">// macrotask — waits its turn</span>

let n = 0;
(function loop() {
  if (n++ &lt; 1000)
    Promise.resolve().then(loop);         <span class="cm">// re-queues a MICROtask each time</span>
})();

<span class="cm">// all 1000 microtasks drain before 'timer' ever runs:</span>
<span class="cm">// the queue doesn't reach empty until the whole chain has run</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is exactly how a runaway promise chain can freeze timers and rendering. Knowing the drain order — sync, then all microtasks, then one macrotask — is how you predict, and debug, any async sequence.</p>` },

  { eb:"lesson 03 · primitives", title:"The hidden race across await", html:`
    <p class="big">Here's the twist: single-threaded does <b class="hl">not</b> mean race-free. When a function <code>await</code>s in the middle of a read-modify-write, another task can run in the gap and move the data underneath it.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">two tasks share balance = 100, each withdraws 30</div>
      <svg class="estage" viewBox="0 0 340 156" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="19" fill="#34d3bf" font-size="9" text-anchor="middle">SHARED &middot; balance</text>
        <rect x="143" y="25" width="54" height="40" rx="8" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="170" y="51" font-size="15" text-anchor="middle" fill="#e2ecf3">100
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.57;0.58;1" values="1;1;0;0"/></text>
        <text x="170" y="51" font-size="15" text-anchor="middle" fill="#e2ecf3" opacity="0">70
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.57;0.58;0.83;0.84;1" values="0;0;1;1;0;0"/></text>
        <text x="170" y="51" font-size="15" text-anchor="middle" fill="#fb923c" opacity="0">70
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.83;0.84;1" values="0;0;1;1"/></text>
        <text x="170" y="86" fill="#fb923c" font-size="8.5" text-anchor="middle" opacity="0">&#10007; B's write lost
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.84;0.9;1" values="0;0;1;1"/></text>
        <line x1="150" y1="59" x2="66" y2="104" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <line x1="190" y1="59" x2="274" y2="104" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="10" y="104" width="96" height="44" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="58" y="122" fill="#4eaeff" font-size="9" text-anchor="middle">TASK A</text>
        <text x="58" y="137" fill="#8ca6b8" font-size="8.5" text-anchor="middle">read, await, write</text>
        <rect x="234" y="104" width="96" height="44" rx="9" fill="#071726" stroke="#fb923c" stroke-width="1.5"/>
        <text x="282" y="122" fill="#fb923c" font-size="9" text-anchor="middle">TASK B</text>
        <text x="282" y="137" fill="#8ca6b8" font-size="8.5" text-anchor="middle">read, write</text>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.12;0.72;0.84;1" keyPoints="0;1;1;0;0" path="M 150 59 L 66 104"/></circle>
        <circle r="6.5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.20;0.34;0.46;0.58;1" keyPoints="0;0;1;1;0;0" path="M 190 59 L 274 104"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">Task A</div><div class="lstep seq" style="--i:0">read balance &rarr; 100</div>
        <div class="lanehead seq" style="--i:1">Task A</div><div class="lstep wait seq" style="--i:1">await checkLimit() &hellip; yields the thread</div>
        <div class="lanehead seq" style="--i:2">Task B</div><div class="lstep seq" style="--i:2">read balance &rarr; 100</div>
        <div class="lanehead seq" style="--i:3">Task B</div><div class="lstep seq" style="--i:3">write 100 &minus; 30 = 70</div>
        <div class="lanehead seq" style="--i:4">Task A</div><div class="lstep bad seq pop" style="--i:4">write 100 &minus; 30 = 70 &nbsp;&#10007; B's withdrawal lost</div>
      </div>
      <div class="dnote seq" style="--i:5">Final balance <b style="color:var(--race)">70</b>, but two withdrawals happened — it should be <b style="color:var(--ordered)">40</b>. One update was clobbered across the await.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The bug isn't the <code>await</code> itself — it's that a <b class="hl">read-modify-write</b> spans it. Between reading <code>balance</code> and writing it back, the function yields, another task reads the same old value, and one write clobbers the other. The fix is to make that span a <b class="hl">critical section</b>: serialize it so no second task can enter until the first has written back.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the race, and the lock that closes it</div>
      <pre class="code">let balance = 100;

<span class="cm">// UNSAFE — the await splits read from write</span>
async function withdraw(amount) {
  const current = balance;              <span class="cm">// read</span>
  await checkFraud(amount);             <span class="cm">// yields — another withdraw runs here</span>
  balance = current - amount;           <span class="cm">// write, using a now-stale 'current'</span>
}

<span class="cm">// SAFE — one mutex serializes the whole read-await-write</span>
const lock = new Mutex();
async function withdraw(amount) {
  await lock.runExclusive(async () =&gt; {
    const current = balance;
    await checkFraud(amount);           <span class="cm">// still awaits, but no one else can enter</span>
    balance = current - amount;
  });
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is why single-threaded JS still needs locks. Any state that's read and written across an <code>await</code> is a critical section — and serializing it is exactly the job of the primitives in the next chapter.</p>` },

  { eb:"lesson 04 · primitives", title:"Primitives: who runs when", html:`
    <p class="big">Synchronization primitives are small tools that control <b class="hl">who runs when</b>. Nearly all of them are the same idea: a queue of parked promises, plus a rule for whose <code>resolve()</code> fires next.</p>
    <p><b class="hl">Mutex</b> — one holder at a time; wraps a critical section so it can't interleave. <b class="hl">Semaphore</b> — N permits (a mutex is N=1); caps concurrency. <b class="hl">Latch / barrier</b> — make tasks wait for an event, or for each other. <b class="hl">Queue</b> — hand work from producers to consumers without busy-waiting.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">one lock, handed on &middot; N permits, taken &amp; returned</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="83" y="16" fill="#4eaeff" font-size="9" text-anchor="middle">MUTEX &middot; 1 holder</text>
        <line x1="14" y1="58" x2="152" y2="58" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="66" y="40" width="34" height="36" rx="7" fill="none" stroke="#34d3bf" stroke-width="1.5"/>
        <path d="M 76 40 v -6 a 7 7 0 0 1 14 0 v 6" fill="none" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="83" y="92" fill="#8ca6b8" font-size="8" text-anchor="middle">the lock</text>
        <text x="24" y="112" fill="#647c8f" font-size="8" text-anchor="middle">queue</text>
        <text x="140" y="112" fill="#647c8f" font-size="8" text-anchor="middle">done</text>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.16;0.30;0.34;1" keyPoints="0;0.5;0.5;1;1" path="M 14 58 L 83 58 L 152 58"/></circle>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" begin="-2s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.16;0.30;0.34;1" keyPoints="0;0.5;0.5;1;1" path="M 14 58 L 83 58 L 152 58"/></circle>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" begin="-4s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.16;0.30;0.34;1" keyPoints="0;0.5;0.5;1;1" path="M 14 58 L 83 58 L 152 58"/></circle>
        <line x1="170" y1="26" x2="170" y2="128" stroke="#244155" stroke-width="1"/>
        <text x="256" y="16" fill="#34d3bf" font-size="9" text-anchor="middle">SEMAPHORE &middot; 3 permits</text>
        <rect x="210" y="30" width="20" height="20" rx="5" fill="#071726" stroke="#34d3bf" stroke-width="1.4">
          <animate attributeName="fill" dur="4.5s" repeatCount="indefinite" keyTimes="0;0.72;0.78;0.94;1" values="rgba(52,211,191,.28);rgba(52,211,191,.28);#071726;#071726;rgba(52,211,191,.28)"/></rect>
        <rect x="246" y="30" width="20" height="20" rx="5" fill="#071726" stroke="#34d3bf" stroke-width="1.4">
          <animate attributeName="fill" dur="4.5s" begin="-1.5s" repeatCount="indefinite" keyTimes="0;0.72;0.78;0.94;1" values="rgba(52,211,191,.28);rgba(52,211,191,.28);#071726;#071726;rgba(52,211,191,.28)"/></rect>
        <rect x="282" y="30" width="20" height="20" rx="5" fill="#071726" stroke="#34d3bf" stroke-width="1.4">
          <animate attributeName="fill" dur="4.5s" begin="-3s" repeatCount="indefinite" keyTimes="0;0.72;0.78;0.94;1" values="rgba(52,211,191,.28);rgba(52,211,191,.28);#071726;#071726;rgba(52,211,191,.28)"/></rect>
        <text x="256" y="63" fill="#8ca6b8" font-size="8" text-anchor="middle">up to 3 held at once</text>
        <g>
          <circle cx="200" cy="118" r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5"><animate attributeName="opacity" dur="4.5s" repeatCount="indefinite" keyTimes="0;0.05;0.7;0.75;1" values="1;1;1;0.3;0.3"/></circle>
          <circle cx="230" cy="118" r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5"><animate attributeName="opacity" dur="4.5s" begin="-1.1s" repeatCount="indefinite" keyTimes="0;0.05;0.7;0.75;1" values="1;1;1;0.3;0.3"/></circle>
          <circle cx="260" cy="118" r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5"><animate attributeName="opacity" dur="4.5s" begin="-2.2s" repeatCount="indefinite" keyTimes="0;0.05;0.7;0.75;1" values="1;1;1;0.3;0.3"/></circle>
          <circle cx="290" cy="118" r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5"><animate attributeName="opacity" dur="4.5s" begin="-3.3s" repeatCount="indefinite" keyTimes="0;0.05;0.7;0.75;1" values="1;1;1;0.3;0.3"/></circle>
        </g>
        <text x="256" y="138" fill="#647c8f" font-size="8" text-anchor="middle">4 tasks &middot; one always waiting</text>
      </svg>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">mutex &middot; 1 permit</div>
          <div class="permits"><div class="permit used"></div></div>
          <div style="margin-top:8px"><span class="chip2" style="border-color:var(--ordered);color:var(--ordered)">1 running</span></div>
          <div style="margin-top:4px"><span class="chip2" style="opacity:.55">waiting</span><span class="chip2" style="opacity:.55">waiting</span></div>
          <div class="dnote">release() hands the lock straight to the next waiter — never observably free.</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">semaphore &middot; 3 permits</div>
          <div class="permits"><div class="permit used"></div><div class="permit used"></div><div class="permit used"></div></div>
          <div style="margin-top:8px"><span class="chip2" style="border-color:var(--ordered);color:var(--ordered)">3 running</span><span class="chip2" style="opacity:.55">1 waiting</span></div>
          <div class="dnote">up to N run at once; the rest park until a permit frees.</div>
        </div>
      </div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Every one shares the same skeleton: a private list of <b class="hl">parked resolvers</b> and a rule for whose resolver to call next. To block, a task pushes a resolver and awaits its promise; to release one, you shift a resolver off the list and call it. Here's the canonical example — a mutex — and every other primitive is a variation on it.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a mutex is the template</div>
      <pre class="code">class Mutex {
  #locked = false;
  #waiters = [];                      <span class="cm">// parked resolvers</span>

  async acquire() {
    if (!this.#locked) { this.#locked = true; return; }
    await new Promise(r =&gt; this.#waiters.push(r));   <span class="cm">// park until handed the lock</span>
  }
  release() {
    const next = this.#waiters.shift();
    if (next) next();                 <span class="cm">// hand the lock straight to a waiter (stays locked)</span>
    else this.#locked = false;        <span class="cm">// nobody waiting -> actually free it</span>
  }
  async runExclusive(fn) {            <span class="cm">// the ergonomic wrapper</span>
    await this.acquire();
    try { return await fn(); } finally { this.release(); }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> these turn "it usually works" into guarantees — exclusive access, bounded concurrency, ordered handoff — without ever blocking the thread. Swap the release rule and you get a semaphore (count permits), a latch (fire all), or a queue (deliver a value).</p>` },

  { eb:"lesson 05 · primitives", title:"Latch & barrier", html:`
    <p class="big">Two coordination gates. A <b class="hl">latch</b> opens once and lets everyone through (a start signal). A <b class="hl">barrier</b> holds N parties until the last one arrives, then releases them together (a rendezvous).</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">latch &middot; open once, all waiters go</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="24" y1="45" x2="24" y2="123" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <line x1="316" y1="45" x2="316" y2="123" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <text x="60" y="30" fill="#8ca6b8" font-size="8.5" text-anchor="middle">parked</text>
        <text x="286" y="30" fill="#34d3bf" font-size="8.5" text-anchor="middle">released</text>
        <text x="170" y="22" fill="#4eaeff" font-size="9" text-anchor="middle">open()</text>
        <rect x="164" y="42" width="10" height="82" rx="3" fill="#4eaeff" opacity="0.9">
          <animateTransform attributeName="transform" type="translate" dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.40;0.52;0.90;1" values="0 0;0 0;0 -46;0 -46;0 0"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.40;0.52;0.90;1" values="0.9;0.9;0.25;0.25;0.9"/></rect>
        <text x="169" y="138" fill="#647c8f" font-size="8" text-anchor="middle">the gate lifts once &rarr; stays open</text>
        <circle r="6.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.50;0.66;1" keyPoints="0;0;1;1" path="M 60 60 L 280 60"/></circle>
        <circle r="6.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.50;0.66;1" keyPoints="0;0;1;1" path="M 60 84 L 280 84"/></circle>
        <circle r="6.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.50;0.66;1" keyPoints="0;0;1;1" path="M 60 108 L 280 108"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">w1</div><div class="lstep wait seq" style="--i:0">await latch &hellip; parked</div>
        <div class="lanehead seq" style="--i:1">w2</div><div class="lstep wait seq" style="--i:1">await latch &hellip; parked</div>
        <div class="lanehead seq" style="--i:2">main</div><div class="lstep seq" style="--i:2">open()</div>
        <div class="lanehead seq" style="--i:3">w1, w2</div><div class="lstep good seq pop" style="--i:3">released together &rarr; go</div>
      </div>
      <div class="dnote seq" style="--i:4">A barrier(N) is the mirror image: each party <code>arrive()</code>s and blocks; the <b>last</b> arrival opens the gate for everyone.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Both share the parked-resolver skeleton; only the release rule differs. A latch flips a one-way flag and wakes <i>everyone</i> — and because the flag stays set, anyone who waits <i>after</i> it opened returns immediately. A barrier counts arrivals and only the <b class="hl">last</b> one wakes the group.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; one-shot gate vs. rendezvous</div>
      <pre class="code">class Latch {                          <span class="cm">// opens once, stays open</span>
  #open = false; #waiters = [];
  wait() {
    if (this.#open) return Promise.resolve();      <span class="cm">// late arrivals sail through</span>
    return new Promise(r =&gt; this.#waiters.push(r));
  }
  open() {
    this.#open = true;
    this.#waiters.forEach(r =&gt; r());   <span class="cm">// release everyone, once</span>
    this.#waiters = [];
  }
}

class Barrier {                        <span class="cm">// releases N together</span>
  #parties; #count = 0; #waiters = [];
  constructor(parties) { this.#parties = parties; }
  async arrive() {
    if (++this.#count === this.#parties)
      this.#waiters.forEach(r =&gt; r());  <span class="cm">// the last arrival opens the gate</span>
    else
      await new Promise(r =&gt; this.#waiters.push(r));
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> a latch releases work on a one-time signal (config loaded, race start); a barrier syncs phases (all workers finish step 1 before any starts step 2). Note a latch is <i>not</i> a gate you can re-close — that one-shot property is exactly what makes late waiters safe. And this barrier is single-use: a <i>cyclic</i> barrier also resets the count on release, so the same group can rendezvous again at the next phase.</p>` },

  { eb:"lesson 06 · primitives", title:"Condition variable", html:`
    <p class="big">A <b class="hl">condition variable</b> parks a task until a predicate becomes true, and a producer <b class="hl">signals</b> when the state it depends on changes. The waiter re-checks on every wake — so a stale or spurious wake just parks it again.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">consumer waits for items &gt; 0</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="16" fill="#8ca6b8" font-size="8.5" text-anchor="middle">items</text>
        <rect x="152" y="20" width="36" height="26" rx="6" fill="#071726" stroke="#34d3bf" stroke-width="1.4"/>
        <text x="170" y="38" font-size="13" text-anchor="middle" fill="#e2ecf3">0
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.55;0.56;1" values="1;1;0;0"/></text>
        <text x="170" y="38" font-size="13" text-anchor="middle" fill="#34d3bf" opacity="0">1
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.55;0.56;1" values="0;0;1;1"/></text>
        <rect x="138" y="58" width="64" height="40" rx="8" fill="none" stroke="#4eaeff" stroke-width="1.4"/>
        <text x="170" y="76" fill="#4eaeff" font-size="8.5" text-anchor="middle">items &gt; 0 ?</text>
        <text x="170" y="88" fill="#647c8f" font-size="7.5" text-anchor="middle">re-check on wake</text>
        <text x="40" y="120" fill="#fb923c" font-size="8" text-anchor="middle">wait()</text>
        <text x="300" y="120" fill="#34d3bf" font-size="8" text-anchor="middle">consume</text>
        <text x="170" y="120" font-size="8" text-anchor="middle" fill="#fb923c" opacity="0">spurious &rarr; re-park
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.18;0.34;0.4;1" values="0;1;1;0;0"/></text>
        <text x="170" y="120" font-size="8" text-anchor="middle" fill="#34d3bf" opacity="0">true &rarr; go
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.62;0.78;1" values="0;0;1;1"/></text>
        <circle r="6.5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.12;0.22;0.30;0.58;0.74;1" keyPoints="0;0;0.234;0.468;0.468;1;1"
            path="M 40 78 L 150 78 L 40 78 L 290 78"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">consumer</div><div class="lstep wait seq" style="--i:0">items &gt; 0? no &rarr; park</div>
        <div class="lanehead seq" style="--i:1">producer</div><div class="lstep seq" style="--i:1">spurious signal (items still 0)</div>
        <div class="lanehead seq" style="--i:2">consumer</div><div class="lstep wait seq" style="--i:2">wake &rarr; re-check &rarr; still 0 &rarr; park</div>
        <div class="lanehead seq" style="--i:3">producer</div><div class="lstep seq" style="--i:3">items = 1 &middot; signal</div>
        <div class="lanehead seq" style="--i:4">consumer</div><div class="lstep good seq pop" style="--i:4">wake &rarr; re-check &rarr; true &rarr; consume</div>
      </div>
      <div class="dnote seq" style="--i:5">That re-check is why it's <code>while (!pred()) wait()</code>, never <code>if</code> — spurious wakeups are real.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The <code>while</code> loop is the whole point. A notify doesn't promise the predicate is true — only that the state <i>changed</i>, so it's worth re-checking. Multiple waiters, a signal consumed by someone else, or a bare wake all mean the predicate might still be false. Re-test in a loop and a false wake just parks you again; an <code>if</code> would let you charge ahead on a lie.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; wait-until-predicate</div>
      <pre class="code">class CondVar {
  #waiters = [];
  async wait(pred) {
    while (!pred()) {                  <span class="cm">// re-check on EVERY wake, never an if</span>
      await new Promise(r =&gt; this.#waiters.push(r));
    }
  }
  notifyAll() {                        <span class="cm">// state changed: wake all to re-check</span>
    const woken = this.#waiters;
    this.#waiters = [];                <span class="cm">// clear first, or a re-park races the wake</span>
    woken.forEach(r =&gt; r());
  }
}

<span class="cm">// usage: park until the buffer has something</span>
await cv.wait(() =&gt; buffer.length &gt; 0);</pre>
    </div>
    <p><b class="hl">Why it matters:</b> it's the general "wait until a state holds" tool — bounded queues, latches, and "wait for ready" are all condition variables underneath.</p>` },

  { eb:"lesson 07 · primitives", title:"Atomic lock (compare-and-swap)", html:`
    <p class="big">Locks aren't magic — they're built from one <b class="hl">atomic</b> instruction: <b class="hl">compare-and-swap</b>. CAS tests "is this cell 0?" and sets it to 1 in a single indivisible step, and tells you whether you won.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">one shared cell &middot; 0 = free, 1 = held</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="24" fill="#8ca6b8" font-size="8.5" text-anchor="middle">lock cell</text>
        <rect x="150" y="60" width="40" height="36" rx="7" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="170" y="84" font-size="15" text-anchor="middle" fill="#e2ecf3">0
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.34;0.35;1" values="1;1;0;0"/></text>
        <text x="170" y="84" font-size="15" text-anchor="middle" fill="#34d3bf" opacity="0">1
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.34;0.35;1" values="0;0;1;1"/></text>
        <rect x="10" y="56" width="92" height="44" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="56" y="74" fill="#4eaeff" font-size="9" text-anchor="middle">THREAD 1</text>
        <text x="56" y="89" fill="#8ca6b8" font-size="8" text-anchor="middle">CAS 0&rarr;1</text>
        <rect x="238" y="56" width="92" height="44" rx="9" fill="#071726" stroke="#fb923c" stroke-width="1.5"/>
        <text x="284" y="74" fill="#fb923c" font-size="9" text-anchor="middle">THREAD 2</text>
        <text x="284" y="89" fill="#8ca6b8" font-size="8" text-anchor="middle">CAS 0&rarr;1</text>
        <text x="56" y="122" fill="#34d3bf" font-size="8" text-anchor="middle" opacity="0">&#10003; won &mdash; holds it
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.36;0.46;1" values="0;0;1;1"/></text>
        <text x="284" y="122" fill="#fb923c" font-size="8" text-anchor="middle" opacity="0">&#10007; was 1 &mdash; must wait
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.54;0.64;1" values="0;0;1;1"/></text>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.15;0.34;1" keyPoints="0;0;1;1" path="M 102 78 L 150 78"/></circle>
        <circle r="6.5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.15;0.37;0.52;1" keyPoints="0;0;0.5;1;1" path="M 238 78 L 190 78 L 238 78"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">Thread 1</div><div class="lstep good seq" style="--i:0">CAS 0&rarr;1 &nbsp;&#10003; won &mdash; holds the lock</div>
        <div class="lanehead seq" style="--i:1">Thread 2</div><div class="lstep bad seq" style="--i:1">CAS 0&rarr;1 &nbsp;&#10007; cell was 1 &mdash; must wait</div>
      </div>
      <div class="dnote seq" style="--i:3">Both ran CAS at once; only one could flip 0&rarr;1. A plain <code>if (cell == 0) cell = 1</code> would let both in — two steps interleave.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The magic word is <b class="hl">indivisible</b>. <code>compareExchange</code> reads the cell, compares it, and conditionally writes — but the hardware guarantees no other thread observes or touches the cell partway through. That's what a plain <code>if (cell === 0) cell = 1</code> can't promise: two threads can both pass the <code>if</code> before either writes.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a lock from one shared int</div>
      <pre class="code">const cell = new Int32Array(new SharedArrayBuffer(4));  <span class="cm">// 0 = free, 1 = held</span>

function tryAcquire() {
  <span class="cm">// compareExchange(arr, i, expected, next) -> the OLD value, atomically</span>
  return Atomics.compareExchange(cell, 0, 0, 1) === 0;   <span class="cm">// flip 0->1 iff it was 0</span>
}
function release() {
  Atomics.store(cell, 0, 0);
}

<span class="cm">// blocking version: spin on tryAcquire(), or park with</span>
<span class="cm">// Atomics.wait(cell, 0, 1) and wake others with Atomics.notify(cell, 0)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every mutex and semaphore sits on a CAS like this; <code>Atomics.wait</code>/<code>notify</code> add the "park until free" part so waiters don't burn CPU spinning. A classic interview probe.</p>` },

  { eb:"lesson 08 · primitives", title:"Read / write lock", html:`
    <p class="big">When reads vastly outnumber writes, a plain mutex is wasteful — readers don't conflict with each other. A <b class="hl">read/write lock</b> lets <b class="hl">many readers</b> in at once, but a <b class="hl">writer</b> gets it alone.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">many readers OR one exclusive writer</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="18" fill="#8ca6b8" font-size="8.5" text-anchor="middle">SHARED DATA</text>
        <rect x="116" y="26" width="108" height="82" rx="10" fill="#071726" stroke="#34d3bf" stroke-width="1.6">
          <animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.48;0.52;0.92;1" values="#34d3bf;#34d3bf;#fb923c;#fb923c;#34d3bf"/></rect>
        <text x="30" y="128" fill="#34d3bf" font-size="8" text-anchor="middle">readers</text>
        <text x="310" y="128" fill="#8ca6b8" font-size="8" text-anchor="middle">done</text>
        <text x="170" y="128" font-size="8.5" text-anchor="middle" fill="#34d3bf" opacity="0">3 readers &middot; shared
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.12;0.44;0.48;1" values="0;1;1;0;0"/></text>
        <text x="170" y="128" font-size="8.5" text-anchor="middle" fill="#fb923c" opacity="0">1 writer &middot; exclusive
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.56;0.62;0.88;0.92;1" values="0;0;1;1;0;0"/></text>
        <circle r="6" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.04;0.16;0.40;0.50;1" keyPoints="0;0;0.5;0.5;1;1" path="M 22 50 L 318 50"/></circle>
        <circle r="6" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.04;0.16;0.40;0.50;1" keyPoints="0;0;0.5;0.5;1;1" path="M 22 67 L 318 67"/></circle>
        <circle r="6" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.04;0.16;0.40;0.50;1" keyPoints="0;0;0.5;0.5;1;1" path="M 22 84 L 318 84"/></circle>
        <circle r="6.5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.50;0.62;0.86;0.96;1" keyPoints="0;0;0.5;0.5;1;1" path="M 22 99 L 318 99"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">readers</div><div class="lstep good seq pop" style="--i:0">R1 R2 R3 &mdash; all reading together</div>
        <div class="lanehead seq" style="--i:1">writer</div><div class="lstep wait seq" style="--i:1">waits for readers to drain</div>
        <div class="lanehead seq" style="--i:2">writer</div><div class="lstep seq pop" style="--i:2">readers = 0 &rarr; writes alone</div>
        <div class="lanehead seq" style="--i:3">readers</div><div class="lstep wait seq" style="--i:3">new readers wait while writing</div>
      </div>
      <div class="dnote seq" style="--i:4">Grant a writer only when no readers hold it; don't let a steady stream of readers starve a waiting writer.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The subtlety is the handoff at release time, and fairness. Grant a writer only when <code>readers === 0</code>, or reads and writes overlap. But if new readers can always cut in front of a waiting writer, a steady read stream <b class="hl">starves</b> it forever — so a queued writer makes newly-arriving readers wait too.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; shared reads, exclusive writes</div>
      <pre class="code">class RWLock {
  #readers = 0; #writing = false; #readQ = []; #writeQ = [];

  async acquireRead() {
    if (this.#writing || this.#writeQ.length) {          <span class="cm">// writer active or waiting</span>
      await new Promise(r =&gt; this.#readQ.push(r));        <span class="cm">// granter counts us in</span>
      return;
    }
    this.#readers++;
  }
  releaseRead() { if (--this.#readers === 0) this.#grant(); }

  async acquireWrite() {
    if (this.#writing || this.#readers &gt; 0) {
      await new Promise(r =&gt; this.#writeQ.push(r));       <span class="cm">// granter sets #writing</span>
      return;
    }
    this.#writing = true;
  }
  releaseWrite() { this.#writing = false; this.#grant(); }

  #grant() {                                             <span class="cm">// hand off at release time</span>
    if (this.#writeQ.length) {
      if (this.#readers === 0) { this.#writing = true; this.#writeQ.shift()(); }
    } else {
      while (this.#readQ.length) { this.#readers++; this.#readQ.shift()(); }
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> read-heavy caches and config stores get big throughput wins from shared reads — as long as writers still get exclusive access and don't starve.</p>` },

  { eb:"lesson 09 · primitives", title:"Run once (lazy init)", html:`
    <p class="big">Initialize something <b class="hl">exactly once</b>, even when many callers ask for it at the same time — a lazy singleton (open the DB pool, load config). The trick: cache the in-flight <b class="hl">promise</b>, not the value.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">4 concurrent callers, one initializer</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="62" y1="29" x2="134" y2="74" stroke="#244155" stroke-width="1" stroke-dasharray="3 4"/>
        <line x1="62" y1="61" x2="134" y2="74" stroke="#244155" stroke-width="1" stroke-dasharray="3 4"/>
        <line x1="62" y1="93" x2="134" y2="74" stroke="#244155" stroke-width="1" stroke-dasharray="3 4"/>
        <line x1="62" y1="125" x2="134" y2="74" stroke="#244155" stroke-width="1" stroke-dasharray="3 4"/>
        <line x1="206" y1="74" x2="252" y2="74" stroke="#244155" stroke-width="1" stroke-dasharray="3 4"/>
        <g font-size="8.5" text-anchor="middle">
          <rect x="8" y="16" width="54" height="26" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.3"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.80;0.86;1" values="#4eaeff;#4eaeff;#34d3bf;#34d3bf"/></rect><text x="35" y="33" fill="#c6d8e6">c1</text>
          <rect x="8" y="48" width="54" height="26" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.3"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.80;0.86;1" values="#4eaeff;#4eaeff;#34d3bf;#34d3bf"/></rect><text x="35" y="65" fill="#c6d8e6">c2</text>
          <rect x="8" y="80" width="54" height="26" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.3"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.80;0.86;1" values="#4eaeff;#4eaeff;#34d3bf;#34d3bf"/></rect><text x="35" y="97" fill="#c6d8e6">c3</text>
          <rect x="8" y="112" width="54" height="26" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.3"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.80;0.86;1" values="#4eaeff;#4eaeff;#34d3bf;#34d3bf"/></rect><text x="35" y="129" fill="#c6d8e6">c4</text>
        </g>
        <rect x="134" y="52" width="72" height="44" rx="10" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="170" y="72" fill="#34d3bf" font-size="8.5" text-anchor="middle">promise</text>
        <text x="170" y="86" font-size="7.5" text-anchor="middle" fill="#647c8f">pending
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.62;0.63;1" values="1;1;0;0"/></text>
        <text x="170" y="86" font-size="7.5" text-anchor="middle" fill="#34d3bf" opacity="0">resolved
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.62;0.63;1" values="0;0;1;1"/></text>
        <rect x="252" y="52" width="80" height="44" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="292" y="72" fill="#4eaeff" font-size="9" text-anchor="middle">init()</text>
        <text x="292" y="86" font-size="7.5" text-anchor="middle" fill="#647c8f">runs once</text>
        <circle r="5.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.06;0.30;1" keyPoints="0;0;1;1" path="M 62 29 L 134 74 L 252 74"/></circle>
        <circle r="5.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.64;0.65;0.9;1" values="0;0;1;1;0"/>
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.64;0.86;1" keyPoints="0;0;1;1" path="M 134 74 L 62 29"/></circle>
        <circle r="5.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.64;0.65;0.9;1" values="0;0;1;1;0"/>
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.64;0.86;1" keyPoints="0;0;1;1" path="M 134 74 L 62 61"/></circle>
        <circle r="5.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.64;0.65;0.9;1" values="0;0;1;1;0"/>
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.64;0.86;1" keyPoints="0;0;1;1" path="M 134 74 L 62 93"/></circle>
        <circle r="5.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.64;0.65;0.9;1" values="0;0;1;1;0"/>
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.64;0.86;1" keyPoints="0;0;1;1" path="M 134 74 L 62 125"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">c1</div><div class="lstep good seq" style="--i:0">no promise yet &rarr; start init() &middot; store it</div>
        <div class="lanehead seq" style="--i:1">c2</div><div class="lstep seq" style="--i:1">promise exists &rarr; await it</div>
        <div class="lanehead seq" style="--i:2">c3, c4</div><div class="lstep seq" style="--i:2">promise exists &rarr; await it</div>
        <div class="lanehead seq" style="--i:3">all</div><div class="lstep good seq pop" style="--i:3">init resolves once &rarr; same result to everyone</div>
      </div>
      <div class="dnote seq" style="--i:4">Caching the value instead of the promise loses the race: callers that arrive mid-init each start their own.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Why the <b class="hl">promise</b> and not the value? Because the value doesn't exist yet when the second caller arrives — <code>init()</code> is still running. If you wait to cache the resolved value, every caller that arrives mid-init sees an empty cache and starts its own. Caching the in-flight promise immediately means they all <code>await</code> the same one.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; run once, share the result</div>
      <pre class="code">function once(fn) {
  let promise;                          <span class="cm">// the single in-flight / settled promise</span>
  return () =&gt; (promise ??= fn());       <span class="cm">// call fn only the FIRST time; reuse after</span>
}

const getPool = once(() =&gt; createDbPool());   <span class="cm">// createDbPool() runs at most once</span>
getPool(); getPool(); getPool();               <span class="cm">// 3 callers -> one pool, one shared promise</span>

<span class="cm">// want retry-on-failure? evict on reject:</span>
<span class="cm">//   return () =&gt; (promise ??= fn().catch(e =&gt; { promise = null; throw e; }));</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the difference between one DB connection and a thundering herd of them is exactly "cache the promise, not the value."</p>` },

  { eb:"lesson 10 · workers & atomics", title:"Real threads, real races", html:`
    <p class="big">For genuine parallelism — CPU-bound work — JS uses <b class="hl">Workers</b>, separate OS threads. They don't share variables; they message-pass. The one exception is a <code>SharedArrayBuffer</code>, where threads touch the <b class="hl">same memory</b> — and that's where true data races appear.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">two threads, one shared counter (starts at 5), each does counter++</div>
      <svg class="estage" viewBox="0 0 340 156" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="19" fill="#34d3bf" font-size="9" text-anchor="middle">SHARED &middot; counter</text>
        <rect x="143" y="25" width="54" height="40" rx="8" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="170" y="51" font-size="15" text-anchor="middle" fill="#e2ecf3">5
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.41;0.42;1" values="1;1;0;0"/></text>
        <text x="170" y="51" font-size="15" text-anchor="middle" fill="#e2ecf3" opacity="0">6
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.41;0.42;0.61;0.62;1" values="0;0;1;1;0;0"/></text>
        <text x="170" y="51" font-size="15" text-anchor="middle" fill="#fb923c" opacity="0">6
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.61;0.62;1" values="0;0;1;1"/></text>
        <text x="170" y="86" fill="#fb923c" font-size="8.5" text-anchor="middle" opacity="0">&#10007; rose by 1, should be 7
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.62;0.7;1" values="0;0;1;1"/></text>
        <line x1="150" y1="59" x2="66" y2="104" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <line x1="190" y1="59" x2="274" y2="104" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="10" y="104" width="96" height="44" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="58" y="122" fill="#4eaeff" font-size="9" text-anchor="middle">THREAD 1</text>
        <text x="58" y="137" fill="#8ca6b8" font-size="8.5" text-anchor="middle">read 5 &middot; write 6</text>
        <rect x="234" y="104" width="96" height="44" rx="9" fill="#071726" stroke="#fb923c" stroke-width="1.5"/>
        <text x="282" y="122" fill="#fb923c" font-size="9" text-anchor="middle">THREAD 2</text>
        <text x="282" y="137" fill="#8ca6b8" font-size="8.5" text-anchor="middle">read 5 &middot; write 6</text>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.15;0.30;0.42;1" keyPoints="0;0;1;1;0;0" path="M 150 59 L 66 104"/></circle>
        <circle r="6.5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.20;0.50;0.62;1" keyPoints="0;0;1;1;0;0" path="M 190 59 L 274 104"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">Thread 1</div><div class="lstep seq" style="--i:0">read counter &rarr; 5</div>
        <div class="lanehead seq" style="--i:1">Thread 2</div><div class="lstep seq" style="--i:1">read counter &rarr; 5</div>
        <div class="lanehead seq" style="--i:2">Thread 1</div><div class="lstep seq" style="--i:2">write 5 + 1 = 6</div>
        <div class="lanehead seq" style="--i:3">Thread 2</div><div class="lstep bad seq pop" style="--i:3">write 5 + 1 = 6 &nbsp;&#10007; should be 7</div>
      </div>
      <div class="dnote seq" style="--i:4"><code>counter++</code> is three steps — read, add, write. Both read <b>5</b>, both write <b>6</b>: two increments, the count rose by one. <b style="color:var(--race)">Lost update.</b></div>
      <div class="flowarrow seq" style="--i:6">&darr; the fix</div>
      <div class="dnote seq" style="--i:7"><code style="color:var(--ordered)">Atomics.add(counter, 0, 1)</code> is one <b class="hl">indivisible</b> step — no thread can slip between read and write. <code>Atomics.wait</code> / <code>notify</code> build real cross-thread locks.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Workers normally have <b class="hl">separate</b> heaps — they communicate by copying messages, so there's nothing to race on. A <code>SharedArrayBuffer</code> is the deliberate exception: its bytes live in memory every worker can read and write directly. That's real parallelism on shared state, so <code>counter++</code> (read, add, write) can interleave and lose updates — the same lost update C or Java would give you.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; shared memory across real threads</div>
      <pre class="code"><span class="cm">// main thread — hand every worker the SAME buffer</span>
const sab = new SharedArrayBuffer(4);
const counter = new Int32Array(sab);
for (const w of workers) w.postMessage(sab);

<span class="cm">// inside each worker (worker.js)</span>
onmessage = ({ data: sab }) =&gt; {
  const counter = new Int32Array(sab);
  for (let i = 0; i &lt; 1e6; i++) {
    counter[0]++;                  <span class="cm">// UNSAFE: read-modify-write, updates lost</span>
    <span class="cm">// Atomics.add(counter, 0, 1); // SAFE: one indivisible step</span>
  }
};</pre>
    </div>
    <p><b class="hl">Why it matters:</b> threads pay off only for compute big enough to amortize their cost — and the moment you share memory, you need atomics or a lock, exactly like any other language.</p>` },

  { eb:"lesson 11 · problem patterns", title:"Producer / consumer & backpressure", html:`
    <p class="big">A <b class="hl">queue</b> sits between two roles that run at their own pace: <b class="hl">producers</b> that create work and <b class="hl">consumers</b> that handle it. Neither waits on the other directly — the producer drops an item in the queue and moves on; the consumer takes the next item whenever it's free. That decoupling is the whole point.</p>
    <p>The catch is speed mismatch. If producers are faster than consumers and the queue is <b class="hl">unbounded</b>, the backlog grows without limit — latency climbs, memory balloons, and eventually the process dies. The fix is a <b class="hl">bounded</b> queue: give it a fixed capacity, and when it's full, <code>push</code> itself blocks until a slot frees. That blocking is <b class="hl">backpressure</b> — the queue reaching back to slow the producer down to the consumer's rate.</p>
    <div class="diagram anim" style="--step:.72s">
      <div class="dlabel">an item's journey &middot; capacity 2, fast producer, slow consumer</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="80" y1="77" x2="262" y2="77" stroke="#244155" stroke-width="1.5" stroke-dasharray="3 5"/>
        <rect x="6" y="49" width="70" height="56" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="41" y="73" fill="#4eaeff" font-size="9" text-anchor="middle">PRODUCER</text>
        <text x="41" y="89" fill="#8ca6b8" font-size="8.5" text-anchor="middle">push()</text>
        <text x="170" y="33" fill="#34d3bf" font-size="9" text-anchor="middle">QUEUE &middot; cap 2</text>
        <rect x="112" y="41" width="116" height="70" rx="9" class="ecap" stroke="#34d3bf" stroke-width="1.5"/>
        <rect x="126" y="61" width="40" height="34" rx="6" fill="#071726" stroke="#244155"/>
        <rect x="174" y="61" width="40" height="34" rx="6" fill="#071726" stroke="#244155"/>
        <rect x="264" y="49" width="70" height="56" rx="9" fill="#071726" stroke="#fb923c" stroke-width="1.5"/>
        <text x="299" y="73" fill="#fb923c" font-size="9" text-anchor="middle">CONSUMER</text>
        <text x="299" y="89" fill="#8ca6b8" font-size="8.5" text-anchor="middle">pull()</text>
        <circle r="7" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="4.4s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.20;0.56;0.86;1" keyPoints="0;0.36;0.36;1;1"
            path="M 80 77 L 146 77 L 262 77"/>
        </circle>
        <circle r="7" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="4.4s" begin="-2.2s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.20;0.56;0.86;1" keyPoints="0;0.62;0.62;1;1"
            path="M 80 77 L 194 77 L 262 77"/>
        </circle>
      </svg>
      <div class="lanes" style="margin-top:6px">
        <div class="lanehead seq" style="--i:0">producer</div><div class="lstep seq" style="--i:0">push 1 &middot; push 2 &mdash; buffer is now [1, 2], full</div>
        <div class="lanehead seq" style="--i:1">producer</div><div class="lstep wait seq pop" style="--i:1">push 3 &rarr; no slot &rarr; <b>blocks inside push()</b></div>
        <div class="lanehead seq" style="--i:2">consumer</div><div class="lstep good seq" style="--i:2">pull 1 &mdash; a slot frees, wakes the producer</div>
        <div class="lanehead seq" style="--i:3">producer</div><div class="lstep good seq pop" style="--i:3">unblocks &rarr; 3 lands &mdash; paced to the consumer</div>
      </div>
      <div class="dnote seq" style="--i:4">Capacity <i>is</i> the flow control: the producer can never run more than <b>cap</b> items ahead of the consumer.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the mechanism behind the animation</div>
      <pre class="code">class BoundedQueue {
  constructor(cap) {
    this.cap = cap; this.buf = [];
    this.notFull = []; this.notEmpty = [];   <span class="cm">// parked producers / consumers</span>
  }
  async push(item) {                         <span class="cm">// producer side</span>
    while (this.buf.length &gt;= this.cap)       <span class="cm">// full? wait for a slot</span>
      await new Promise(r =&gt; this.notFull.push(r));
    this.buf.push(item);
    this.notEmpty.shift()?.();               <span class="cm">// wake one waiting consumer</span>
  }
  async pull() {                             <span class="cm">// consumer side</span>
    while (this.buf.length === 0)             <span class="cm">// empty? wait for an item</span>
      await new Promise(r =&gt; this.notEmpty.push(r));
    const item = this.buf.shift();
    this.notFull.shift()?.();                <span class="cm">// wake one blocked producer</span>
    return item;
  }
}

const q = new BoundedQueue(2);
produce(item =&gt; q.push(item));   <span class="cm">// fast: push() blocks it when full — backpressure</span>
consume(()   =&gt; q.pull());       <span class="cm">// slow: pull() blocks it when empty</span></pre>
    </div>
    <p>The two waiter lists are the entire trick: a blocked <code>push</code> parks a resolver in <code>notFull</code>, and the next <code>pull</code> pops it to wake exactly one producer (and vice-versa). No polling, no busy-waiting — just a promise per parked task. The <code>while</code> loops (not <code>if</code>) matter: a woken task must re-check, because another task may have raced in and taken the slot first.</p>
    <p><b class="hl">Why it matters:</b> "what if the producer outpaces the consumer?" is a standard interview follow-up, and the same shape is everywhere in production — Node streams' <code>highWaterMark</code>, Go channels, Kafka consumer lag, a thread pool's task queue. The answer is always bounded buffering (or explicit drop/sample) — never an unbounded backlog.</p>` },

  { eb:"lesson 12 · problem patterns", title:"Process in order (A → B → C)", html:`
    <p class="big">Three subsystems log <b class="hl">concurrently</b>, but must be <b class="hl">processed</b> in a fixed order each cycle. A <b class="hl">sequencer</b> hands out turns: each slot waits for its number, runs, then releases the next.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">turns passed in order, even when B fails first</div>
      <svg class="estage" viewBox="0 0 340 132" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="60" y1="42" x2="280" y2="42" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <text x="170" y="16" fill="#8ca6b8" font-size="8.5" text-anchor="middle">the turn (baton) passes only after success</text>
        <rect x="20" y="54" width="80" height="52" rx="9" fill="#071726" stroke="#34d3bf" stroke-width="1.5">
          <animate attributeName="stroke" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.16;0.20;1" values="#34d3bf;#34d3bf;#315066;#315066"/></rect>
        <text x="60" y="78" fill="#c6d8e6" font-size="9" text-anchor="middle">A</text>
        <text x="60" y="93" fill="#8ca6b8" font-size="7.5" text-anchor="middle">turn 0 &middot; log</text>
        <rect x="130" y="54" width="80" height="52" rx="9" fill="#071726" stroke="#315066" stroke-width="1.5">
          <animate attributeName="stroke" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.28;0.30;0.45;0.47;0.73;0.75;1" values="#315066;#315066;#fb923c;#fb923c;#34d3bf;#34d3bf;#315066;#315066"/></rect>
        <text x="170" y="78" fill="#c6d8e6" font-size="9" text-anchor="middle">B</text>
        <text x="170" y="93" font-size="7.5" text-anchor="middle" fill="#fb923c" opacity="0">fail &middot; holds turn
          <animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.29;0.30;0.44;0.45;1" values="0;0;1;1;0;0"/></text>
        <text x="170" y="93" font-size="7.5" text-anchor="middle" fill="#34d3bf" opacity="0">retry &#10003;
          <animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.46;0.47;0.73;0.74;1" values="0;0;1;1;0;0"/></text>
        <rect x="240" y="54" width="80" height="52" rx="9" fill="#071726" stroke="#315066" stroke-width="1.5">
          <animate attributeName="stroke" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.73;0.75;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect>
        <text x="280" y="78" fill="#c6d8e6" font-size="9" text-anchor="middle">C</text>
        <text x="280" y="93" font-size="7.5" text-anchor="middle" fill="#8ca6b8">waits turn 2
          <animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.73;0.74;1" values="1;1;0;0"/></text>
        <text x="280" y="93" font-size="7.5" text-anchor="middle" fill="#34d3bf" opacity="0">turn 2 &middot; log
          <animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.74;0.75;1" values="0;0;1;1"/></text>
        <circle r="6" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.15;0.28;0.60;0.73;1" keyPoints="0;0;0.5;0.5;1;1" path="M 60 42 L 170 42 L 280 42"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">A</div><div class="lstep good seq" style="--i:0">turn 0 &rarr; log A &rarr; release</div>
        <div class="lanehead seq" style="--i:1">B</div><div class="lstep bad seq" style="--i:1">turn 1 &rarr; fails &mdash; do NOT release</div>
        <div class="lanehead seq" style="--i:2">C</div><div class="lstep wait seq" style="--i:2">waits for turn 2 (B holds it)</div>
        <div class="lanehead seq" style="--i:3">B</div><div class="lstep good seq pop" style="--i:3">retry succeeds &rarr; release</div>
        <div class="lanehead seq" style="--i:4">C</div><div class="lstep good seq pop" style="--i:4">turn 2 &rarr; log C</div>
      </div>
      <div class="dnote seq" style="--i:5">Releasing the turn only <b>after</b> success is what makes the order survive a transient failure.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>A <b class="hl">sequencer</b> hands out numbered turns. Each task waits for its number, does its work, then advances the counter and wakes whoever holds the next number — the chain self-propagates. The fault-tolerance trick is <i>when</i> you release: only <b class="hl">after</b> the work succeeds. Retry while still holding the turn, and a transient failure pauses the pipeline instead of letting the next slot jump ahead.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; numbered turns, released on success</div>
      <pre class="code">class Sequencer {
  #next = 0; #gates = new Map();
  acquire(n) {                          <span class="cm">// wait for turn n</span>
    if (n &lt;= this.#next) return Promise.resolve();
    return new Promise(res =&gt; this.#gates.set(n, res));
  }
  release(n) {                          <span class="cm">// turn done -> wake the next one</span>
    this.#next = n + 1;
    this.#gates.get(this.#next)?.();
    this.#gates.delete(this.#next);
  }
}

<span class="cm">// ordering survives a blip: hold the turn until the work actually succeeds</span>
await seq.acquire(turn);
await retry(() =&gt; process(item));
seq.release(turn);</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the "Concurrent Log Processor" interview question — ordering plus the fault-tolerance bonus, in one pattern.</p>` },

  { eb:"lesson 13 · problem patterns", title:"Bounded concurrency (the pool)", html:`
    <p class="big">You have 100 jobs but mustn't run them all at once (rate limits, memory, sockets). A <b class="hl">concurrency pool</b> runs at most N at a time: start jobs up to the limit, and each time one finishes, start the next.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">6 jobs, limit 2</div>
      <svg class="estage" viewBox="0 0 340 140" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="30" y="16" fill="#8ca6b8" font-size="8" text-anchor="middle">queued</text>
        <text x="310" y="16" fill="#34d3bf" font-size="8" text-anchor="middle">done</text>
        <g fill="#315066"><circle cx="18" cy="36" r="5"/><circle cx="34" cy="36" r="5"/><circle cx="18" cy="52" r="5"/><circle cx="34" cy="52" r="5"/></g>
        <text x="26" y="74" fill="#647c8f" font-size="7.5" text-anchor="middle">jobs 3&ndash;6</text>
        <line x1="52" y1="60" x2="316" y2="60" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <line x1="52" y1="104" x2="316" y2="104" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="140" y="47" width="60" height="26" rx="7" fill="none" stroke="#4eaeff" stroke-width="1.4"/>
        <text x="211" y="53" fill="#4eaeff" font-size="7.5" text-anchor="start">slot 1</text>
        <rect x="140" y="91" width="60" height="26" rx="7" fill="none" stroke="#4eaeff" stroke-width="1.4"/>
        <text x="211" y="97" fill="#4eaeff" font-size="7.5" text-anchor="start">slot 2</text>
        <text x="170" y="134" fill="#647c8f" font-size="8" text-anchor="middle">limit 2 &middot; a finish frees one slot &rarr; next starts</text>
        <g fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <circle r="6"><animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.02;0.58;0.64;1" values="0;1;1;0;0"/><animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.44;0.58;1" keyPoints="0;0.5;0.5;1;1" path="M 52 60 L 170 60 L 316 60"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="6s" begin="-2s" repeatCount="indefinite" keyTimes="0;0.02;0.58;0.64;1" values="0;1;1;0;0"/><animateMotion dur="6s" begin="-2s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.44;0.58;1" keyPoints="0;0.5;0.5;1;1" path="M 52 60 L 170 60 L 316 60"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="6s" begin="-4s" repeatCount="indefinite" keyTimes="0;0.02;0.58;0.64;1" values="0;1;1;0;0"/><animateMotion dur="6s" begin="-4s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.44;0.58;1" keyPoints="0;0.5;0.5;1;1" path="M 52 60 L 170 60 L 316 60"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="6s" begin="-1s" repeatCount="indefinite" keyTimes="0;0.02;0.58;0.64;1" values="0;1;1;0;0"/><animateMotion dur="6s" begin="-1s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.44;0.58;1" keyPoints="0;0.5;0.5;1;1" path="M 52 104 L 170 104 L 316 104"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="6s" begin="-3s" repeatCount="indefinite" keyTimes="0;0.02;0.58;0.64;1" values="0;1;1;0;0"/><animateMotion dur="6s" begin="-3s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.44;0.58;1" keyPoints="0;0.5;0.5;1;1" path="M 52 104 L 170 104 L 316 104"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="6s" begin="-5s" repeatCount="indefinite" keyTimes="0;0.02;0.58;0.64;1" values="0;1;1;0;0"/><animateMotion dur="6s" begin="-5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.44;0.58;1" keyPoints="0;0.5;0.5;1;1" path="M 52 104 L 170 104 L 316 104"/></circle>
        </g>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">slots</div><div class="lstep good seq pop" style="--i:0">[ job1 ] [ job2 ] running &middot; 3-6 queued</div>
        <div class="lanehead seq" style="--i:1">job1 done</div><div class="lstep seq" style="--i:1">slot frees &rarr; start job3</div>
        <div class="lanehead seq" style="--i:2">job2 done</div><div class="lstep seq" style="--i:2">slot frees &rarr; start job4</div>
        <div class="lanehead seq" style="--i:3">&hellip;</div><div class="lstep good seq pop" style="--i:3">always &le; 2 in flight until all done</div>
      </div>
      <div class="dnote seq" style="--i:4"><code>await Promise.race(inFlight)</code> waits for the FIRST job to finish, freeing exactly one slot — not <code>Promise.all</code>, which would batch.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The key line is <code>await Promise.race(inFlight)</code>. When the pool is full, race resolves the instant the <b class="hl">first</b> job finishes — freeing exactly one slot — and the loop starts the next. Use <code>Promise.all</code> here instead and you'd drain the whole batch before starting any more: lock-step batching, not a steady stream, and the slowest job in each batch gates the rest.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; at most N in flight</div>
      <pre class="code">async function pool(items, limit, worker) {
  const results = [], inFlight = new Set();
  for (const [i, item] of items.entries()) {
    const p = Promise.resolve().then(() =&gt; worker(item, i));
    results.push(p);
    <span class="cm">// track a settled-signal, not p itself: it never rejects, so a</span>
    <span class="cm">// failing job can't fire an unhandled rejection from the tracker</span>
    const slot = p.then(() =&gt; {}, () =&gt; {});
    inFlight.add(slot);
    slot.then(() =&gt; inFlight.delete(slot));
    if (inFlight.size &gt;= limit)
      await Promise.race(inFlight);      <span class="cm">// free ONE slot, then continue</span>
  }
  return Promise.all(results);           <span class="cm">// failures still surface here</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the JS thread-pool/executor — the standard answer to "process this list without overwhelming the dependency."</p>` },

  { eb:"lesson 14 · problem patterns", title:"Deadlock & lock ordering", html:`
    <p class="big">Five philosophers, five forks; each needs both neighbours' forks to eat. If everyone grabs their <b class="hl">left</b> fork at once, all five then wait forever on a right fork their neighbour holds — a <b class="hl">circular wait</b>. That's deadlock.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the circular wait (deadlock) &rarr; ordering breaks it</div>
      <svg class="estage" viewBox="0 0 300 178" width="100%" style="max-width:320px" font-family="ui-monospace,monospace">
        <defs><marker id="ah14" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#fb923c"/></marker></defs>
        <g fill="#34d3bf" font-size="7.5" text-anchor="middle">
          <rect x="172" y="43" width="10" height="10" rx="2" fill="#14293a" stroke="#34d3bf" stroke-width="1"/>
          <rect x="189" y="95" width="10" height="10" rx="2" fill="#14293a" stroke="#34d3bf" stroke-width="1"/>
          <rect x="145" y="128" width="10" height="10" rx="2" fill="#14293a" stroke="#34d3bf" stroke-width="1"/>
          <rect x="100" y="95" width="10" height="10" rx="2" fill="#14293a" stroke="#34d3bf" stroke-width="1"/>
          <rect x="117" y="43" width="10" height="10" rx="2" fill="#14293a" stroke="#34d3bf" stroke-width="1"/>
        </g>
        <g stroke="#fb923c" stroke-width="1.6" marker-end="url(#ah14)">
          <line x1="163" y1="37" x2="190" y2="57"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.10;0.13;0.72;0.77;0.97;1" values="0;0;1;1;0;0;0"/></line>
          <line x1="200" y1="83" x2="190" y2="116"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.20;0.23;0.72;0.77;0.97;1" values="0;0;1;1;0;0;0"/></line>
          <line x1="168" y1="133" x2="134" y2="133"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.30;0.33;0.72;0.77;0.97;1" values="0;0;1;1;0;0;0"/></line>
          <line x1="111" y1="118" x2="100" y2="85"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.40;0.43;0.72;0.77;0.97;1" values="0;0;1;1;0;0;0"/></line>
          <line x1="108" y1="59" x2="135" y2="39"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.50;0.53;0.72;0.77;0.97;1" values="0;0;1;1;0;0;0"/></line>
        </g>
        <g font-size="8" text-anchor="middle">
          <circle cx="150" cy="28" r="13" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/><text x="150" y="31" fill="#c6d8e6">P0</text>
          <circle cx="205" cy="68" r="13" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/><text x="205" y="71" fill="#c6d8e6">P1</text>
          <circle cx="184" cy="133" r="13" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/><text x="184" y="136" fill="#c6d8e6">P2</text>
          <circle cx="116" cy="133" r="13" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/><text x="116" y="136" fill="#c6d8e6">P3</text>
          <circle cx="95" cy="68" r="13" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/><text x="95" y="71" fill="#c6d8e6">P4</text>
        </g>
        <text x="150" y="90" font-size="9" text-anchor="middle" fill="#fb923c" opacity="0">circular wait
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.55;0.6;0.72;1" values="0;1;1;0;0"/></text>
        <g opacity="0"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.77;0.82;0.97;1" values="0;0;1;1;0"/>
          <circle cx="150" cy="80" r="52" fill="none" stroke="#34d3bf" stroke-width="1.5" stroke-dasharray="4 4"/>
          <text x="150" y="78" font-size="9" text-anchor="middle" fill="#34d3bf">lowest fork first</text>
          <text x="150" y="90" font-size="8" text-anchor="middle" fill="#34d3bf">no cycle can close</text>
        </g>
        <text x="150" y="170" fill="#647c8f" font-size="8" text-anchor="middle">each holds left, waits right &rarr; the loop closes</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">P0</div><div class="lstep bad seq" style="--i:0">holds fork0 &middot; waits fork1</div>
        <div class="lanehead seq" style="--i:1">P1</div><div class="lstep bad seq" style="--i:1">holds fork1 &middot; waits fork2</div>
        <div class="lanehead seq" style="--i:2">&hellip; P4</div><div class="lstep bad seq" style="--i:2">holds fork4 &middot; waits fork0 &mdash; cycle closes</div>
      </div>
      <div class="flowarrow seq" style="--i:3">&darr; the fix: one global lock order</div>
      <div class="dnote seq pop" style="--i:4">Always take the <b style="color:var(--ordered)">lower-numbered</b> fork first. The wrap-around philosopher now reaches for fork0 first too, so the cycle can't form.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Deadlock needs four conditions at once: mutual exclusion, hold-and-wait, no preemption, and a <b class="hl">circular wait</b>. Break any one and it can't happen. The most practical to break is the cycle: impose a <b class="hl">global order</b> on the locks and always acquire them low-to-high. The wrap-around philosopher then reaches for fork 0 before fork 4, so no cycle can close.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; lock ordering kills the cycle</div>
      <pre class="code">async function dine(n, rounds) {
  const fork = Array.from({ length: n }, () =&gt; new Mutex());
  const seat = async (i) =&gt; {
    const left = i, right = (i + 1) % n;
    <span class="cm">// GLOBAL ORDER: always take the lower-numbered fork first</span>
    const [a, b] = left &lt; right ? [left, right] : [right, left];
    for (let r = 0; r &lt; rounds; r++) {
      await fork[a].acquire();
      await fork[b].acquire();
      try { await eat(); }
      finally { fork[b].release(); fork[a].release(); }
    }
  };
  await Promise.all(Array.from({ length: n }, (_, i) =&gt; seat(i)));
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "everyone grabs their left fork" is the textbook deadlock, and a consistent global lock order is the fix you reach for in real systems — nested DB row locks, multiple mutexes, distributed resources.</p>` },

  { eb:"lesson 15 · problem patterns", title:"Rate limiting (token bucket)", html:`
    <p class="big">A <b class="hl">token bucket</b> allows a <b class="hl">burst</b> up to its capacity, then settles to a steady rate. Each call spends a token; tokens refill at a fixed rate, capped at capacity.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">capacity 3, refill ~1 / 10ms</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="88" y="16" fill="#8ca6b8" font-size="8" text-anchor="middle">bucket &middot; cap 3</text>
        <line x1="44" y1="42" x2="132" y2="42" stroke="#34d3bf" stroke-width="1" stroke-dasharray="3 3"/>
        <path d="M 48 44 L 128 44 L 120 120 L 56 120 Z" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <g stroke="#071726" stroke-width="1.4" fill="#34d3bf">
          <circle r="7"><animateMotion dur="6.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.12;0.22;0.9;1" keyPoints="0;0;1;1;0" path="M 70 104 L 250 88"/><animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.22;0.24;0.88;1" values="1;1;0;0;1"/></circle>
          <circle r="7"><animateMotion dur="6.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.18;0.28;0.9;1" keyPoints="0;0;1;1;0" path="M 88 104 L 250 88"/><animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.28;0.30;0.88;1" values="1;1;0;0;1"/></circle>
          <circle r="7"><animateMotion dur="6.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.24;0.34;0.9;1" keyPoints="0;0;1;1;0" path="M 106 104 L 250 88"/><animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.34;0.36;0.88;1" values="1;1;0;0;1"/></circle>
          <circle r="7"><animateMotion dur="6.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.42;0.55;0.64;0.76;1" keyPoints="0;0;0.34;0.34;1;1" path="M 88 20 L 88 104 L 250 88"/><animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.42;0.44;0.86;1" values="0;0;1;1;0"/></circle>
        </g>
        <text x="88" y="138" fill="#647c8f" font-size="8" text-anchor="middle">burst spends 3 &rarr; empty &rarr; drip refills</text>
        <path d="M 150 88 h 60" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="248" y="66" width="82" height="44" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="289" y="84" fill="#4eaeff" font-size="9" text-anchor="middle">take()</text>
        <text x="289" y="100" font-size="7.5" text-anchor="middle" fill="#fb923c" opacity="0">4th waits
          <animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.36;0.4;0.62;0.64;1" values="0;0;1;1;0;0"/></text>
        <text x="289" y="100" font-size="7.5" text-anchor="middle" fill="#34d3bf" opacity="0">served
          <animate attributeName="opacity" dur="6.5s" repeatCount="indefinite" keyTimes="0;0.64;0.68;0.86;1" values="0;0;1;1;0"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">start</div><div class="lstep good seq pop" style="--i:0">bucket full: &#9679;&#9679;&#9679;</div>
        <div class="lanehead seq" style="--i:1">burst</div><div class="lstep seq" style="--i:1">3 calls fire instantly &mdash; spend all 3</div>
        <div class="lanehead seq" style="--i:2">empty</div><div class="lstep wait seq" style="--i:2">4th call waits for a drip</div>
        <div class="lanehead seq" style="--i:3">refill</div><div class="lstep good seq pop" style="--i:3">+1 token / 10ms &rarr; steady rate</div>
      </div>
      <div class="dnote seq" style="--i:4">The cap bounds the burst; <code>Math.min(cap, tokens + refilled)</code> stops idle time from banking infinite tokens.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two details make it work. Refill is <b class="hl">lazy</b>: instead of a timer dripping tokens, you compute how many <i>would</i> have accrued since the last call from elapsed time. And the refill is <b class="hl">capped</b> at capacity with <code>Math.min</code> — without that ceiling, a long idle period banks unlimited tokens and the next caller bursts straight through the limit.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; lazy refill, capped burst</div>
      <pre class="code">class TokenBucket {
  #cap; #tokens; #ratePerMs; #last = Date.now();
  constructor(cap, ratePerSec) {
    this.#cap = cap; this.#tokens = cap;          <span class="cm">// start full: one burst allowed</span>
    this.#ratePerMs = ratePerSec / 1000;
  }
  #refill() {
    const now = Date.now();
    const gained = (now - this.#last) * this.#ratePerMs;
    this.#tokens = Math.min(this.#cap, this.#tokens + gained);  <span class="cm">// cap bounds the burst</span>
    this.#last = now;
  }
  async take() {
    this.#refill();
    while (this.#tokens &lt; 1) {                     <span class="cm">// empty: wait for a drip</span>
      await sleep((1 - this.#tokens) / this.#ratePerMs);
      this.#refill();
    }
    this.#tokens -= 1;
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> it's the rate limiter that <i>allows</i> bursts (unlike a fixed window) — the usual answer for client throttling and API quotas.</p>` },

  { eb:"lesson 16 · problem patterns", title:"Select — first ready wins", html:`
    <p class="big">Sometimes you want whichever of several async sources is ready <b class="hl">first</b> — fastest replica, first response, value-or-timeout. Tag each source and race them.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">race three sources, take the winner</div>
      <svg class="estage" viewBox="0 0 340 140" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="278" y1="24" x2="278" y2="120" stroke="#34d3bf" stroke-width="1.4" stroke-dasharray="2 3"/>
        <text x="278" y="18" fill="#34d3bf" font-size="8" text-anchor="middle">first ready</text>
        <g stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5">
          <line x1="70" y1="40" x2="278" y2="40"/><line x1="70" y1="72" x2="278" y2="72"/><line x1="70" y1="104" x2="278" y2="104"/></g>
        <g font-size="8" text-anchor="end"><text x="60" y="43" fill="#8ca6b8">A &middot; 30ms</text><text x="60" y="75" fill="#34d3bf">B &middot; 6ms</text><text x="60" y="107" fill="#8ca6b8">C &middot; 18ms</text></g>
        <circle r="6" fill="#647c8f" stroke="#071726" stroke-width="1.5"><animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.55;1" keyPoints="0;0;1;1" path="M 70 40 L 272 40"/></circle>
        <circle r="6.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5"><animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.22;1" keyPoints="0;0;1;1" path="M 70 72 L 272 72"/></circle>
        <circle r="6" fill="#647c8f" stroke="#071726" stroke-width="1.5"><animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.40;1" keyPoints="0;0;1;1" path="M 70 104 L 272 104"/></circle>
        <text x="230" y="132" fill="#34d3bf" font-size="8.5" text-anchor="middle" opacity="0">B wins &mdash; and you know it was B
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.24;0.3;0.92;1" values="0;0;1;1;0"/></text>
      </svg>
      <div class="histtape">
        <span class="chip2 seq pop" style="--i:0">A @ 30ms</span>
        <span class="chip2 seq pop" style="--i:1">B @ 6ms</span>
        <span class="chip2 seq pop" style="--i:2">C @ 18ms</span>
      </div>
      <div class="flowarrow seq" style="--i:3">&darr; Promise.race</div>
      <div class="dnote seq pop" style="--i:4"><b style="color:var(--ordered)">B wins</b> (6ms) &mdash; and you learn <i>which</i> source it was via its label.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The mechanism is just <code>Promise.race</code>, with one addition: tag each source so the winner tells you <i>which</i> one it was. Attach the label inside the <code>.then</code> before racing, and the resolved value carries both the payload and its origin — the difference between "a reply came back" and "replica&nbsp;B replied."</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; race, but keep the label</div>
      <pre class="code">function select(sources) {              <span class="cm">// [{ label, promise }]</span>
  return Promise.race(
    sources.map(s =&gt; s.promise.then(value =&gt; ({ label: s.label, value })))
  );
}

const winner = await select([
  { label: 'replica-A', promise: fetchA() },
  { label: 'replica-B', promise: fetchB() },
  { label: 'timeout',   promise: sleep(200).then(() =&gt; 'timed out') },
]);
<span class="cm">// winner.label says who won; the losers keep running unless you cancel them</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> it's JS's take on Go's <code>select</code> — fastest-replica, first-response, and value-or-timeout are all this shape. (A faithful channel-select also cancels the losers; race alone leaves them running.)</p>` },

  { eb:"lesson 17 · async toolkit", title:"Debounce & throttle", html:`
    <p class="big">Two ways to tame a flood of events. <b class="hl">Debounce</b> waits for quiet: it fires once, after the calls stop (search-as-you-type). <b class="hl">Throttle</b> fires at most once per interval, however fast the calls come (scroll handlers).</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">calls: | | | | | | &nbsp; (a rapid burst)</div>
      <svg class="estage" viewBox="0 0 340 132" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <g font-size="8" text-anchor="end" fill="#8ca6b8"><text x="44" y="31">calls</text><text x="44" y="75">debounce</text><text x="44" y="111">throttle</text></g>
        <g stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"><line x1="52" y1="28" x2="304" y2="28"/><line x1="52" y1="72" x2="304" y2="72"/><line x1="52" y1="108" x2="304" y2="108"/></g>
        <g fill="#4eaeff"><rect x="68" y="20" width="3" height="16" rx="1"/><rect x="82" y="20" width="3" height="16" rx="1"/><rect x="96" y="20" width="3" height="16" rx="1"/><rect x="110" y="20" width="3" height="16" rx="1"/><rect x="124" y="20" width="3" height="16" rx="1"/><rect x="138" y="20" width="3" height="16" rx="1"/></g>
        <text x="103" y="48" fill="#647c8f" font-size="7" text-anchor="middle">rapid burst</text>
        <circle cx="168" cy="72" r="6.5" fill="#34d3bf" stroke="#071726" stroke-width="1.4" opacity="0"><animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.40;0.46;0.9;1" values="0;0;1;1;0"/></circle>
        <text x="200" y="76" fill="#34d3bf" font-size="7" text-anchor="start" opacity="0">one fire, after quiet<animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.46;0.5;0.9;1" values="0;0;1;1;0"/></text>
        <g fill="#34d3bf" stroke="#071726" stroke-width="1.4">
          <circle cx="70" cy="108" r="6" opacity="0"><animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.07;0.11;0.95;1" values="0;0;1;1;0"/></circle>
          <circle cx="138" cy="108" r="6" opacity="0"><animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.29;0.33;0.95;1" values="0;0;1;1;0"/></circle>
        </g>
        <text x="196" y="112" fill="#647c8f" font-size="7" text-anchor="start">no more calls &rarr; no more fires</text>
        <line x1="52" y1="16" x2="52" y2="118" stroke="#4eaeff" stroke-width="1.2" opacity="0.55"><animateTransform attributeName="transform" type="translate" dur="5s" repeatCount="indefinite" keyTimes="0;0.85;0.851;1" values="0 0;252 0;0 0;0 0"/></line>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">debounce</div><div class="lstep good seq pop" style="--i:0">&hellip; wait for quiet &hellip; &rarr; ONE call</div>
        <div class="lanehead seq" style="--i:1">throttle</div><div class="lstep good seq pop" style="--i:1">fire &middot; (skip skip) &middot; fire &middot; then quiet &rarr; nothing</div>
      </div>
      <div class="dnote seq" style="--i:2">Debounce = collapse a burst to its trailing edge. Throttle = a steady rate cap.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The implementations are almost twins, but the timer logic is opposite. Debounce keeps <b class="hl">resetting</b> a timer on every call, so it only fires once the calls stop. Throttle records <i>when it last fired</i> and refuses until an interval has passed — a steady cadence <i>while calls keep arriving</i>. Note this leading-edge version fires on the first call of a burst and <b class="hl">drops the trailing one</b> — the final scroll position never fires; add a trailing timer if you need it.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; collapse vs. rate-cap</div>
      <pre class="code">function debounce(fn, wait) {
  let t;
  return (...args) =&gt; {
    clearTimeout(t);                    <span class="cm">// cancel the previous pending call</span>
    t = setTimeout(() =&gt; fn(...args), wait);   <span class="cm">// fires only after quiet</span>
  };
}

function throttle(fn, interval) {
  let last = 0;
  return (...args) =&gt; {
    const now = Date.now();
    if (now - last &gt;= interval) {        <span class="cm">// enough time passed? fire + stamp</span>
      last = now;
      fn(...args);
    }
  };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the most common front-end async question — and people constantly mix the two up. Know which one collapses a burst and which rate-caps.</p>` },

  { eb:"lesson 18 · async toolkit", title:"Promise.all, from scratch", html:`
    <p class="big">Run promises concurrently and collect their results <b class="hl">in input order</b>, resolving only when the last one settles (and rejecting on the first failure). The key move: write each result into its own <b class="hl">index</b>, not push.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">[a@18ms, b@2ms, c@10ms] &rarr; results by index</div>
      <svg class="estage" viewBox="0 0 340 146" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="55" y="16" fill="#8ca6b8" font-size="8" text-anchor="middle">promises</text>
        <text x="285" y="16" fill="#34d3bf" font-size="8" text-anchor="middle">results[i]</text>
        <g font-size="8.5" text-anchor="middle">
          <rect x="18" y="24" width="74" height="26" rx="7" fill="#071726" stroke="#4eaeff" stroke-width="1.3"/><text x="55" y="41" fill="#c6d8e6">a &middot; i0</text>
          <rect x="18" y="60" width="74" height="26" rx="7" fill="#071726" stroke="#4eaeff" stroke-width="1.3"/><text x="55" y="77" fill="#c6d8e6">b &middot; i1</text>
          <rect x="18" y="96" width="74" height="26" rx="7" fill="#071726" stroke="#4eaeff" stroke-width="1.3"/><text x="55" y="113" fill="#c6d8e6">c &middot; i2</text>
        </g>
        <g font-size="8.5" text-anchor="middle">
          <rect x="248" y="24" width="60" height="26" rx="7" fill="#071726" stroke="#315066" stroke-width="1.4"><animate attributeName="stroke" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.62;0.66;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect>
          <rect x="248" y="60" width="60" height="26" rx="7" fill="#071726" stroke="#315066" stroke-width="1.4"><animate attributeName="stroke" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.22;0.26;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect>
          <rect x="248" y="96" width="60" height="26" rx="7" fill="#071726" stroke="#315066" stroke-width="1.4"><animate attributeName="stroke" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.40;0.44;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect>
          <text x="278" y="41" fill="#34d3bf" opacity="0">a<animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.63;0.66;1" values="0;0;1;1"/></text>
          <text x="278" y="77" fill="#34d3bf" opacity="0">b<animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.23;0.26;1" values="0;0;1;1"/></text>
          <text x="278" y="113" fill="#34d3bf" opacity="0">c<animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.41;0.44;1" values="0;0;1;1"/></text>
        </g>
        <g stroke="#071726" stroke-width="1.4" fill="#34d3bf">
          <circle r="6"><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.1;0.11;0.25;1" values="0;0;1;0;0"/><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.11;0.24;1" keyPoints="0;0;1;1" path="M 92 73 L 248 73"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.28;0.29;0.43;1" values="0;0;1;0;0"/><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.29;0.42;1" keyPoints="0;0;1;1" path="M 92 109 L 248 109"/></circle>
          <circle r="6"><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.50;0.51;0.65;1" values="0;0;1;0;0"/><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.51;0.64;1" keyPoints="0;0;1;1" path="M 92 37 L 248 37"/></circle>
        </g>
        <text x="170" y="140" font-size="8" text-anchor="middle" fill="#647c8f">b settles first &rarr; but lands in slot i1 &middot; output stays [a, b, c]</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">b done</div><div class="lstep seq" style="--i:0">results[1] = b &middot; done 1/3</div>
        <div class="lanehead seq" style="--i:1">c done</div><div class="lstep seq" style="--i:1">results[2] = c &middot; done 2/3</div>
        <div class="lanehead seq" style="--i:2">a done</div><div class="lstep good seq pop" style="--i:2">results[0] = a &middot; done 3/3 &rarr; resolve</div>
      </div>
      <div class="dnote seq" style="--i:3">Output is <b style="color:var(--ordered)">[a, b, c]</b> — input order — even though b finished first. <code>push</code> would scramble it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two things are easy to get wrong. Results must land by <b class="hl">index</b>, not <code>push</code> — otherwise a fast promise's value lands in an early slot and the output is scrambled. And "done" is a <b class="hl">counter</b>, not <code>results.length</code>: with index assignment the array can have its final length long before every slot is filled.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; concurrent, ordered, fail-fast</div>
      <pre class="code">function promiseAll(promises) {
  return new Promise((resolve, reject) =&gt; {
    const results = [];
    let done = 0;
    if (promises.length === 0) return resolve(results);
    promises.forEach((p, i) =&gt; {
      Promise.resolve(p).then(value =&gt; {
        results[i] = value;             <span class="cm">// slot by INDEX -> input order preserved</span>
        if (++done === promises.length) resolve(results);
      }, reject);                       <span class="cm">// first rejection rejects the whole thing</span>
    });
  });
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> a favourite "implement it yourself" question; the index-vs-push detail is exactly what they're checking. (<code>allSettled</code> swaps the fail-fast <code>reject</code> for recording each outcome.)</p>` },

  { eb:"lesson 19 · async toolkit", title:"Retry with backoff", html:`
    <p class="big">Transient failures (a flaky network, a busy service) deserve a retry — but a <b class="hl">bounded</b> one, with <b class="hl">exponential backoff</b> so you don't hammer a struggling dependency.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">retry until success, growing the delay</div>
      <svg class="estage" viewBox="0 0 340 128" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="54" y1="60" x2="240" y2="60" stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"/>
        <path d="M 65 60 Q 87 40 109 60" fill="none" stroke="#647c8f" stroke-width="1.2"/>
        <text x="87" y="34" fill="#647c8f" font-size="7.5" text-anchor="middle">wait 1&times;</text>
        <path d="M 131 60 Q 180 30 229 60" fill="none" stroke="#647c8f" stroke-width="1.2"/>
        <text x="180" y="26" fill="#647c8f" font-size="7.5" text-anchor="middle">wait 2&times; (doubles)</text>
        <g text-anchor="middle" font-size="9">
          <circle cx="54" cy="60" r="11" fill="#071726" stroke="#fb923c" stroke-width="1.5"/><text x="54" y="63" fill="#c6d8e6">1</text><text x="54" y="86" fill="#fb923c" font-size="9">&#10007;</text>
          <circle cx="120" cy="60" r="11" fill="#071726" stroke="#fb923c" stroke-width="1.5"/><text x="120" y="63" fill="#c6d8e6">2</text><text x="120" y="86" fill="#fb923c" font-size="9">&#10007;</text>
          <circle cx="240" cy="60" r="11" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/><text x="240" y="63" fill="#c6d8e6">3</text><text x="240" y="86" fill="#34d3bf" font-size="9">&#10003;</text>
        </g>
        <circle r="6.5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.24;0.30;0.61;0.68;1" keyPoints="0;0;0.355;0.355;1;1" path="M 54 60 L 120 60 L 240 60"/></circle>
        <text x="285" y="63" fill="#34d3bf" font-size="8" text-anchor="middle" opacity="0">success<animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.70;0.74;0.95;1" values="0;0;1;1;0"/></text>
        <text x="170" y="116" fill="#647c8f" font-size="8" text-anchor="middle">bounded tries &middot; each delay doubles &middot; + jitter</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">try 1</div><div class="lstep bad seq" style="--i:0">fail &rarr; wait 1&times;</div>
        <div class="lanehead seq" style="--i:1">try 2</div><div class="lstep bad seq" style="--i:1">fail &rarr; wait 2&times;</div>
        <div class="lanehead seq" style="--i:2">try 3</div><div class="lstep good seq pop" style="--i:2">success</div>
        <div class="lanehead seq" style="--i:3">cap</div><div class="lstep seq" style="--i:3">out of tries &rarr; throw (don't loop forever)</div>
      </div>
      <div class="dnote seq" style="--i:4">Delay <code>base &middot; 2**n</code>; cap the attempts. Unbounded retries against a dead dependency are a retry storm.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Three ingredients. <b class="hl">Bounded</b> attempts so a permanently-dead dependency doesn't loop forever. <b class="hl">Exponential</b> backoff (<code>base · 2ⁿ</code>) so each retry waits longer, giving the service room to recover. And <b class="hl">jitter</b> — a random nudge — so a thousand clients that failed together don't all retry in lock-step and hammer it again.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; bounded, backed off, jittered</div>
      <pre class="code">async function retry(fn, { tries = 3, base = 100 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt &gt;= tries) throw err;              <span class="cm">// out of tries -> surface it</span>
      const backoff = base * 2 ** (attempt - 1);     <span class="cm">// 100, 200, 400, ...</span>
      await sleep(backoff + Math.random() * base);   <span class="cm">// + jitter</span>
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "make it robust" almost always means bounded retries + backoff — ideally with jitter and, past a threshold, a circuit breaker that stops trying entirely.</p>` },

  { eb:"lesson 20 · async toolkit", title:"Memoize & dedupe", html:`
    <p class="big">When many callers request the same key at once, you want <b class="hl">one</b> computation shared by all — not N identical fetches. Cache the in-flight <b class="hl">promise</b> per key, and evict it if it rejects.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">5 concurrent calls: x, x, x, y, x</div>
      <svg class="estage" viewBox="0 0 340 152" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <g stroke="#244155" stroke-width="1" stroke-dasharray="3 4"><line x1="62" y1="28" x2="118" y2="78"/><line x1="62" y1="54" x2="118" y2="78"/><line x1="62" y1="80" x2="118" y2="78"/><line x1="62" y1="106" x2="118" y2="78"/><line x1="62" y1="132" x2="118" y2="78"/><line x1="202" y1="78" x2="252" y2="53"/><line x1="202" y1="78" x2="252" y2="113"/></g>
        <g font-size="8.5" text-anchor="middle">
          <rect x="14" y="18" width="48" height="20" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/><text x="38" y="32" fill="#c6d8e6">x</text>
          <rect x="14" y="44" width="48" height="20" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/><text x="38" y="58" fill="#c6d8e6">x</text>
          <rect x="14" y="70" width="48" height="20" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/><text x="38" y="84" fill="#c6d8e6">x</text>
          <rect x="14" y="96" width="48" height="20" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/><text x="38" y="110" fill="#c6d8e6">y</text>
          <rect x="14" y="122" width="48" height="20" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/><text x="38" y="136" fill="#c6d8e6">x</text>
        </g>
        <rect x="118" y="52" width="84" height="52" rx="10" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="160" y="72" fill="#34d3bf" font-size="8.5" text-anchor="middle">cache</text>
        <text x="160" y="86" fill="#8ca6b8" font-size="7.5" text-anchor="middle">x&rarr;p &middot; y&rarr;p</text>
        <text x="160" y="97" fill="#647c8f" font-size="7" text-anchor="middle">one promise/key</text>
        <g font-size="8" text-anchor="middle">
          <rect x="252" y="40" width="76" height="26" rx="7" fill="#071726" stroke="#315066" stroke-width="1.4"><animate attributeName="stroke" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.32;0.36;1" values="#315066;#315066;#4eaeff;#4eaeff"/></rect><text x="290" y="57" fill="#c6d8e6">fetch(x)</text>
          <rect x="252" y="100" width="76" height="26" rx="7" fill="#071726" stroke="#315066" stroke-width="1.4"><animate attributeName="stroke" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.32;0.36;1" values="#315066;#315066;#4eaeff;#4eaeff"/></rect><text x="290" y="117" fill="#c6d8e6">fetch(y)</text>
        </g>
        <circle r="5.5" fill="#4eaeff" stroke="#071726" stroke-width="1.4"><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.08;0.2;0.34;1" keyPoints="0;0;0.5;1;1" path="M 62 28 L 160 78 L 252 53"/></circle>
        <circle r="5.5" fill="#4eaeff" stroke="#071726" stroke-width="1.4"><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.08;0.2;0.34;1" keyPoints="0;0;0.5;1;1" path="M 62 106 L 160 78 L 252 113"/></circle>
        <g fill="#34d3bf" stroke="#071726" stroke-width="1.3">
          <circle r="5"><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.12;0.13;0.28;0.34;1" values="0;0;1;1;0;0"/><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.13;0.28;1" keyPoints="0;0;1;1" path="M 62 54 L 118 78"/></circle>
          <circle r="5"><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.12;0.13;0.28;0.34;1" values="0;0;1;1;0;0"/><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.13;0.28;1" keyPoints="0;0;1;1" path="M 62 80 L 118 78"/></circle>
          <circle r="5"><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.12;0.13;0.28;0.34;1" values="0;0;1;1;0;0"/><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.13;0.28;1" keyPoints="0;0;1;1" path="M 62 132 L 118 78"/></circle>
        </g>
        <text x="170" y="148" fill="#647c8f" font-size="8" text-anchor="middle">5 requests &rarr; fetch ran twice (x, y), duplicate x's share the promise</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">x (1st)</div><div class="lstep good seq" style="--i:0">miss &rarr; start fetch(x) &middot; cache promise</div>
        <div class="lanehead seq" style="--i:1">x (rest)</div><div class="lstep seq" style="--i:1">hit &rarr; share the same promise</div>
        <div class="lanehead seq" style="--i:2">y</div><div class="lstep good seq" style="--i:2">miss &rarr; start fetch(y)</div>
        <div class="lanehead seq" style="--i:3">result</div><div class="lstep good seq pop" style="--i:3">fetch ran twice (x, y), not five times</div>
      </div>
      <div class="dnote seq" style="--i:4">Caching the resolved value (after <code>await</code>) loses the race — concurrent callers all miss and refetch.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The whole trick is caching the <b class="hl">promise</b>, synchronously, before it settles — so callers arriving mid-flight get the same pending promise instead of missing the cache and starting their own. Then evict on failure, or a single transient error stays cached forever and every future caller inherits it.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; single-flight per key</div>
      <pre class="code">function memoizeAsync(fn) {
  const cache = new Map();               <span class="cm">// key -> in-flight or settled promise</span>
  return (key) =&gt; {
    if (cache.has(key)) return cache.get(key);       <span class="cm">// share the in-flight one</span>
    const promise = fn(key).catch(err =&gt; {
      cache.delete(key);                 <span class="cm">// evict on failure -> a later call can retry</span>
      throw err;
    });
    cache.set(key, promise);             <span class="cm">// cache the PROMISE immediately</span>
    return promise;
  };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> request dedup / single-flight is the JS "concurrent map" answer — collapse a stampede into one call.</p>` },

  { eb:"lesson 21 · async toolkit", title:"Cancellation & timeouts", html:`
    <p class="big">Starting work is easy; <b class="hl">stopping</b> it is the skill. An <code>AbortController</code> gives you a signal you pass into the work and <code>abort()</code> when you no longer want it — so the loser of a timeout, or the siblings of a failure, actually stop.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">timeout that cancels the loser &middot; errgroup</div>
      <svg class="estage" viewBox="0 0 340 128" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <g font-size="8" text-anchor="end" fill="#8ca6b8"><text x="46" y="55">work</text><text x="46" y="99">timer</text></g>
        <g stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"><line x1="54" y1="52" x2="300" y2="52"/><line x1="54" y1="96" x2="300" y2="96"/></g>
        <rect x="268" y="40" width="40" height="24" rx="6" fill="none" stroke="#315066" stroke-width="1.2"/><text x="288" y="55" fill="#315066" font-size="7.5" text-anchor="middle">done?</text>
        <line x1="204" y1="80" x2="204" y2="108" stroke="#fb923c" stroke-width="1.4" stroke-dasharray="2 3"/>
        <text x="204" y="120" fill="#fb923c" font-size="7.5" text-anchor="middle">timeout &rarr; abort()</text>
        <line x1="200" y1="90" x2="176" y2="60" stroke="#fb923c" stroke-width="1.6" opacity="0"><animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.40;0.44;0.6;1" values="0;0;1;0;0"/></line>
        <circle r="6.5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animate attributeName="fill" dur="5s" repeatCount="indefinite" keyTimes="0;0.42;0.46;1" values="#34d3bf;#34d3bf;#647c8f;#647c8f"/>
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.42;1" keyPoints="0;0;0.5;0.5" path="M 56 52 L 292 52"/></circle>
        <circle r="6" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.40;1" keyPoints="0;0;1;1" path="M 56 96 L 200 96"/></circle>
        <text x="176" y="42" fill="#34d3bf" font-size="7.5" text-anchor="middle" opacity="0">stops &amp; cleans up<animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.5;0.54;0.94;1" values="0;0;1;1;0"/></text>
        <text x="170" y="16" fill="#647c8f" font-size="8" text-anchor="middle">one shared AbortSignal &mdash; errgroup cancels the siblings the same way</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">timeout</div><div class="lstep seq" style="--i:0">timer wins &rarr; <b>abort()</b></div>
        <div class="lanehead seq" style="--i:1">work</div><div class="lstep good seq pop" style="--i:1">sees signal &rarr; stops &amp; cleans up (no leak)</div>
        <div class="lanehead seq" style="--i:2">errgroup</div><div class="lstep bad seq" style="--i:2">one task fails &rarr; abort the shared signal</div>
        <div class="lanehead seq" style="--i:3">siblings</div><div class="lstep good seq pop" style="--i:3">cancelled &mdash; no wasted work</div>
      </div>
      <div class="dnote seq" style="--i:4">A bare <code>Promise.race</code> reports the timeout but leaves the slow work running. Pass the signal and abort it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>A bare <code>Promise.race([work, timer])</code> tells you the timer won — but <code>work</code> keeps running in the background, holding its socket and memory. The fix is a shared <code>AbortSignal</code>: pass it into the work, and <code>abort()</code> it when the timer wins so the work actually stops and cleans up. The same one signal, shared across siblings, is all an errgroup needs.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a timeout that really cancels</div>
      <pre class="code">function withTimeout(workFn, ms) {
  const ctrl = new AbortController();
  const work  = workFn(ctrl.signal).then(v =&gt; ({ ok: v }));   <span class="cm">// work honours the signal</span>
  let cancelTimer;
  const timer = new Promise(res =&gt; {
    const t = setTimeout(() =&gt; { ctrl.abort(); res({ timedOut: true }); }, ms);
    cancelTimer = () =&gt; clearTimeout(t);  <span class="cm">// the timer must be cancellable too</span>
  });
  return Promise.race([work, timer])
    .finally(cancelTimer);               <span class="cm">// work wins -> clear the losing timer</span>
}

<span class="cm">// errgroup is the same idea: one shared signal; the first task to fail</span>
<span class="cm">// abort()s it, cancelling every sibling — no wasted work.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "now make it cancelable" is the follow-up that separates people who've shipped concurrent code from people who've only read about it.</p>` },

  { eb:"lesson 22 · durable execution", title:"Durable workflows & replay", html:`
    <p class="big">Some workflows run for days — an order that waits on payment, shipping, then a refund window. They can't just live in memory; a crash would lose them. Engines like <b class="hl">Temporal</b> persist them by recording every step to an <b class="hl">event history</b>, then <b class="hl">replaying</b> that history to rebuild state after any restart.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">event history &rarr; replay rebuilds state</div>
      <svg class="estage" viewBox="0 0 340 118" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="16" fill="#8ca6b8" font-size="8" text-anchor="middle">recorded history (durable) &mdash; replay re-runs the code over it</text>
        <g font-size="7.5" text-anchor="middle">
          <rect x="30" y="34" width="68" height="36" rx="7" fill="#071726" stroke="#315066" stroke-width="1.5"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.19;0.22;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect><text x="64" y="56" fill="#c6d8e6">Start</text>
          <rect x="106" y="34" width="68" height="36" rx="7" fill="#071726" stroke="#315066" stroke-width="1.5"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.40;0.43;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect><text x="140" y="52" fill="#c6d8e6">Timer</text><text x="140" y="63" fill="#647c8f" font-size="6.5">fired</text>
          <rect x="182" y="34" width="68" height="36" rx="7" fill="#071726" stroke="#315066" stroke-width="1.5"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.61;0.64;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect><text x="216" y="52" fill="#c6d8e6">Activity</text><text x="216" y="63" fill="#647c8f" font-size="6.5">charged</text>
          <rect x="258" y="34" width="68" height="36" rx="7" fill="#071726" stroke="#315066" stroke-width="1.5"><animate attributeName="stroke" dur="6s" repeatCount="indefinite" keyTimes="0;0.82;0.85;1" values="#315066;#315066;#34d3bf;#34d3bf"/></rect><text x="292" y="52" fill="#c6d8e6">Signal</text><text x="292" y="63" fill="#647c8f" font-size="6.5">approve</text>
        </g>
        <line x1="30" y1="28" x2="30" y2="76" stroke="#4eaeff" stroke-width="1.6"><animateTransform attributeName="transform" type="translate" dur="6s" repeatCount="indefinite" keyTimes="0;0.1;0.85;0.86;1" values="0 0;0 0;296 0;0 0;0 0"/></line>
        <text x="170" y="98" fill="#34d3bf" font-size="8" text-anchor="middle" opacity="0">same tape &rarr; same decisions<animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.85;0.88;0.98;1" values="0;0;1;1;0"/></text>
        <text x="170" y="112" fill="#647c8f" font-size="8" text-anchor="middle">so workflow code must be deterministic &mdash; no Date.now(), no random()</text>
      </svg>
      <div class="histtape">
        <span class="chip2 sync seq pop" style="--i:0">Start</span>
        <span class="chip2 macro seq pop" style="--i:1">Timer fired</span>
        <span class="chip2 micro seq pop" style="--i:2">Activity &rarr; "charged"</span>
        <span class="chip2 macro seq pop" style="--i:3">Signal: approve</span>
      </div>
      <div class="flowarrow seq" style="--i:4">&darr; replay re-runs the code over the tape</div>
      <div class="dnote seq" style="--i:5">The same history must produce the <b style="color:var(--ordered)">same decisions</b> every time. So workflow code must be <b class="hl">deterministic</b>: no <code>Date.now()</code>, no <code>Math.random()</code>, no direct I/O — those are recorded once, then replayed.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Determinism is enforced by routing every nondeterministic value through the runtime. A <b class="hl">side effect</b> wrapper runs the risky function once on the first execution and <i>records</i> its result; on replay it skips the function and returns the recorded value, so the code takes the exact same branches. Wall-clock time and sleeps go through the engine the same way — as durable, recorded facts.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; make nondeterminism replay-safe</div>
      <pre class="code"><span class="cm">// wrap anything nondeterministic so replay returns the RECORDED value</span>
function sideEffect(fn) {
  if (replaying) return history[cursor++];   <span class="cm">// replay: reuse the first run's value</span>
  const value = fn();                         <span class="cm">// first run: execute...</span>
  history.push(value); cursor++;              <span class="cm">// ...and record it</span>
  return value;
}

const id  = sideEffect(() =&gt; crypto.randomUUID());  <span class="cm">// stable across replays</span>
const now = ctx.currentTime();               <span class="cm">// workflow time, not Date.now()</span>
await ctx.sleep('15m');                       <span class="cm">// a DURABLE timer — survives a crash</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> replay turns ordinary-looking code into a crash-proof process — but it bans nondeterminism, and the in-process hazards (signals interleaving at awaits, lesson 03) still apply. That's the durable-execution module.</p>` },

  { eb:"lesson 23 · interview essentials", title:"Blocking, non-blocking, async", html:`
    <p class="big">Three ways to deal with work that isn't ready yet — a distinction interviewers love to probe.</p>
    <p><b class="hl">Blocking</b>: the caller stops until the result is ready — <code>Atomics.wait()</code> in a worker, or <code>readFileSync</code>. JS avoids this on the main thread on purpose; a blocked thread does nothing. <b class="hl">Non-blocking</b>: the call returns immediately — success or "not yet" — and you decide whether to retry (a <code>tryAcquire()</code> that returns <code>false</code>, polling <code>Atomics.load</code>). No waiting, but you may busy-poll. <b class="hl">Async</b>: hand the work off and keep going; a promise delivers the result later (<code>await</code>). This is JS's default — one thread serves many in-flight operations.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">three ways to handle "not ready yet"</div>
      <svg class="estage" viewBox="0 0 340 140" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <g font-size="8" text-anchor="end" fill="#8ca6b8"><text x="52" y="35">blocking</text><text x="52" y="79">non-block</text><text x="52" y="123">async</text></g>
        <g stroke="#244155" stroke-width="1.2" stroke-dasharray="3 5"><line x1="58" y1="32" x2="292" y2="32"/><line x1="58" y1="76" x2="292" y2="76"/><line x1="58" y1="120" x2="292" y2="120"/></g>
        <rect x="104" y="28" width="150" height="8" rx="4" fill="#315066"/>
        <text x="179" y="22" fill="#647c8f" font-size="7" text-anchor="middle">thread parked &middot; idle</text>
        <text x="279" y="35" fill="#34d3bf" font-size="9" text-anchor="middle">&#10003;</text>
        <g fill="#647c8f"><circle cx="100" cy="76" r="2.5"/><circle cx="140" cy="76" r="2.5"/><circle cx="180" cy="76" r="2.5"/><circle cx="220" cy="76" r="2.5"/></g>
        <text x="160" y="66" fill="#647c8f" font-size="7" text-anchor="middle">try &middot; not yet &middot; try &hellip;</text>
        <text x="279" y="79" fill="#34d3bf" font-size="9" text-anchor="middle">&#10003;</text>
        <rect x="104" y="116" width="0" height="8" rx="4" fill="rgba(52,211,191,.35)"><animate attributeName="width" dur="5s" repeatCount="indefinite" keyTimes="0;0.14;0.68;0.7;1" values="0;0;140;0;0"/></rect>
        <text x="174" y="110" fill="#34d3bf" font-size="7" text-anchor="middle">keeps doing other work</text>
        <text x="279" y="123" fill="#34d3bf" font-size="9" text-anchor="middle">&#10003;</text>
        <circle r="6" fill="#647c8f" stroke="#071726" stroke-width="1.4"><animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.13;0.8;0.9;1" keyPoints="0;0;0.2;0.2;1;1" path="M 58 32 L 266 32"/></circle>
        <circle r="6" fill="#fb923c" stroke="#071726" stroke-width="1.4"><animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.1;0.2;0.3;0.4;0.5;0.6;0.72;1" keyPoints="0;0.2;0.2;0.45;0.45;0.7;0.7;1;1" path="M 58 76 L 266 76"/></circle>
        <circle r="6" fill="#4eaeff" stroke="#071726" stroke-width="1.4"><animateMotion dur="5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.13;0.7;0.8;1" keyPoints="0;0;0.2;0.2;1;1" path="M 58 120 L 266 120"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">blocking</div><div class="lstep seq" style="--i:0">call &rarr; <span style="color:var(--faint)">&block;&block; thread parked, idle &block;&block;</span> &rarr; result</div>
        <div class="lanehead seq" style="--i:1">non-block</div><div class="lstep seq" style="--i:1">try &rarr; not yet &rarr; try &rarr; not yet &rarr; got it</div>
        <div class="lanehead seq" style="--i:2">async</div><div class="lstep good seq" style="--i:2">start &rarr; <span style="color:var(--ordered)">do other work</span> &rarr; callback: result</div>
      </div>
      <div class="dnote seq" style="--i:3">blocking trades a thread for simplicity &middot; non-blocking trades simplicity for control &middot; async trades control for throughput.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Notice these describe the <i>caller's</i> relationship to the work, not the work itself. The same fetch can be awaited (async), polled (non-blocking), or — in a worker — waited on (blocking). What changes is whether the caller stops, spins, or hands off.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the same "not ready yet", three ways</div>
      <pre class="code"><span class="cm">// BLOCKING — the thread stops until the value is ready (worker only)</span>
Atomics.wait(cell, 0, 0);          <span class="cm">// parks the whole thread; does nothing meanwhile</span>
const value = cell[1];

<span class="cm">// NON-BLOCKING — returns now; you poll and retry yourself</span>
while (!tryAcquire()) {            <span class="cm">// got 'not yet' -> spin or go do other work</span>
  <span class="cm">/* ... */</span>
}

<span class="cm">// ASYNC — hand off, keep serving other work, resume on a callback</span>
const value = await fetchValue();  <span class="cm">// one thread, many in-flight operations</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> naming which model you're in — and its trade-off (a thread, or control, or throughput) — out loud is half of a concurrency interview.</p>
    <p class="sub" style="margin-top:14px">That's the core map. The chapters ahead go deeper &mdash; ordered merge, async iterators, cancellation, Node's loop, testing &mdash; or tap a chip above to start drilling.</p>` },
];

/* ---- lesson <-> skill cross-links ----
   Lessons teach a concept; the matching skill checks comprehension from a
   different angle (diagnose the symptom / pick for a new requirement), so the
   two never just mirror each other. These maps wire the two directions. */
// skill (drill) id -> the lesson whose concept it tests (0-based index)
const DRILL_LESSON = {
  mutex:3, semaphore:3, latch:4, barrier:4, queue:3, sequencer:11, condvar:5, atomiclock:6, rwlock:7, once:8,
  printorder:11, pool:12, dining:13, tokenbucket:14, boundedqueue:10, logproc:11, select:15,
  debounce:16, throttle:16, promiseall:17, retry:18, memoize:19, canceltimeout:20, errgroup:20,
  replay:21, durabletimeout:21, signalmutex:2, condition:5,
};
// lesson index -> where to go practice it { mod, drill? }
const LESSON_PRACTICE = {
  0:{mod:"model"}, 1:{mod:"model"}, 2:{mod:"primitives",drill:"mutex"},
  3:{mod:"primitives",drill:"mutex"}, 4:{mod:"primitives",drill:"latch"}, 5:{mod:"primitives",drill:"condvar"},
  6:{mod:"primitives",drill:"atomiclock"}, 7:{mod:"primitives",drill:"rwlock"}, 8:{mod:"primitives",drill:"once"},
  9:{mod:"race"}, 10:{mod:"bank",drill:"boundedqueue"}, 11:{mod:"bank",drill:"printorder"},
  12:{mod:"bank",drill:"pool"}, 13:{mod:"bank",drill:"dining"}, 14:{mod:"bank",drill:"tokenbucket"},
  15:{mod:"bank",drill:"select"}, 16:{mod:"toolkit",drill:"debounce"}, 17:{mod:"toolkit",drill:"promiseall"},
  18:{mod:"toolkit",drill:"retry"}, 19:{mod:"toolkit",drill:"memoize"}, 20:{mod:"toolkit",drill:"canceltimeout"},
  21:{mod:"durable",drill:"replay"}, 22:{mod:"tradeoffs"},
};
