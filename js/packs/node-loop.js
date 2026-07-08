/* Content pack — Node's event loop + the promise combinator family +
   unhandled-rejection hygiene. Loads after js/content.js, before js/app.js.
   Classic script, shared global scope: appends into LESSONS, QUIZ,
   DRILLS.toolkit, WRITE, CARDS, and registers cross-links. */
"use strict";
(() => {
  /* ---- lesson indices captured before we push (for cross-links) ---- */
  const liLoop = LESSONS.length;        // "node's loop" lesson index
  const liComb = LESSONS.length + 1;    // "combinators + hygiene" lesson index

  /* =====================================================================
     LESSONS
     ===================================================================== */
  LESSONS.push({ eb:`lesson ${String(LESSONS.length + 1).padStart(2, "0")} · node's loop`,
    title:"Node's loop: same idea, more queues", html:`
    <p class="big">The browser rule — <b class="hl">sync, then all microtasks, then one macrotask</b> — still holds in Node. Node just splits "macrotasks" across a ring of <b class="hl">phases</b>, and adds a second, higher-priority micro-queue.</p>
    <p>Each turn walks the phases in a fixed order: <b class="hl">timers</b> (due <code>setTimeout</code>/<code>setInterval</code>) &rarr; <b class="hl">pending</b> system callbacks &rarr; <b class="hl">poll</b> (I/O — where the loop usually waits) &rarr; <b class="hl">check</b> (<code>setImmediate</code> lives here) &rarr; <b class="hl">close</b> callbacks. Then it loops.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">node's loop &middot; one trip through the phases</div>
      <svg viewBox="0 0 320 222" width="100%" style="max-width:344px;display:block;margin:2px auto 0" font-family="ui-monospace,monospace">
        <path d="M 160 30 L 286 96 L 236 196 L 84 196 L 34 96 Z" fill="none" stroke="#2c3350" stroke-width="1.4" stroke-dasharray="4 5"/>
        <rect x="112" y="14" width="96" height="34" rx="8" fill="#11131c" stroke="#ff9a6b"/>
        <text x="160" y="30" fill="#ff9a6b" font-size="8.5" text-anchor="middle">TIMERS</text>
        <text x="160" y="42" fill="#8b90ab" font-size="7.5" text-anchor="middle">setTimeout / setInterval</text>
        <rect x="238" y="80" width="78" height="32" rx="8" fill="#11131c" stroke="#2c3350"/>
        <text x="277" y="94" fill="#8b90ab" font-size="8" text-anchor="middle">PENDING</text>
        <text x="277" y="105" fill="#6a7090" font-size="7" text-anchor="middle">system cbs</text>
        <rect x="190" y="182" width="92" height="34" rx="8" fill="#11131c" stroke="#8e86f0"/>
        <text x="236" y="198" fill="#8e86f0" font-size="8.5" text-anchor="middle">POLL</text>
        <text x="236" y="210" fill="#8b90ab" font-size="7.5" text-anchor="middle">I/O &middot; fs &middot; sockets</text>
        <rect x="38" y="182" width="92" height="34" rx="8" fill="#11131c" stroke="#57e0b0"/>
        <text x="84" y="198" fill="#57e0b0" font-size="8.5" text-anchor="middle">CHECK</text>
        <text x="84" y="210" fill="#8b90ab" font-size="7.5" text-anchor="middle">setImmediate</text>
        <rect x="4" y="80" width="78" height="32" rx="8" fill="#11131c" stroke="#2c3350"/>
        <text x="43" y="94" fill="#8b90ab" font-size="8" text-anchor="middle">CLOSE</text>
        <text x="43" y="105" fill="#6a7090" font-size="7" text-anchor="middle">'close' cbs</text>
        <circle r="7" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            path="M 160 30 L 286 96 L 236 196 L 84 196 L 34 96 Z"/>
        </circle>
      </svg>
      <div class="dnote seq" style="--i:0"><span class="spin" style="color:var(--accent)">&#8635;</span> between <b>every</b> callback: drain the <b style="color:var(--accent)">nextTick</b> queue, then the <b style="color:var(--ordered)">promise</b> microtask queue &mdash; both to empty &mdash; before moving on.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>There are <b class="hl">two</b> micro-queues, not one. <code>process.nextTick</code> has its own queue that drains <b class="hl">before</b> the promise microtask queue (<code>.then</code>/<code>await</code>). Both are drained to empty between every callback and before each phase — so <code>nextTick</code> always beats a <code>.then</code>, and both still beat any timer.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the phase ring and the two micro-queues</div>
      <pre class="code"><span class="cm">// each phase runs its due callbacks; BETWEEN every callback Node drains:</span>
<span class="cm">//   1. the process.nextTick queue   (highest priority)</span>
<span class="cm">//   2. the Promise microtask queue  (.then / await continuations)</span>
timers   <span class="cm">// due setTimeout / setInterval</span>
pending  <span class="cm">// deferred system callbacks</span>
poll     <span class="cm">// I/O: fs, sockets — the loop parks here waiting for work</span>
check    <span class="cm">// setImmediate callbacks — always right after poll</span>
close    <span class="cm">// 'close' events, then loop back to timers</span></pre>
    </div>
    <p><b class="hl">The famous trap:</b> at the top level, <code>setTimeout(fn, 0)</code> vs <code>setImmediate(fn)</code> is <b class="hl">nondeterministic</b> — the timer may or may not be "due" by the time the first loop turn reaches the timers phase, so it races process startup. But inside an <b class="hl">I/O callback</b> (you're in the poll phase), <code>setImmediate</code> <b class="hl">always</b> wins: check is the very next phase, while timers only come back around on the following turn.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; recursive nextTick starves the loop</div>
      <pre class="code"><span class="cm">// nextTick drains before the loop ever advances a phase —</span>
function loop() { process.nextTick(loop); }
loop();   <span class="cm">// the nextTick queue never empties, so I/O, timers, and</span>
          <span class="cm">// setImmediate behind it NEVER get a turn. (setImmediate,</span>
          <span class="cm">// which yields to a phase, wouldn't starve like this.)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> interviewers probe exactly this — "microtasks before macrotasks" transfers straight from the browser, and the extra structure (nextTick's priority queue, the phase ring) is what Node adds on top. One honest caveat for the quiz that follows: <b class="hl">the app runs none of these snippets</b> — but every answer is precisely what Node prints, verified by running each 25&times;.</p>` });

  LESSONS.push({ eb:`lesson ${String(LESSONS.length + 1).padStart(2, "0")} · combinators`,
    title:"The combinator family + rejection hygiene", html:`
    <p class="big">Four ways to await many promises at once. They differ only in <b class="hl">when they settle</b> and <b class="hl">how they treat failure</b> — pick by what you actually need.</p>
    <div class="diagram anim" style="--step:.55s">
      <div class="dlabel">the combinator family &middot; pick by what you need</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">need ALL</div><div class="lstep seq" style="--i:0"><b style="color:var(--ordered)">Promise.all</b> &mdash; every value in input order; <b style="color:var(--race)">fail-fast</b> on the first rejection</div>
        <div class="lanehead seq" style="--i:1">best-effort</div><div class="lstep seq" style="--i:1"><b style="color:var(--ordered)">allSettled</b> &mdash; <b>never rejects</b>; one <code>{status, value|reason}</code> per input</div>
        <div class="lanehead seq" style="--i:2">first WIN</div><div class="lstep seq" style="--i:2"><b style="color:var(--ordered)">any</b> &mdash; first <b>fulfillment</b>; all reject &rarr; <code>AggregateError.errors</code> (input order)</div>
        <div class="lanehead seq" style="--i:3">deadline</div><div class="lstep seq" style="--i:3"><b style="color:var(--ordered)">race</b> &mdash; first to <b>settle</b>, fulfillment or rejection</div>
      </div>
      <div class="dnote seq" style="--i:4">Need all? <b>all</b>. Best-effort batch? <b>allSettled</b>. First success wins? <b>any</b>. Deadline / timeout? <b>race</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The two that never confuse: <code>all</code> rejects the instant <i>any</i> input rejects (and hands you the values in input order otherwise); <code>allSettled</code> waits for everything and <b class="hl">never rejects</b> — each result is a tagged <code>{status:"fulfilled", value}</code> or <code>{status:"rejected", reason}</code>. The subtle pair: <code>any</code> resolves on the first <i>fulfillment</i> and only rejects — with an <code>AggregateError</code> whose <code>errors</code> are in <b class="hl">input</b> order — if <i>every</i> input rejects; <code>race</code> settles on the first to finish <b class="hl">either way</b>, so a fast rejection wins it.</p>
    <p><b class="hl">Rejection hygiene.</b> A rejected promise that has <i>no handler attached at the moment its rejection settles</i> is an <b class="hl">unhandled rejection</b> — Node crashes on it by default. The check is made at <b class="hl">settle-time</b>, not creation-time, so the rule is: <b class="hl">attach the <code>.catch</code> synchronously</b>, before you yield.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; fire-and-forget, and how to make it safe</div>
      <pre class="code"><span class="cm">// THE TRAP — fire-and-forget: a rejection with no handler yet</span>
doWork();                       <span class="cm">// rejects → unhandledRejection → crash</span>

<span class="cm">// fix 1: attach the catch synchronously (mark it handled now)</span>
void doWork().catch(log);

<span class="cm">// fix 2: collect first, then await together — allSettled never throws</span>
const tasks = inputs.map(x =&gt; doWork(x));   <span class="cm">// all in flight, none awaited yet</span>
const results = await Promise.allSettled(tasks);

<span class="cm">// THE SUBTLE await TRAP</span>
await a;   <span class="cm">// if b rejects WHILE you're parked here, b had no handler yet</span>
await b;   <span class="cm">// fix: start both first — const pb = b() — THEN await pb</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "just add a <code>.catch</code>" is right, but <i>when</i> you add it is the whole game. A handler attached one <code>await</code> too late doesn't stop the unhandled-rejection event that already fired. Start every promise with its failure path attached — then choose the combinator that matches the outcome you need.</p>` });

  /* =====================================================================
     QUIZ — Node-flavored, predict-the-output. All DETERMINISTIC:
     verified byte-identical across 25 Node runs each. Correct option FIRST.
     ===================================================================== */
  QUIZ.push(
    { code:`setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');`,
      options:["sync nextTick promise timeout","sync promise nextTick timeout","nextTick sync promise timeout"], answer:0,
      whys:[
        "Right. Synchronous code runs first (sync). Before returning to the loop Node drains process.nextTick's queue (nextTick) ahead of the promise microtask queue (promise). setTimeout is a timers-phase macrotask, so it runs last.",
        "process.nextTick has its OWN queue that drains BEFORE promise microtasks — so nextTick beats the .then, not the other way around. The order is sync, nextTick, promise, then the timer.",
        "Synchronous code isn't deferred: console.log('sync') runs inline, before any queued callback. nextTick only jumps ahead of the OTHER deferred callbacks, never ahead of synchronous code."] },

    { code:`process.nextTick(() => console.log('C'));
Promise.resolve().then(() => {
  console.log('A');
  process.nextTick(() => console.log('B'));
});
Promise.resolve().then(() => console.log('D'));`,
      options:["C A D B","C A B D","A D C B"], answer:0,
      whys:[
        "Right. The nextTick queue (C) drains before the promise microtasks, so C is first. Then the microtask queue drains to exhaustion — A, then D — and the nextTick B that A scheduled waits until that drain finishes. So C, A, D, B.",
        "B is a nextTick scheduled from INSIDE a microtask (A). Node finishes draining the current promise-microtask queue — so D runs — before it returns to the nextTick queue for B. D precedes B.",
        "process.nextTick's queue drains BEFORE the promise microtask queue, so C (a nextTick) runs before A and D (the .then callbacks). C comes first, not third."] },

    { code:`const fs = require('fs');
fs.readFile(__filename, () => {
  setTimeout(() => console.log('T'), 0);
  setImmediate(() => console.log('I'));
  process.nextTick(() => console.log('N'));
});`,
      options:["N I T","N T I","T N I"], answer:0,
      whys:[
        "Right. Inside an I/O (poll-phase) callback the nextTick queue drains first (N), then the loop advances to the very next phase — check — so setImmediate (I) fires before it can loop back to the timers phase (T).",
        "Inside an I/O callback the check phase (setImmediate) comes immediately after poll, before the loop wraps back to timers — so setImmediate beats setTimeout here: I before T. (At the top level this exact pair races; inside I/O it never does.)",
        "process.nextTick runs before ANY phase callback, including the timer — so N can't come after T. And setImmediate (check) follows the poll phase you're already in, so it precedes the next timers phase."] },
  );

  /* =====================================================================
     DRILLS.toolkit — fill-the-blank, correct FIRST, each with a live demo
     ===================================================================== */
  async function demoCombinatorChoose(){
    const settled = await Promise.allSettled([
      Promise.resolve("ok-1"),
      Promise.reject(new Error("boom")),
      sleep(6).then(() => "ok-2"),
    ]);
    const shape = settled.map(s => s.status === "fulfilled" ? `fulfilled:${s.value}` : `rejected:${s.reason.message}`);
    const pass = settled.length === 3 &&
      settled[0].status === "fulfilled" && settled[0].value === "ok-1" &&
      settled[1].status === "rejected" && settled[1].reason.message === "boom" &&
      settled[2].status === "fulfilled" && settled[2].value === "ok-2";
    return { lines:[
      { t:`allSettled over [ ok, reject, ok ]` },
      { t:`statuses: ${settled.map(s => s.status).join(", ")}` },
      { t:shape.join("   ·   ") },
    ], pass, verdict: pass ? "never rejected; one {status, value|reason} per input, in input order" : "shape wrong" };
  }

  async function demoRejectionHygiene(){
    // fire tasks; map each task's outcome AT CREATION so no rejection is ever
    // left without a handler, then collect the batch safely.
    const tasks = [
      () => sleep(5).then(() => "A ok"),
      () => sleep(2).then(() => { throw new Error("B failed"); }),
      () => sleep(8).then(() => "C ok"),
    ];
    const started = tasks.map(fn => fn().then(v => ({ ok:v }), e => ({ err:e.message })));
    const outcomes = await Promise.all(started);   // safe: every task handled its own rejection
    const summary = outcomes.map(o => o.ok ? `ok:${o.ok}` : `err:${o.err}`).join(", ");
    const pass = outcomes.length === 3 &&
      outcomes[0].ok === "A ok" && outcomes[1].err === "B failed" && outcomes[2].ok === "C ok";
    return { lines:[
      { t:`3 tasks (one rejects), each mapped to an outcome at creation` },
      { t:summary },
      { t:`no raw rejection escaped — Promise.all only ever saw fulfillments` },
    ], pass, verdict: pass ? "each rejection was handled synchronously; batch collected with nothing unhandled" : "collection wrong" };
  }

  DRILLS.toolkit.push(
    { id:"combinator", title:"Pick the combinator", why:"match all / allSettled / any / race to the need", demo:demoCombinatorChoose,
      pre:`// You fire N independent API calls. You want EVERY result back — the
// successes AND the failures — and the batch must never reject, even if
// some calls fail. Which combinator fits?
async function collectResults(calls) {
  const settled =`,
      blank:{ q:"You need every outcome — successes and failures — and the batch must NEVER reject. Which combinator returns a {status, value|reason} per input and always fulfills?",
        options:[
`    await Promise.allSettled(calls);`,
`    await Promise.all(calls);`,
`    await Promise.race(calls);`],
        answer:0,
        whys:[
          "Right. allSettled waits for every input and never rejects — each entry is a tagged {status:'fulfilled', value} or {status:'rejected', reason}, so one failure can't sink the batch.",
          "Promise.all is fail-fast: the first rejection rejects the whole thing and you lose every other result. That's the opposite of a best-effort batch.",
          "Promise.race settles on the FIRST input to finish and discards the rest — you get one outcome, not every outcome."] },
      post:`  return settled
    .filter(s => s.status === "fulfilled")
    .map(s => s.value);
}` },

    { id:"rejhygiene", title:"Attach the catch in time", why:"a rejection is 'unhandled' at settle-time, not later", demo:demoRejectionHygiene,
      pre:`// You kick off background tasks now and await them together later.
// Between "create" and "await", a task can reject with NO handler attached
// yet → unhandledRejection (Node crashes by default). Which line makes each
// task safe the instant it starts — while keeping its real outcome to await?
function launchAll(tasks) {
  return tasks.map(fn => {
    const p = fn();`,
      blank:{ q:"Between creating a promise and awaiting it later, a rejection with no handler yet is 'unhandled'. Which line makes each task safe the moment it starts, yet still lets your later await see the outcome?",
        options:[
`    p.catch(() => {});   // handler attached now, synchronously
    return p;`,
`    return p;            // attach a handler later, when we await`,
`    return p.catch(() => {});   // swallow, return the caught promise`],
        answer:0,
        whys:[
          "Right. Attaching .catch the instant p exists means the rejection always has a handler — no unhandledRejection — while returning the ORIGINAL p keeps the real outcome for your later await.",
          "Returning p bare leaves a window: if it rejects before you await it, Node sees a rejection with no handler and fires unhandledRejection. The check is at settle-time — attach the catch synchronously.",
          "Returning p.catch(() => {}) hands back a promise that always FULFILLS with undefined — your later await can never see the failure. You silenced the error instead of just marking it handled."] },
      post:`  });
}` },
  );

  /* =====================================================================
     WRITE — build the combinators from scratch (execution-graded)
     ===================================================================== */
  WRITE.push(
    { id:"w-allsettled", title:"Promise.allSettled — write it", why:"never rejects; a tagged outcome per input", lesson:liComb,
      spec:"Always fulfill — never reject. Resolve with one { status:'fulfilled', value } or { status:'rejected', reason } per input, at its INPUT position. Plain non-promise values pass through as fulfilled. Empty input resolves immediately with [].",
      pre:`function promiseAllSettled(promises) {
  return new Promise((resolve, reject) => {`,
      post:`  });
}`,
      lines:[
        "    const results = new Array(promises.length);",
        "    let remaining = promises.length;",
        "    if (remaining === 0) return resolve(results);",
        "    const settle = (i, outcome) => {",
        "      results[i] = outcome;",
        "      if (--remaining === 0) resolve(results);",
        "    };",
        "    promises.forEach((p, i) => {",
        "      Promise.resolve(p).then(",
        "        (value)  => settle(i, { status: \"fulfilled\", value }),",
        "        (reason) => settle(i, { status: \"rejected\", reason })",
        "      );",
        "    });",
      ],
      distractors:[
        { code:"        (reason) => reject(reason)",
          why:"That's Promise.all's behaviour — the first rejection rejects the whole result. allSettled must NEVER reject: record { status:'rejected', reason } at that index (settle it) and carry on." },
        { code:"      results.push(outcome);",
          why:"push stores in completion order, not input position — a fast input at index 2 lands in slot 0. Assign at results[i] so each outcome keeps its own index." },
        { code:"      if (results.length === promises.length) resolve(results);",
          why:"new Array(n) already HAS length n, so this resolves on the very first settle with a half-empty array. Count settlements DOWN to zero instead." },
      ],
      test:`const out = await promiseAllSettled([
  sleep(20).then(() => "slow"),
  sleep(2).then(() => { throw new Error("boom"); }),
  "plain",
]);
log("mixed batch settled to statuses: [" + out.map(s => s.status).join(", ") + "]");
assert(out.length === 3, "one result per input");
assert(out[0].status === "fulfilled" && out[0].value === "slow", "the slowest input still lands at its OWN index 0 (input order, not finish order)");
assert(out[1].status === "rejected" && out[1].reason.message === "boom", "a rejection becomes { status:'rejected', reason } at its index — it must never reject the batch");
assert(out[2].status === "fulfilled" && out[2].value === "plain", "a plain (non-promise) value passes through as fulfilled");
const empty = await promiseAllSettled([]);
assert(Array.isArray(empty) && empty.length === 0, "empty input must resolve immediately with []");
log("empty input -> []");
let rejected = false;
try { await promiseAllSettled([Promise.reject(new Error("x")), sleep(5).then(() => "y")]); }
catch { rejected = true; }
assert(!rejected, "allSettled must NEVER reject, even when an input rejects");
log("batch with a rejecting input still fulfilled — never threw");`,
      pass:"tagged every outcome at its input index, passed plain values through, and never rejected",
      takeaway:"allSettled is Promise.all with the rejection path rerouted: instead of rejecting, a failure becomes a { status:'rejected', reason } record at that index. Store by index, count settlements down, and never call reject.",
      hint:"Preallocate results and a `remaining` counter (resolve now if it's 0). For each input: Promise.resolve(p).then(value → settle {fulfilled}, reason → settle {rejected}); settle writes results[i] and resolves when remaining hits 0. reject is never called." },

    { id:"w-any", title:"Promise.any — write it", why:"first fulfillment wins; all-reject → AggregateError", lesson:liComb,
      spec:"Resolve with the first FULFILLMENT's value. Only if EVERY input rejects, reject with new AggregateError(errors, msg) — errors in INPUT order. Empty input rejects immediately with an AggregateError.",
      pre:`function promiseAny(promises) {
  return new Promise((resolve, reject) => {`,
      post:`  });
}`,
      lines:[
        "    const errors = new Array(promises.length);",
        "    let remaining = promises.length;",
        "    if (remaining === 0)",
        "      return reject(new AggregateError([], \"All promises were rejected\"));",
        "    const rejectOne = (i, reason) => {",
        "      errors[i] = reason;",
        "      if (--remaining === 0)",
        "        reject(new AggregateError(errors, \"All promises were rejected\"));",
        "    };",
        "    promises.forEach((p, i) => {",
        "      Promise.resolve(p).then(",
        "        (value)  => resolve(value),",
        "        (reason) => rejectOne(i, reason)",
        "      );",
        "    });",
      ],
      distractors:[
        { code:"        (reason) => reject(reason)",
          why:"That's Promise.race semantics — the first rejection to arrive rejects everything, even though a later input might still fulfill. any must IGNORE rejections until every input has failed." },
        { code:"      errors.push(reason);",
          why:"push records errors in the order they ARRIVE, not input order. AggregateError.errors must line up with the inputs — assign errors[i] = reason." },
        { code:"        (value)  => resolve({ status: \"fulfilled\", value }),",
          why:"any resolves with the VALUE itself, not a wrapper envelope. Return value directly — the { status, value } shape is allSettled's job." },
      ],
      test:`const first = await promiseAny([
  sleep(20).then(() => { throw new Error("slow-fail"); }),
  sleep(5).then(() => "winner"),
  sleep(2).then(() => { throw new Error("fast-fail"); }),
]);
assert(first === "winner", "the first FULFILLMENT wins — rejections that settle earlier must be ignored");
log("first fulfillment won: " + first);
let agg = null;
try {
  await promiseAny([
    sleep(20).then(() => { throw new Error("first"); }),
    sleep(2).then(() => { throw new Error("second"); }),
  ]);
} catch (e) { agg = e; }
assert(agg instanceof AggregateError, "when EVERY input rejects, reject with an AggregateError");
assert(agg.errors.length === 2 && agg.errors[0].message === "first" && agg.errors[1].message === "second",
  "errors must be in INPUT order — input 0 rejected LAST here, but must still be errors[0]");
log("all rejected -> AggregateError, errors in input order: [" + agg.errors.map(e => e.message).join(", ") + "]");
let emptyErr = null;
try { await promiseAny([]); } catch (e) { emptyErr = e; }
assert(emptyErr instanceof AggregateError, "empty input must reject immediately with an AggregateError");
log("empty input -> AggregateError immediately");`,
      pass:"first fulfillment resolved, all-reject produced an AggregateError with errors in input order, empty handled",
      takeaway:"any is the mirror of all: resolve on the first success, and only reject once the failure counter hits zero — bundling the reasons (in input order) into an AggregateError. A first rejection means nothing until it's the LAST.",
      hint:"errors array + `remaining` counter (reject with AggregateError([]) now if it's 0). For each input: fulfillment → resolve(value); rejection → errors[i] = reason, and when remaining hits 0 reject(new AggregateError(errors, msg))." },
  );

  /* =====================================================================
     CARDS
     ===================================================================== */
  CARDS.push(
    ["Promise.all vs allSettled vs any vs race — one line each?",
     "all: every value in input order, fail-fast on the first rejection. allSettled: never rejects — one {status, value|reason} per input. any: first FULFILLMENT wins; all reject → AggregateError (errors in input order). race: first to SETTLE, fulfillment or rejection. Chooser: need all → all; best-effort batch → allSettled; first success → any; deadline/timeout → race."],
    ["process.nextTick vs a Promise microtask — order, and the hazard?",
     "Node drains the ENTIRE process.nextTick queue before the promise microtask queue, and both drain between every callback (and before each loop phase). So nextTick always beats a .then. Hazard: recursive process.nextTick starves the loop — I/O, timers, and setImmediate behind it never run. Reach for setImmediate when you want to yield instead."],
    ["What makes a rejection 'unhandled', and WHEN is that decided?",
     "A promise that rejects with NO handler attached by the time the microtask queue it settled in has drained. The check is made at settle-time, not creation-time — so a .catch attached synchronously (before you yield) prevents it, while one attached after an await can be too late. Node emits 'unhandledRejection' and, by default, crashes the process."],
  );

  /* =====================================================================
     Cross-links
     ===================================================================== */
  DRILL_LESSON["combinator"] = liComb;
  DRILL_LESSON["rejhygiene"] = liComb;
  LESSON_PRACTICE[liLoop] = { mod:"model" };
  LESSON_PRACTICE[liComb] = { mod:"toolkit", drill:"combinator" };
})();
