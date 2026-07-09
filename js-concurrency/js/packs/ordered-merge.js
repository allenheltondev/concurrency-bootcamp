"use strict";
/* Content pack — ORDERED MERGE: ordered logging from multiple producers.
   The capstone scenario: N producers each log in their own timestamp order;
   merge them into one globally ordered stream (the watermark / k-way merge),
   plus its single-stream twin, the reorder buffer.
   Loads after js/content.js, before js/app.js — same shared global scope. */
(() => {

  /* ---------- reference implementations (power the drill demos) ---------- */
  class OrderedMerger {
    #bufs; #open; #emit;
    constructor(producerCount, emit) {
      this.#bufs = Array.from({ length: producerCount }, () => []);
      this.#open = Array(producerCount).fill(true);
      this.#emit = emit;
    }
    push(p, item) { this.#bufs[p].push(item); this.#drain(); }
    end(p)        { this.#open[p] = false;    this.#drain(); }
    #minHead() {                       // index of the smallest buffered head (tie -> lowest producer)
      let min = 0;
      for (let i = 1; i < this.#bufs.length; i++) {
        const b = this.#bufs[i], m = this.#bufs[min];
        if (b.length && (!m.length || b[0].ts < m[0].ts)) min = i;
      }
      return min;
    }
    #canEmit() {                       // the watermark rule
      return this.#bufs.some(b => b.length) && this.#bufs.every((b, p) => b.length || !this.#open[p]);
    }
    #drain() {
      while (this.#canEmit()) this.#emit(this.#bufs[this.#minHead()].shift());
    }
  }

  class Reorderer {
    #next = 0; #held = new Map(); #emit;
    constructor(emit) { this.#emit = emit; }
    push(seq, item) {
      this.#held.set(seq, item);
      while (this.#held.has(this.#next)) {
        this.#emit(this.#held.get(this.#next));
        this.#held.delete(this.#next);
        this.#next++;
      }
    }
  }

  /* ---------- demo runners ---------- */
  async function demoWatermark() {
    const out = [];
    const m = new OrderedMerger(3, (it) => out.push(it.ts + ":" + it.src));
    m.push(0, { ts: 3, src: "A" }); m.push(2, { ts: 4, src: "C" }); m.push(0, { ts: 5, src: "A" });
    const whileSilent = out.length;                  // B is silent — must be 0
    await sleep(5);
    m.push(1, { ts: 1, src: "B" });                  // B's "late" line predates everything buffered
    const afterB = out.join(" ");
    m.push(1, { ts: 6, src: "B" }); m.end(1); m.end(0); m.end(2);
    const pass = whileSilent === 0 && afterB === "1:B" && out.join(" ") === "1:B 3:A 4:C 5:A 6:B";
    return { lines: [
      { t: "A buffers ts 3,5 · C buffers ts 4 · B silent → emitted " + whileSilent + " (watermark holds)" },
      { t: "B pushes ts 1 → emitted: " + afterB + " — then B is empty again, stream stalls" },
      { t: "B pushes ts 6, all end → final: " + out.join(" ") },
    ], pass, verdict: pass
      ? "nothing crossed the watermark early — B's late ts 1 still came out first"
      : "order broke: " + out.join(" ") };
  }

  async function demoReorder() {
    const out = [];
    const r = new Reorderer((it) => out.push(it));
    r.push(2, "s2"); r.push(1, "s1");
    const held = out.length;                         // gap at 0 — must be 0
    r.push(0, "s0");
    const flushed = out.join(" ");
    r.push(4, "s4"); r.push(3, "s3");
    const pass = held === 0 && flushed === "s0 s1 s2" && out.join(" ") === "s0 s1 s2 s3 s4";
    return { lines: [
      { t: "arrivals 2, 1 → held (gap at 0), emitted " + held },
      { t: "0 arrives → flushed: " + flushed + " — one arrival, three emits" },
      { t: "4 held (gap at 3), 3 arrives → final: " + out.join(" ") },
    ], pass, verdict: pass
      ? "gaps held, contiguous prefixes flushed — 0,1,2,3,4 delivered exactly once"
      : "got " + out.join(" ") };
  }

  /* ===========================================================
     LESSONS
     =========================================================== */
  const liWatermark = LESSONS.length;
  LESSONS.push({ eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · ordered merge`, title: "Ordered merge: the watermark", html: `
    <p class="big">The interview scenario, verbatim: <b class="hl">N producers</b> each emit log lines in their own timestamp order, and you must interleave them into <b class="hl">one globally ordered stream</b>. Locally sorted inputs, globally sorted output — a k-way merge, running live.</p>
    <p>Keep a <b class="hl">FIFO buffer per producer</b>. Each buffer's head is the oldest thing that producer still owes you, and the emit rule falls out of one question: <i>could anyone still send something older?</i> You may emit only up to the <b class="hl">watermark</b> — the minimum timestamp across every <b class="hl">open</b> producer's head. Emit the smallest head, re-compare all heads, repeat.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">three producers &middot; B is silent &middot; what may cross?</div>
      <svg class="estage" viewBox="0 0 340 168" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <g font-size="9" text-anchor="middle">
          <text x="22" y="40" fill="#8e86f0">A</text>
          <text x="22" y="80" fill="#ff9a6b">B</text>
          <text x="22" y="120" fill="#8e86f0">C</text>
        </g>
        <g stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5">
          <line x1="34" y1="36" x2="196" y2="36"/>
          <line x1="34" y1="76" x2="196" y2="76"/>
          <line x1="34" y1="116" x2="196" y2="116"/>
        </g>
        <g font-size="10" text-anchor="middle">
          <rect x="120" y="26" width="28" height="20" rx="5" fill="#11131c" stroke="#3a4160"/>
          <text x="134" y="40" fill="#cdd2e6">5</text>
          <rect x="156" y="26" width="28" height="20" rx="5" fill="#11131c" stroke="#8e86f0"/>
          <text x="170" y="40" fill="#cdd2e6">3</text>
          <rect x="156" y="106" width="28" height="20" rx="5" fill="#11131c" stroke="#8e86f0"/>
          <text x="170" y="120" fill="#cdd2e6">4</text>
        </g>
        <rect x="156" y="66" width="28" height="20" rx="5" fill="none" stroke="#ff9a6b" stroke-dasharray="3 3">
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.36;0.40;0.94;1" values="1;1;0;0;1"/></rect>
        <text x="170" y="80" fill="#ff9a6b" font-size="10" text-anchor="middle">?
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.36;0.40;0.94;1" values="1;1;0;0;1"/></text>
        <line x1="206" y1="22" x2="206" y2="134" stroke="#ff9a6b" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="206" y="14" fill="#ff9a6b" font-size="8" text-anchor="middle">watermark</text>
        <text x="170" y="150" fill="#6a7090" font-size="7.5" text-anchor="middle">emit only up to the min open head &mdash; and B's head is unknown</text>
        <rect x="222" y="22" width="108" height="112" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="276" y="38" fill="#57e0b0" font-size="9" text-anchor="middle">MERGED</text>
        <text x="196" y="58" fill="#ff9a6b" font-size="10" text-anchor="middle" opacity="0">&#10007;
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.08;0.12;0.30;0.34;1" values="0;0;1;1;0;0"/></text>
        <text x="38" y="58" fill="#8b90ab" font-size="7.5" text-anchor="start" opacity="0">3 held &mdash; B may owe older
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.08;0.12;0.30;0.34;1" values="0;0;1;1;0;0"/></text>
        <g opacity="0">
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.36;0.40;0.94;1" values="0;0;1;1;0"/>
          <rect x="156" y="66" width="28" height="20" rx="5" fill="rgba(87,224,176,.15)" stroke="#57e0b0"/>
          <text x="170" y="80" fill="#57e0b0" font-size="10" text-anchor="middle">1</text>
          <animateTransform attributeName="transform" type="translate" dur="7s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.48;0.60;1" values="0 0;0 0;92 -14;92 -14"/>
        </g>
        <text x="38" y="97" fill="#ff9a6b" font-size="7.5" text-anchor="start" opacity="0">B empty again &mdash; the world stalls
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.66;0.70;0.96;1" values="0;0;1;1;0"/></text>
      </svg>
      <div class="lanes" style="margin-top:8px">
        <div class="lanehead seq" style="--i:0">merge</div><div class="lstep wait seq" style="--i:0">heads A=3, B=?, C=4 &rarr; watermark unknown &rarr; emit <b>nothing</b></div>
        <div class="lanehead seq" style="--i:1">B</div><div class="lstep seq" style="--i:1">push ts 1 &rarr; heads 3 / 1 / 4</div>
        <div class="lanehead seq" style="--i:2">merge</div><div class="lstep good seq pop" style="--i:2">emit 1 &mdash; B's late line still came out first</div>
        <div class="lanehead seq" style="--i:3">merge</div><div class="lstep bad seq" style="--i:3">B's buffer is empty again &rarr; A's 3 goes back to waiting</div>
      </div>
      <div class="dnote seq" style="--i:4">An empty buffer isn't "no vote" &mdash; it's a <b style="color:var(--race)">veto</b>. Silence caps the watermark at unknown.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>That veto is the part people get wrong: a producer with an <b class="hl">empty buffer stalls the world</b>. Not because it has data — because it <i>might</i>. Its next line could predate everything you're holding, and once you've emitted past it, global order is unrecoverable. <code>end(p)</code> is what turns silence into permission: a producer that ended and drained stops counting toward the minimum, and the watermark jumps forward — which is why <code>end</code> must re-run the same drain <code>push</code> does.</p>
    <p>Real systems refuse to stall forever, and every escape hatch is the same move — <b class="hl">replace silence with information</b>: a <b class="hl">heartbeat</b> ("alive, nothing before ts T" — a watermark bump carrying no data), <b class="hl">bounded lateness</b> (wait at most X ms, then treat the silence as a gap and accept the risk of a late, out-of-order line), or <b class="hl">declaring it dead</b> (an operator's <code>end(p)</code>).</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; buffer per producer, one drain</div>
      <pre class="code">class OrderedMerger {
  #bufs; #open; #emit;
  constructor(n, emit) {
    this.#bufs = Array.from({ length: n }, () =&gt; []);  <span class="cm">// FIFO per producer</span>
    this.#open = Array(n).fill(true);
    this.#emit = emit;
  }
  push(p, item) { this.#bufs[p].push(item); this.#drain(); }
  end(p)        { this.#open[p] = false;    this.#drain(); }  <span class="cm">// silence -&gt; permission</span>

  #drain() {
    <span class="cm">// the emit rule: every OPEN producer must have a head to compare</span>
    while (this.#bufs.some(b =&gt; b.length) &amp;&amp;
           this.#bufs.every((b, p) =&gt; b.length || !this.#open[p])) {
      let min = 0;                    <span class="cm">// smallest head; tie -&gt; lowest producer</span>
      for (let i = 1; i &lt; this.#bufs.length; i++) {
        const b = this.#bufs[i], m = this.#bufs[min];
        if (b.length &amp;&amp; (!m.length || b[0].ts &lt; m[0].ts)) min = i;
      }
      this.#emit(this.#bufs[min].shift());   <span class="cm">// emit, then re-compare ALL heads</span>
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is "ordered logging from multiple producers" — and its sharp edge is the trade. Strict ordering buys consistency and pays in <b class="hl">availability</b>: one stalled producer blocks every other, no matter how much data they're pushing. Name the trade, then name the escape hatches — that's the whole conversation.</p>` });

  const liReorder = LESSONS.length;
  LESSONS.push({ eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · ordered merge`, title: "The reorder buffer", html: `
    <p class="big">Same goal, one producer, harder arrivals: a single stream stamped with <b class="hl">sequence numbers</b> 0, 1, 2, &hellip; arrives <b class="hl">out of order</b>, each seq exactly once. Emit in seq order: hold what you can't say yet, and when a gap fills, flush the whole <b class="hl">contiguous prefix</b>.</p>
    <p>Two pieces of state do everything. <code>#next</code> — the seq you owe the consumer next — and a map of <b class="hl">held</b> items keyed by seq. On every arrival: store it, then flush <code>while</code> the map holds <code>#next</code>. Not <code>if</code> — filling one gap can release a whole run.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">arrivals: 2, 1, 0, 4, 3 &middot; emitted: 0 1 2 3 4</div>
      <div class="histtape">
        <span class="chip2 macro seq pop" style="--i:0">seq 2 &rarr; hold</span>
        <span class="chip2 macro seq pop" style="--i:1">seq 1 &rarr; hold</span>
        <span class="chip2 micro seq pop" style="--i:2">seq 0 &rarr; flush 0 1 2</span>
        <span class="chip2 macro seq pop" style="--i:3">seq 4 &rarr; hold</span>
        <span class="chip2 micro seq pop" style="--i:4">seq 3 &rarr; flush 3 4</span>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:0">#next 0</div><div class="lstep wait seq" style="--i:0">2 arrives &rarr; not 0 &rarr; held = {2}</div>
        <div class="lanehead seq" style="--i:1">#next 0</div><div class="lstep wait seq" style="--i:1">1 arrives &rarr; still gapped &rarr; held = {1, 2}</div>
        <div class="lanehead seq" style="--i:2">#next 3</div><div class="lstep good seq pop" style="--i:2">0 arrives &rarr; emit 0, then 1, then 2 &mdash; one arrival, three emits</div>
        <div class="lanehead seq" style="--i:3">#next 3</div><div class="lstep wait seq" style="--i:3">4 arrives &rarr; the stream still owes you 3 &rarr; held = {4}</div>
        <div class="lanehead seq" style="--i:4">#next 5</div><div class="lstep good seq pop" style="--i:4">3 arrives &rarr; emit 3, 4</div>
      </div>
      <div class="dnote seq" style="--i:5">The flush stops exactly at the next missing seq. <code>#next</code> is a promise to the consumer: "you have seen everything below this."</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>You've drilled this shape already: the <b class="hl">sequencer</b> is <code>#next</code> plus a map of parked resolvers, releasing <i>tasks</i> when their turn comes. A reorder buffer is the same machine parking <i>data</i>. And it's everywhere — <b class="hl">TCP</b> holds out-of-order segments and ACKs only the contiguous prefix (asking the sender to refill the gap); a <b class="hl">Kafka</b> consumer commits only up to the contiguous offset it has fully processed.</p>
    <p>The interview follow-up is policy: <b class="hl">what if the gap never fills?</b> Three answers, all trades. <b class="hl">Block forever</b> — perfect order, zero availability (the watermark stall in miniature). <b class="hl">Timeout and skip</b> — bump <code>#next</code> past the gap after X ms; bounded delay, but a late arrival is now out of order or dropped. <b class="hl">NACK / replay</b> — tell the source which seq is missing and have it resend (TCP's answer; needs a source that can replay). Pick per stream: a metrics feed can skip; a ledger cannot.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; hold the gap, flush the prefix</div>
      <pre class="code">class Reorderer {
  #next = 0;                     <span class="cm">// the seq I owe the consumer next</span>
  #held = new Map();             <span class="cm">// arrived, but not yet sayable</span>
  #emit;
  constructor(emit) { this.#emit = emit; }

  push(seq, item) {
    this.#held.set(seq, item);           <span class="cm">// hold first, even if in order</span>
    while (this.#held.has(this.#next)) { <span class="cm">// flush the contiguous prefix</span>
      this.#emit(this.#held.get(this.#next));
      this.#held.delete(this.#next);
      this.#next++;                      <span class="cm">// advance AFTER emitting</span>
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the k-way watermark and the reorder buffer are the two halves of "ordered logging": many sources with timestamps, or one source with sequence numbers. Both hold data hostage to a guarantee — and both force you to say, out loud, what happens when the guarantee meets a silent sender.</p>` });

  LESSON_PRACTICE[liWatermark] = { mod: "bank", drill: "watermark" };
  LESSON_PRACTICE[liReorder]   = { mod: "bank", drill: "reorder" };

  /* ===========================================================
     DRILLS (problem bank)
     =========================================================== */
  DRILLS.bank.push({
    id: "watermark", title: "Ordered Merge (watermark)",
    why: "merge N locally-ordered log streams into one global order — the named interview scenario",
    demo: demoWatermark,
    pre: `// N producers each log in their own timestamp order; merge into ONE
// globally ordered stream. Buffer per producer; emit only up to the
// watermark — the smallest timestamp any OPEN producer could still owe.
class OrderedMerger {
  #bufs; #open; #emit;
  constructor(n, emit) {
    this.#bufs = Array.from({ length: n }, () => []);
    this.#open = Array(n).fill(true);
    this.#emit = emit;
  }
  push(p, item) { this.#bufs[p].push(item); this.#drain(); }
  end(p)        { this.#open[p] = false;    this.#drain(); }
  #drain() {
    while (this.#canEmit())
      this.#emit(this.#bufs[this.#minHead()].shift());
  }
  #canEmit() {`,
    blank: {
      q: "Producer B's buffer is empty while A and C hold items. Which guard emits everything that's safe — and nothing that isn't?",
      options: [
`    return this.#bufs.some(b => b.length) &&
           this.#bufs.every((b, p) => b.length || !this.#open[p]);`,
`    return this.#bufs.some(b => b.length);`,
`    return this.#bufs.every(b => b.length);`],
      answer: 0,
      whys: [
        "Right. Emit only while every OPEN producer has a buffered head — the min of those heads is the watermark. A producer that ended and drained stops voting; a silent open one blocks everything, because its next line might be older than anything you're holding.",
        "This emits the min over whoever happens to have items. B is silent, not done — its next line might carry a smaller timestamp than what you just emitted, and the merged stream is out of order the moment it arrives.",
        "This never consults #open, so a producer that end()ed with an empty buffer vetoes the merge forever — every remaining item is stranded behind a producer that already told you it's finished." ] },
    post: `  }
  // #minHead(): index of the smallest buffered head (tie -> lowest producer)
}` });
  DRILL_LESSON.watermark = liWatermark;

  DRILLS.bank.push({
    id: "reorder", title: "Reorder Buffer",
    why: "one stream, sequence numbers, out-of-order arrival — flush the contiguous prefix",
    demo: demoReorder,
    pre: `// One stream stamped 0, 1, 2, ... arrives out of order, each seq once.
// Emit in seq order: hold what you can't say yet; when the gap fills,
// flush. #next is the seq the consumer is owed next.
class Reorderer {
  #next = 0; #held = new Map(); #emit;
  constructor(emit) { this.#emit = emit; }
  push(seq, item) {
    this.#held.set(seq, item);`,
    blank: {
      q: "Seqs 1 and 2 arrived early and sit in #held; seq 0 just landed. Which flush releases the whole contiguous run — not one item, and nothing past the next gap?",
      options: [
`    while (this.#held.has(this.#next)) {
      this.#emit(this.#held.get(this.#next));
      this.#held.delete(this.#next);
      this.#next++;
    }`,
`    if (this.#held.has(this.#next)) {
      this.#emit(this.#held.get(this.#next));
      this.#held.delete(this.#next);
      this.#next++;
    }`,
`    this.#emit(item);
    this.#next = seq + 1;`],
      answer: 0,
      whys: [
        "Right. Filling one gap can unblock a whole run — 0 releases the held 1 and 2 in the same push. The while re-checks after every emit and stops exactly at the next missing seq.",
        "An `if` flushes exactly one item per arrival: 0 goes out, but 1 and 2 — already held, already contiguous — stay stuck until unrelated future pushes shake them loose. The gap-filler has to keep flushing.",
        "Emitting whatever just arrived is no reorderer at all — seq 2 reaches the consumer before 0 — and jumping #next to seq + 1 silently skips every seq the stream still owes you." ] },
    post: `  }
}` });
  DRILL_LESSON.reorder = liReorder;

  /* ===========================================================
     WRITE IT
     =========================================================== */
  WRITE.push({
    id: "w-orderedmerge", title: "Ordered merge — write it",
    why: "N producers, one globally ordered stream — the watermark", lesson: liWatermark,
    spec: "Write push(p, item), end(p), and the drain. Items carry .ts; each producer's own pushes arrive in ts order. Emit in GLOBAL ts order: drain only while every open producer has a buffered head (ended-and-drained producers no longer count), always emitting the smallest head. end(p) must re-trigger the drain — p no longer gates the watermark.",
    pre: `class OrderedMerger {
  #bufs; #open; #emit;
  constructor(producerCount, emit) {
    this.#bufs = Array.from({ length: producerCount }, () => []);
    this.#open = Array(producerCount).fill(true);
    this.#emit = emit;
  }
  #minHead() {   // index of the smallest buffered head (tie -> lowest producer)
    let min = 0;
    for (let i = 1; i < this.#bufs.length; i++) {
      const b = this.#bufs[i], m = this.#bufs[min];
      if (b.length && (!m.length || b[0].ts < m[0].ts)) min = i;
    }
    return min;
  }`,
    post: `}`,
    lines: [
      "  push(p, item) {",
      "    this.#bufs[p].push(item);",
      "    this.#drain();",
      "  }",
      "  end(p) {",
      "    this.#open[p] = false;",
      "    this.#drain();",
      "  }",
      "  #drain() {",
      "    while (this.#canEmit()) {",
      "      const item = this.#bufs[this.#minHead()].shift();",
      "      this.#emit(item);",
      "    }",
      "  }",
      "  #canEmit() {",
      "    return this.#bufs.some(b => b.length) && this.#bufs.every((b, p) => b.length || !this.#open[p]);",
      "  }",
    ],
    distractors: [
      { code: "    return this.#bufs.some(b => b.length);",
        why: "This takes the min over whoever happens to have items and ignores the silent producer. Silence isn't absence — its next line might predate everything you're holding, and emitting past it breaks global order the moment it arrives." },
      { code: "  end(p) { this.#open[p] = false; }",
        why: "Marking the producer closed without re-running the drain strands everything: p was the one gating the watermark, and nobody ever re-checks. end() must trigger the exact same drain push() does — it's the event that moves the watermark." },
      { code: "    if (this.#canEmit()) {",
        why: "An `if` emits exactly one item per push or end. After each emit the heads have changed — one push can legitimately release several items — so the drain must loop, re-comparing ALL heads until the watermark blocks again." },
    ],
    test: `const out = [];
const m = new OrderedMerger(3, (item) => out.push(item.ts));
m.push(0, { ts: 3 });
m.push(0, { ts: 5 });
m.push(2, { ts: 4 });
log("A buffered [3,5], C buffered [4], B silent -> emitted: [" + out.join(", ") + "]");
assert(out.length === 0, "B is silent, not finished - its next line could carry ts 1, so nothing may cross the watermark yet (emitted " + out.join(",") + ")");
m.push(1, { ts: 1 });
assert(out.join(",") === "1", "with heads 3/1/4 only B's ts 1 may emit; then B's buffer is empty again and the watermark drops back to unknown (emitted " + out.join(",") + ")");
log("B pushed ts 1 -> emitted [1], then the stream re-stalled on B");
m.push(1, { ts: 6 });
assert(out.join(",") === "1,3,4", "one push can unblock several emits - after 3 goes out the merger must re-compare ALL heads and release 4 too (emitted " + out.join(",") + ")");
log("B pushed ts 6 -> flushed 3 and 4, in order");
m.end(2);
assert(out.join(",") === "1,3,4,5", "end(p) must re-run the drain - a finished producer stops gating the watermark, so A's 5 flushes the moment C closes (emitted " + out.join(",") + ")");
m.end(0);
m.end(1);
assert(out.join(",") === "1,3,4,5,6", "after every producer ends, everything buffered must flush in ts order (emitted " + out.join(",") + ")");
log("all producers ended -> full stream: [" + out.join(", ") + "]");
const tie = [];
const m2 = new OrderedMerger(2, (item) => tie.push(item.src));
m2.push(1, { ts: 7, src: "b" });
m2.push(0, { ts: 7, src: "a" });
m2.end(0);
m2.end(1);
assert(tie.join(",") === "a,b", "equal timestamps break ties by producer index - lowest first (got " + tie.join(",") + ")");
log("ts tie -> producer 0's line first");`,
    pass: "the watermark held while a producer was silent, one push released a multi-item flush, and end() freed the stream",
    takeaway: "The merger never trusts silence. The emit rule is min over every OPEN producer's head — and end(p) is the only thing that turns silence into permission, which is why push and end both funnel into the same drain.",
    hint: "Three pieces share one #drain(). push: buffer, then drain. end: flip #open, then drain. #drain: while #canEmit(), shift the smallest head (helper given) and emit it. #canEmit: something is buffered AND every open producer has a head." });

  WRITE.push({
    id: "w-reorder", title: "Reorder buffer — write it",
    why: "hold the gap, flush the contiguous prefix", lesson: liReorder,
    spec: "Write push(seq, item). Seqs 0, 1, 2, … arrive in arbitrary order, each exactly once; emit(item) must fire in seq order. Hold arrivals in #held, then flush every contiguous item starting at #next — filling one gap can release a whole run.",
    pre: `class Reorderer {
  #next = 0;
  #held = new Map();
  #emit;
  constructor(emit) { this.#emit = emit; }`,
    post: `}`,
    lines: [
      "  push(seq, item) {",
      "    this.#held.set(seq, item);",
      "    while (this.#held.has(this.#next)) {",
      "      this.#emit(this.#held.get(this.#next));",
      "      this.#held.delete(this.#next);",
      "      this.#next += 1;",
      "    }",
      "  }",
    ],
    distractors: [
      { code: "    this.#emit(item);",
        why: "Emitting whatever just arrived is no reorderer at all — seq 2 reaches the consumer before seq 0. Every arrival goes through the held-map-then-flush path, even the lucky in-order ones." },
      { code: "    if (this.#held.has(this.#next)) {",
        why: "An `if` releases exactly one item per arrival. When seq 0 fills the gap in front of held 1 and 2, only 0 comes out — the contiguous run behind it stays stuck until unrelated future pushes shake it loose. Flush in a loop." },
      { code: "      this.#emit(this.#held.get(++this.#next));",
        why: "++#next advances BEFORE the lookup, so you emit the slot after the one that's ready — the gap-filler itself is skipped and the consumer sees undefined. #next names the seq you still OWE: emit it first, then advance." },
    ],
    test: `const out = [];
const r = new Reorderer((item) => out.push(item));
r.push(2, "p2");
r.push(1, "p1");
log("arrivals: seq 2, seq 1 -> emitted: [" + out.join(", ") + "]");
assert(out.length === 0, "seq 0 hasn't arrived - 1 and 2 sit past the gap and must be held, not emitted (emitted " + out.join(",") + ")");
r.push(0, "p0");
assert(out.join(",") === "p0,p1,p2", "filling the gap must flush the WHOLE contiguous run - 0 releases the held 1 and 2 in the same push (emitted " + out.join(",") + ")");
log("seq 0 landed -> flushed p0, p1, p2");
r.push(3, "p3");
assert(out.join(",") === "p0,p1,p2,p3", "an in-order arrival with no gap ahead must emit immediately (emitted " + out.join(",") + ")");
r.push(5, "p5");
assert(out.length === 4, "seq 4 is still missing - 5 must wait behind the new gap (emitted " + out.join(",") + ")");
log("seq 5 held behind the gap at 4");
r.push(4, "p4");
assert(out.join(",") === "p0,p1,p2,p3,p4,p5", "every item must be emitted exactly once, in seq order (emitted " + out.join(",") + ")");
log("gap at 4 filled -> full stream in order: [" + out.join(", ") + "]");`,
    pass: "gaps held, contiguous runs flushed whole, every item delivered exactly once in seq order",
    takeaway: "#next is a promise to the consumer: 'you have seen everything below this.' The held map is everything you're not yet allowed to say. And the while loop is where policy would bolt on when a gap never fills — timeout-and-skip bumps #next; NACK asks the source to refill it.",
    hint: "Two moves per push: store the arrival in #held, then flush — while #held has #next, emit it, delete it, advance. The while does all the work; the gap is just the first missing key." });

  /* ===========================================================
     BUGHUNT
     =========================================================== */
  BUGHUNT.push({
    id: "bug_watermark", title: "Ordered merge", why: "emit only up to the watermark", lesson: liWatermark,
    scenario: "Three services stream logs into one merged feed, each in its own timestamp order. Under load, service B goes quiet for two seconds while A and C keep pushing — and the merger keeps emitting. When B's lines finally arrive, stamped inside the quiet stretch, they're older than lines already delivered: the merged stream is out of order. Which line emits past the watermark?",
    lines: [
      "class OrderedMerger {",
      "  #bufs; #open; #emit;",
      "",
      "  constructor(n, emit) {",
      "    this.#bufs = Array.from({ length: n }, () => []);",
      "    this.#open = Array(n).fill(true);",
      "    this.#emit = emit;",
      "  }",
      "",
      "  push(p, item) {",
      "    this.#bufs[p].push(item);",
      "    this.#drain();",
      "  }",
      "",
      "  end(p) {",
      "    this.#open[p] = false;",
      "    this.#drain();",
      "  }",
      "",
      "  #drain() {",
      "    while (this.#bufs.some(b => b.length > 0)) {",
      "      let min = -1;",
      "      for (let i = 0; i < this.#bufs.length; i++) {",
      "        const b = this.#bufs[i];",
      "        if (b.length && (min < 0 || b[0].ts < this.#bufs[min][0].ts))",
      "          min = i;",
      "      }",
      "      this.#emit(this.#bufs[min].shift());",
      "    }",
      "  }",
      "}",
    ],
    bug: [20],
    explain: "Line 21 drains whenever ANYTHING is buffered — it takes the min over whoever happens to have items and never asks whether every open producer has weighed in. B's silence should cap the watermark: its next line might predate every buffered item, so nothing may be emitted until B pushes or ends. Guard the loop on both facts: this.#bufs.some(b => b.length) && this.#bufs.every((b, p) => b.length || !this.#open[p])." });

  BUGHUNT.push({
    id: "bug_reorder", title: "Reorder buffer", why: "emit the seq you owe, then advance", lesson: liReorder,
    scenario: "Packets arrive in perfect order — seq 0, then 1, then 2 — yet the consumer receives undefined for every one of them, and packet 0 is never delivered at all. Which line walks the counter past the stream?",
    lines: [
      "class Reorderer {",
      "  #next = 0;",
      "  #held = new Map();",
      "  #emit;",
      "",
      "  constructor(emit) {",
      "    this.#emit = emit;",
      "  }",
      "",
      "  push(seq, item) {",
      "    this.#held.set(seq, item);",
      "    this.#flush();",
      "  }",
      "",
      "  #flush() {",
      "    while (this.#held.has(this.#next)) {",
      "      this.#next++;",
      "      this.#emit(this.#held.get(this.#next));",
      "      this.#held.delete(this.#next);",
      "    }",
      "  }",
      "}",
    ],
    bug: [16],
    explain: "Line 17 advances #next BEFORE the lookup, so every iteration reads the slot one past the item that actually became ready — push(0) emits #held.get(1), which doesn't exist yet, and seq 0 stays stranded in the map forever. #next names the seq the consumer is owed: emit #held.get(#next) first, delete it, THEN advance." });

  /* ===========================================================
     FLASHCARDS
     =========================================================== */
  CARDS.push(
    ["K-way ordered merge: when may you emit a buffered log line?",
     "Only up to the watermark — the minimum timestamp across every OPEN producer's buffered head. An empty buffer caps the watermark at 'unknown': that producer's next line might predate everything you hold, so nothing may cross until it pushes or ends."],
    ["One silent producer in an ordered merge — what does it cost, and what are the escape hatches?",
     "It stalls the entire merged stream: ordering trades availability for consistency. Escape hatches all replace silence with information — heartbeats ('alive, nothing before ts T'), bounded lateness (wait at most X, then treat silence as a gap), or declaring it dead (end it, so it stops gating the watermark)."],
    ["Reorder buffer: a gap never fills — what are your options?",
     "Three policies, all trades. Block forever: perfect order, zero availability. Timeout and skip: bump #next past the gap — bounded delay, but late data is dropped or out of order. NACK/replay: ask the source to resend (TCP's answer; Kafka sidesteps it by committing only the contiguous offset prefix). Pick per stream — metrics can skip, a ledger can't."],
  );

})();
