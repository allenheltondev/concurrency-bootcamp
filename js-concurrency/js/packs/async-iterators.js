"use strict";
/* Content pack: async iterators & generators — the pull-based producer/consumer
   idiom. Appends two lessons, two write-it exercises, two drills, one quiz
   entry, two flashcards, and the cross-links, all sharing global scope with
   core.js + content.js (loaded before this file, app.js after). */
(() => {

  /* ===========================================================
     reference implementations (power the drill demos)
     =========================================================== */

  // Push-to-pull adapter: producers push(); a `for await` consumer pulls. The
  // consumer's loop IS the backpressure — next() is called only when it's ready.
  class Channel {
    #items = [];
    #waiters = [];
    #closed = false;
    push(v) {
      if (this.#closed) return;                                   // ignore after close
      const w = this.#waiters.shift();
      if (w) w.resolve({ value: v, done: false });                // hand straight to a parked puller
      else this.#items.push(v);                                   // else buffer for later
    }
    close() {
      this.#closed = true;
      while (this.#waiters.length)                                // wake every parked puller with done
        this.#waiters.shift().resolve({ value: undefined, done: true });
    }
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (this.#items.length) yield this.#items.shift();     // drain the buffer first...
        if (this.#closed) return;                                 // ...then honor close (tail survives)
        const d = deferred();
        this.#waiters.push(d);
        const { value, done } = await d.promise;                  // park until a push (or close) wakes us
        if (done) return;
        yield value;
      }
    }
  }

  // Merge N async iterables, yielding values as they ARRIVE (first-ready). Tag
  // each source's next() promise with its index, race, re-arm ONLY the winner.
  async function* mergeReady(iterables) {
    const its = iterables.map((it) => it[Symbol.asyncIterator]());
    const pending = new Map();
    its.forEach((it, i) => pending.set(i, it.next().then((r) => ({ i, r }))));
    while (pending.size) {
      const { i, r } = await Promise.race(pending.values());
      if (r.done) { pending.delete(i); continue; }               // source exhausted — drop it
      yield r.value;
      pending.set(i, its[i].next().then((r) => ({ i, r })));     // re-arm only the source that fired
    }
  }

  /* ===========================================================
     demos -> { lines:[{t}], pass, verdict }
     =========================================================== */
  async function demoChan() {
    const ch = new Channel();
    const got = [];
    const consumer = (async () => { for await (const v of ch) got.push(v); })();
    await sleep(4); ch.push("a");                 // deliver to a parked puller
    await sleep(4); ch.push("b"); ch.push("c");   // b to the puller, c buffered behind it
    await sleep(4); ch.push("d"); ch.close();     // last item, then close with items still queued
    await consumer;
    const pass = got.join(",") === "a,b,c,d";
    return {
      lines: [{ t: `pushed a, b, c, d then close()` }, { t: `for await drained: [${got.join(", ")}]` }],
      pass, verdict: pass ? "pull-paced delivery; the buffered tail drained before close was honored" : `got ${got.join(",")}`,
    };
  }
  async function demoMergeReady() {
    async function* src(label, delays) { for (const d of delays) { await sleep(d); yield label + d; } }
    const got = [];
    for await (const v of mergeReady([src("a", [6, 24]), src("b", [12]), src("c", [3, 9])])) got.push(v);
    const sorted = got.slice().sort().join(",");
    const pass = got.length === 5 && sorted === "a24,a6,b12,c3,c9" && got[0] === "c3";
    return {
      lines: [{ t: `3 sources, values emitted at staggered delays` }, { t: `arrival order out: [${got.join(", ")}]` }],
      pass, verdict: pass ? "first-ready merge: every value once, earliest arrival first (c3)" : `got ${got.join(",")}`,
    };
  }

  /* ===========================================================
     LESSONS
     =========================================================== */
  const li = LESSONS.length;   // first new lesson index

  LESSONS.push({ eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · async iterators`, title: "Pull, don't push", html: `
    <p class="big">An async generator is a producer you drive by <b class="hl">pulling</b>. A <code>for await</code> loop calls <code>next()</code> only when it's ready for the next item — so the consumer sets the pace, and a slow consumer can <b class="hl">never</b> be flooded. The loop itself is the backpressure.</p>
    <p>Contrast a <b class="hl">push</b> source — an emitter that calls your handler whenever data lands. It has no brake: a fast producer fires faster than you can handle, and the items stack up in an unbounded buffer until memory dies. Pull inverts the control — <code>yield</code> is a suspension point that waits for the puller.</p>
    <div class="diagram anim" style="--step:.72s">
      <div class="dlabel">pull, one at a time &middot; vs a push firehose stacking up</div>
      <svg class="estage" viewBox="0 0 340 156" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="83" y="15" fill="#57e0b0" font-size="9" text-anchor="middle">PULL &middot; for await</text>
        <line x1="20" y1="46" x2="150" y2="46" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="8" y="30" width="34" height="32" rx="7" fill="#11131c" stroke="#8e86f0" stroke-width="1.4"/>
        <text x="25" y="50" fill="#8e86f0" font-size="8" text-anchor="middle">gen</text>
        <rect x="128" y="30" width="34" height="32" rx="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.4"/>
        <text x="145" y="50" fill="#57e0b0" font-size="8" text-anchor="middle">for</text>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="4.2s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.4;0.5;0.9;1" keyPoints="0;1;1;0;0" path="M 42 46 L 128 46"/></circle>
        <text x="85" y="76" fill="#6a7090" font-size="7.5" text-anchor="middle">next() only when ready</text>
        <line x1="170" y1="20" x2="170" y2="140" stroke="#2c3350" stroke-width="1"/>
        <text x="256" y="15" fill="#ff9a6b" font-size="9" text-anchor="middle">PUSH &middot; emitter</text>
        <rect x="186" y="30" width="34" height="32" rx="7" fill="#11131c" stroke="#8e86f0" stroke-width="1.4"/>
        <text x="203" y="50" fill="#8e86f0" font-size="8" text-anchor="middle">src</text>
        <rect x="298" y="30" width="34" height="32" rx="7" fill="#11131c" stroke="#ff9a6b" stroke-width="1.4"/>
        <text x="315" y="50" fill="#ff9a6b" font-size="8" text-anchor="middle">cb</text>
        <g>
          <circle cx="240" cy="88" r="5.5" fill="#ff9a6b" stroke="#11131c" stroke-width="1.3"><animate attributeName="opacity" dur="4.2s" repeatCount="indefinite" keyTimes="0;0.1;0.85;1" values="0;1;1;1"/></circle>
          <circle cx="255" cy="88" r="5.5" fill="#ff9a6b" stroke="#11131c" stroke-width="1.3"><animate attributeName="opacity" dur="4.2s" begin="-0.5s" repeatCount="indefinite" keyTimes="0;0.1;0.85;1" values="0;1;1;1"/></circle>
          <circle cx="270" cy="88" r="5.5" fill="#ff9a6b" stroke="#11131c" stroke-width="1.3"><animate attributeName="opacity" dur="4.2s" begin="-1s" repeatCount="indefinite" keyTimes="0;0.1;0.85;1" values="0;1;1;1"/></circle>
          <circle cx="285" cy="88" r="5.5" fill="#ff9a6b" stroke="#11131c" stroke-width="1.3"><animate attributeName="opacity" dur="4.2s" begin="-1.5s" repeatCount="indefinite" keyTimes="0;0.1;0.85;1" values="0;1;1;1"/></circle>
        </g>
        <text x="256" y="110" fill="#6a7090" font-size="7.5" text-anchor="middle">fires regardless — backlog grows</text>
      </svg>
      <div class="lanes" style="margin-top:6px">
        <div class="lanehead seq" style="--i:0">pull</div><div class="lstep good seq" style="--i:0">next() &rarr; yield &rarr; await body &rarr; next() &mdash; paced by the consumer</div>
        <div class="lanehead seq" style="--i:1">push</div><div class="lstep bad seq pop" style="--i:1">emit &middot; emit &middot; emit &mdash; handler can't keep up &rarr; unbounded buffer</div>
      </div>
      <div class="dnote seq" style="--i:2">Same producer, opposite control: with pull the consumer's <code>for await</code> gates every item; with push nothing gates the source.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p><code>for await</code> is <b class="hl">sequential by default</b>: it awaits each item's body fully before pulling the next. That's exactly right when order matters or each step feeds the next — and a hidden throughput bug when the items are independent I/O you could be running N-at-a-time. The loop being sequential is a feature <i>and</i> a trap; know which one you're in.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a channel turns a push source into a pull source</div>
      <pre class="code"><span class="cm">// async generator: yield is a suspension point — it waits for the puller</span>
async function* count() {
  for (let i = 1; i &lt;= 3; i++) yield i;   <span class="cm">// resumes only on the next next()</span>
}
for await (const n of count()) use(n);    <span class="cm">// one at a time, consumer-paced</span>

<span class="cm">// bridge a push emitter to pull: buffer on push, hand off on pull</span>
class Channel {
  #items = []; #waiters = []; #closed = false;
  push(v) {                                <span class="cm">// producer side (push)</span>
    const w = this.#waiters.shift();
    if (w) w.resolve({ value: v, done: false });   <span class="cm">// a puller is parked — hand it over</span>
    else this.#items.push(v);              <span class="cm">// nobody waiting — buffer it (unbounded here!</span>
                                           <span class="cm">// cap it + block push to press back on the producer)</span>
  }
  close() { this.#closed = true; this.#waiters.forEach(w =&gt; w.resolve({ done: true })); }
  async *[Symbol.asyncIterator]() {        <span class="cm">// consumer side (pull)</span>
    while (true) {
      while (this.#items.length) yield this.#items.shift();  <span class="cm">// drain buffer first</span>
      if (this.#closed) return;            <span class="cm">// then honor close — tail already delivered</span>
      const d = deferred(); this.#waiters.push(d);
      const { value, done } = await d.promise;
      if (done) return; yield value;
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "how do you apply backpressure?" has a one-word answer in pull-land — you don't have to, the consumer already does. The channel is how you meet reality: real sources (sockets, event emitters) push, but a buffering channel with a bounded capacity hands you back the pull semantics <code>for await</code> depends on. Drain the buffer <i>before</i> honoring close, or the tail is lost.</p>` });

  LESSONS.push({ eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · async iterators`, title: "Merging async iterables", html: `
    <p class="big">You have N async sources and want a single stream that yields from whichever is <b class="hl">ready first</b>. The move: race one tagged <code>next()</code> promise per source, yield the winner's value, then re-arm <b class="hl">only</b> the source that fired.</p>
    <p>The classic bug is re-calling <code>next()</code> on <i>every</i> source after each race. The losers already have a <code>next()</code> in flight; asking again pulls a second value they'll advance past — so items get skipped or duplicated. Touch only the winner. And each source's promise must carry its own <b class="hl">index</b>, or you can't tell who won and can't re-arm the right one.</p>
    <div class="diagram anim" style="--step:.78s">
      <div class="dlabel">race N tagged next() promises &middot; re-arm the winner only</div>
      <svg class="estage" viewBox="0 0 340 152" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="8" y="20" width="70" height="24" rx="6" fill="#11131c" stroke="#8e86f0" stroke-width="1.3"/>
        <text x="43" y="36" fill="#8e86f0" font-size="8.5" text-anchor="middle">src 0 · next</text>
        <rect x="8" y="60" width="70" height="24" rx="6" fill="#11131c" stroke="#57e0b0" stroke-width="1.6"/>
        <text x="43" y="76" fill="#57e0b0" font-size="8.5" text-anchor="middle">src 1 · next</text>
        <rect x="8" y="100" width="70" height="24" rx="6" fill="#11131c" stroke="#8e86f0" stroke-width="1.3"/>
        <text x="43" y="116" fill="#8e86f0" font-size="8.5" text-anchor="middle">src 2 · next</text>
        <path d="M 78 32 Q 150 32 160 66" fill="none" stroke="#2c3350" stroke-width="1.2"/>
        <path d="M 78 72 L 152 72" fill="none" stroke="#57e0b0" stroke-width="1.6"/>
        <path d="M 78 112 Q 150 112 160 78" fill="none" stroke="#2c3350" stroke-width="1.2"/>
        <rect x="152" y="56" width="54" height="32" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="179" y="70" fill="#57e0b0" font-size="8" text-anchor="middle">race</text>
        <text x="179" y="82" fill="#8b90ab" font-size="7.5" text-anchor="middle">first ready</text>
        <line x1="206" y1="72" x2="262" y2="72" stroke="#57e0b0" stroke-width="1.6" stroke-dasharray="3 4"/>
        <rect x="262" y="56" width="66" height="32" rx="8" fill="#11131c" stroke="#ff9a6b" stroke-width="1.4"/>
        <text x="295" y="70" fill="#ff9a6b" font-size="8" text-anchor="middle">yield v</text>
        <text x="295" y="82" fill="#8b90ab" font-size="7.5" text-anchor="middle">re-arm src 1</text>
        <path d="M 295 88 Q 295 138 170 138 Q 92 138 86 90" fill="none" stroke="#ff9a6b" stroke-width="1.2" stroke-dasharray="2 4"/>
        <text x="170" y="147" fill="#6a7090" font-size="7.5" text-anchor="middle">only the winner gets a fresh next() — the others keep their in-flight one</text>
      </svg>
      <div class="lanes" style="margin-top:6px">
        <div class="lanehead seq" style="--i:0">race</div><div class="lstep good seq" style="--i:0">src 1 resolves first &rarr; yield its value</div>
        <div class="lanehead seq" style="--i:1">re-arm</div><div class="lstep seq" style="--i:1">call next() on src 1 &mdash; and <b>only</b> src 1</div>
        <div class="lanehead seq" style="--i:2">done</div><div class="lstep seq" style="--i:2">a source reports done &rarr; drop it from the race set</div>
        <div class="lanehead seq" style="--i:3">bug</div><div class="lstep bad seq pop" style="--i:3">re-arm every source &rarr; losers double-pulled &rarr; values skipped</div>
      </div>
      <div class="dnote seq" style="--i:4">Output is <b style="color:var(--ordered)">arrival order</b>, not source order: whoever is ready first goes first.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; first-ready merge</div>
      <pre class="code">async function* mergeReady(iterables) {
  const its = iterables.map(it =&gt; it[Symbol.asyncIterator]());
  const pending = new Map();                              <span class="cm">// index -&gt; tagged next() promise</span>
  its.forEach((it, i) =&gt;
    pending.set(i, it.next().then(r =&gt; ({ i, r }))));     <span class="cm">// tag each promise with its source</span>
  while (pending.size) {
    const { i, r } = await Promise.race(pending.values());  <span class="cm">// first to settle wins</span>
    if (r.done) { pending.delete(i); continue; }          <span class="cm">// drop an exhausted source</span>
    yield r.value;
    pending.set(i, its[i].next().then(r =&gt; ({ i, r })));  <span class="cm">// re-arm ONLY the winner</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is fan-in — one loop consuming many concurrent producers, the dual of the pool's fan-out. Race gives you <b class="hl">arrival</b> order. If instead you need global <i>timestamp</i> order across producers — every consumer sees events in the order they truly happened — that's a different, stronger guarantee built on a watermark, and it's its own lesson. Don't reach for a merge when the question is really about ordered merge.</p>` });

  LESSON_PRACTICE[li] = { mod: "toolkit", drill: "chan" };
  LESSON_PRACTICE[li + 1] = { mod: "toolkit", drill: "mergeready" };

  /* ===========================================================
     DRILLS (fill the blank) — correct option FIRST
     =========================================================== */
  DRILLS.toolkit.push({
    id: "chan", title: "Async channel (push → pull)", why: "the for await consumer paces the producer; drain before close", demo: demoChan,
    pre: `// A push producer feeds a pull consumer. push() hands an item to a parked
// for-await puller, else buffers it; close() ends the stream. The consumer's
// loop is the backpressure — it pulls one item at a time, when ready.
class Channel {
  #items = []; #waiters = []; #closed = false;
  push(v) {
    const w = this.#waiters.shift();
    if (w) w.resolve({ value: v, done: false });
    else this.#items.push(v);
  }
  close() {
    this.#closed = true;
    this.#waiters.forEach(w => w.resolve({ value: undefined, done: true }));
  }
  async *[Symbol.asyncIterator]() {`,
    blank: {
      q: "Items were pushed, then close() ran while some were still buffered. Which loop body delivers that buffered tail before it honors the close — instead of dropping whatever was queued?",
      options: [
`    while (true) {
      while (this.#items.length) yield this.#items.shift();
      if (this.#closed) return;
      const d = deferred(); this.#waiters.push(d);
      const { value, done } = await d.promise;
      if (done) return;
      yield value;
    }`,
`    while (true) {
      if (this.#closed) return;
      while (this.#items.length) yield this.#items.shift();
      const d = deferred(); this.#waiters.push(d);
      const { value, done } = await d.promise;
      if (done) return;
      yield value;
    }`,
`    while (true) {
      if (this.#items.length) yield this.#items.shift();
      if (this.#closed) return;
      const d = deferred(); this.#waiters.push(d);
      const { value, done } = await d.promise;
      if (done) return;
      yield value;
    }`],
      answer: 0,
      whys: [
        "Right. Drain the buffer on every pass, and only once it's empty do you check #closed. Items pushed before close all come out; the loop ends only when nothing's buffered AND the channel is closed.",
        "Checking #closed first means close() drops whatever is still buffered — the consumer never sees the tail. Drain the buffer first, honor close second.",
        "Yielding just one buffered item per pass (no re-drain loop) strands the rest: after one item it falls through to the close check or parks, leaving the buffer un-emptied. Loop the drain with `while`."],
    },
    post: `  }
}`,
  });

  DRILLS.toolkit.push({
    id: "mergeready", title: "Merge (first ready)", why: "re-arm only the source that fired, or you double-pull the losers", demo: demoMergeReady,
    pre: `// Merge N async iterables, yielding values as they arrive. Each source's
// next() promise is tagged with its index and raced; the winner's value is
// yielded. The question is what to do right after the yield.
async function* mergeReady(iterables) {
  const its = iterables.map((it) => it[Symbol.asyncIterator]());
  const pending = new Map();
  its.forEach((it, i) => pending.set(i, it.next().then((r) => ({ i, r }))));
  while (pending.size) {
    const { i, r } = await Promise.race(pending.values());
    if (r.done) { pending.delete(i); continue; }
    yield r.value;`,
    blank: {
      q: "A source just won the race and you yielded its value. Which line re-arms the race correctly — pulling that source's next value without disturbing the ones still in flight?",
      options: [
`    pending.set(i, its[i].next().then((r) => ({ i, r })));`,
`    its.forEach((it, j) => pending.set(j, it.next().then((r) => ({ j, r }))));`,
`    pending.delete(i);`],
      answer: 0,
      whys: [
        "Right. Only the winner advances: call next() on that one source and race again. The losers' in-flight next() promises are left untouched, so no value is pulled before it's yielded.",
        "Re-arming every source calls next() again on ones whose previous next() is still pending — a second concurrent pull that advances them past a value you never yielded. Items get skipped or duplicated. Re-arm ONLY the winner.",
        "Deleting the winner without re-arming abandons the rest of that source's values — you take one item from it and never ask again. Re-arm it so its stream continues."],
    },
    post: `  }
}`,
  });

  DRILL_LESSON.chan = li;
  DRILL_LESSON.mergeready = li + 1;

  /* ===========================================================
     WRITE IT
     =========================================================== */
  WRITE.push({
    id: "w-chan", title: "Async channel — write it", why: "push-to-pull adapter: hand off, buffer, drain, close", lesson: li,
    spec: "Bridge a push producer to a `for await` consumer. push() delivers to a parked puller if one waits, else buffers (and is ignored after close). close() wakes every parked puller with done. The async iterator drains buffered items, then honors close, else parks for the next push.",
    pre: `class Channel {
  #items = [];
  #waiters = [];
  #closed = false;`,
    post: `}`,
    lines: [
      "  push(v) {",
      "    if (this.#closed) return;",
      "    const w = this.#waiters.shift();",
      "    if (w) w.resolve({ value: v, done: false });",
      "    else this.#items.push(v);",
      "  }",
      "  close() {",
      "    this.#closed = true;",
      "    while (this.#waiters.length) this.#waiters.shift().resolve({ value: undefined, done: true });",
      "  }",
      "  async *[Symbol.asyncIterator]() {",
      "    while (true) {",
      "      while (this.#items.length) yield this.#items.shift();",
      "      if (this.#closed) return;",
      "      const d = deferred();",
      "      this.#waiters.push(d);",
      "      const { value, done } = await d.promise;",
      "      if (done) return;",
      "      yield value;",
      "    }",
      "  }",
    ],
    distractors: [
      { code: "    this.#items.push(v);",
        why: "Unconditional buffering: when a puller is parked the item both wakes it AND lands in the buffer, so it's delivered twice. Buffer only when nobody is waiting — `else this.#items.push(v)`." },
      { code: "      if (this.#items.length) yield this.#items.shift();",
        why: "An `if` drains just one buffered item per pass; the rest are stranded when the loop then parks or returns on close. Re-drain with `while (this.#items.length)`." },
      { code: "    while (this.#waiters.length) this.#waiters.shift().resolve({ value: undefined, done: false });",
        why: "Waking a parked puller with done:false on close hands it a phantom `undefined` value instead of ending the stream — the for await yields undefined and then hangs waiting for more. Close must resolve with done:true." },
    ],
    test: `const ch = new Channel();
const got = [];
const consumer = (async () => { for await (const v of ch) got.push(v); return "exited"; })();
await sleep(2);            // consumer parks on an empty channel
ch.push(1);
await sleep(2);
ch.push(2);
await sleep(2);
ch.close();
assert(await consumer === "exited", "for await must exit when the channel closes");
log("interleaved push then close: consumer saw [" + got.join(", ") + "] and the loop exited");
assert(got.join(",") === "1,2", "a parked puller must receive each push exactly once, in order (got [" + got.join(",") + "])");

const ch2 = new Channel();
ch2.push("x"); ch2.push("y"); ch2.push("z");   // buffered with no consumer yet
ch2.close();                                    // closed while 3 items still queued
const out = [];
for await (const v of ch2) out.push(v);
log("buffer-then-close: drained [" + out.join(", ") + "] after close()");
assert(out.join(",") === "x,y,z", "items buffered before close must ALL be drained before the loop ends (got [" + out.join(",") + "])");`,
    pass: "handoff paced the producer, exactly-once delivery held, and the buffered tail survived close",
    takeaway: "The consumer's for await is the backpressure — next() runs only when it's ready. Two rules make it correct: deliver to exactly one place (parked puller XOR buffer), and drain the buffer BEFORE honoring close so the tail is never lost.",
    hint: "push(): hand to a parked waiter, else buffer — never both. iterator: `while (true)` that first drains #items with a `while`, then returns if closed, else parks on a deferred that a push (or close) resolves with { value, done }.",
  });

  WRITE.push({
    id: "w-merge-ready", title: "Merge first-ready — write it", why: "race tagged next() promises; re-arm only the winner", lesson: li + 1,
    spec: "Write an async generator mergeReady(iterables) that yields values from N async iterables as they arrive. Tag each source's next() promise with its index, race them, yield the winner's value, re-arm ONLY the winner, drop a source when it reports done, and end when all are done.",
    pre: `async function* mergeReady(iterables) {`,
    post: `}`,
    lines: [
      "  const its = iterables.map((it) => it[Symbol.asyncIterator]());",
      "  const pending = new Map();",
      "  its.forEach((it, i) => pending.set(i, it.next().then((r) => ({ i, r }))));",
      "  while (pending.size) {",
      "    const { i, r } = await Promise.race(pending.values());",
      "    if (r.done) { pending.delete(i); continue; }",
      "    yield r.value;",
      "    pending.set(i, its[i].next().then((r) => ({ i, r })));",
      "  }",
    ],
    distractors: [
      { code: "    its.forEach((it, j) => pending.set(j, it.next().then((r) => ({ j, r }))));",
        why: "Re-arming EVERY source after each race calls next() again on sources whose previous next() is still pending — a second concurrent pull that advances them past a value you never yielded. Values get skipped. Re-arm only `i`, the winner." },
      { code: "    if (r.done) { continue; }",
        why: "Skipping the delete leaves the done source's already-resolved promise in the race set, so Promise.race keeps returning it forever — the loop spins and never terminates. Remove a finished source with pending.delete(i)." },
      { code: "    yield r;",
        why: "`r` is the whole { value, done } envelope from next(). Consumers want the payload — yield r.value." },
    ],
    test: `async function* source(label, delays) {
  for (const d of delays) { await sleep(d); yield label + d; }
}
const got = [];
for await (const v of mergeReady([source("a", [10, 30]), source("b", [20]), source("c", [5, 15])])) got.push(v);
log("merged arrivals: [" + got.join(", ") + "]");
assert(got.length === 5, "every value from every source must appear exactly once (got " + got.length + ": [" + got.join(", ") + "])");
assert(got.slice().sort().join(",") === "a10,a30,b20,c15,c5", "the merged stream must be the union of all sources, nothing skipped or duplicated (got [" + got.slice().sort().join(",") + "])");
assert(got[0] === "c5", "output is ARRIVAL order — the first value out must be the first to arrive (c5 at 5ms), not the first source (got " + got[0] + ")");
assert(got.every((v) => typeof v === "string"), "yield each source's VALUE, not the { value, done } envelope");
log("first-ready order held; all sources drained once");`,
    pass: "every value arrived exactly once, in arrival order, and finished sources were dropped cleanly",
    takeaway: "Two invariants: tag each next() with its source index so you know who won and can re-arm the RIGHT one, and re-arm ONLY the winner — the losers already have a next() in flight. Re-arm everyone and you double-pull; forget to drop a done source and you race forever.",
    hint: "Map of index → its.next().then(r => ({ i, r })). Loop while the map is non-empty: race its values, delete-and-continue on done, else yield r.value and re-arm just that one index.",
  });

  /* ===========================================================
     QUIZ (predict the output)
     =========================================================== */
  QUIZ.push({
    code: `async function* nums() {
  console.log('A');
  yield 1;
  console.log('B');
  yield 2;
}
(async () => {
  for await (const n of nums()) console.log(n);
  console.log('C');
})();
console.log('D');`,
    options: ["A D 1 B 2 C", "D A 1 B 2 C", "A 1 B 2 C D"], answer: 0,
    whys: [
      "Right. The first next() runs the generator body synchronously up to the first yield — so 'A' prints before the sync 'D'. Then for await suspends on that yielded promise; 'D' runs, and the microtask queue drains the rest: 1, resume to 'B', 2, then 'C' after the loop ends.",
      "This assumes next() defers the whole body to a microtask, but the code before the first yield runs synchronously inside that first next() call — 'A' prints before 'D', not after.",
      "for await doesn't run to completion before yielding the thread: it suspends at the first awaited item, so the synchronous 'D' prints during that first suspension — long before the loop reaches 'C'."],
  });

  /* ===========================================================
     CARDS
     =========================================================== */
  CARDS.push([
    "Push vs pull — who owns backpressure?",
    "Push (an emitter calling your handler) has no natural brake: a fast source outruns a slow consumer and the buffer grows unbounded. Pull (a `for await` over an async generator) calls next() only when the consumer is ready, so the consumer's loop IS the backpressure. Bridge a real push source to pull with a bounded buffering channel.",
  ]);
  CARDS.push([
    "`for await` is sequential — when is that the bug?",
    "It awaits each item's body fully before pulling the next: correct when order matters or steps depend on each other, a throughput killer when the items are independent I/O. If the loop body is the only work in flight, you've serialized what could run N-at-a-time — drain the iterator into a bounded pool instead.",
  ]);

})();
