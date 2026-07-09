/* Content pack — FOUNDATIONS (the prerequisite arc). Loads FIRST, before every
   other pack (see index.html), and PREPENDS its lessons so they open the course:

     01 concurrency is not parallelism — how one thread juggles many tasks
     02 so what is being competed for? — the CPU isn't; shared state + external
        resources are
     03 the same thread, now a server — one event loop, thousands of requests
     04 now run ten copies — horizontal scaling moves the coordination boundary

   Because these come BEFORE the hand-numbered lessons in js/content.js, this pack
   does three fix-ups after unshifting (all against the shared classic-script
   globals):
     1. renumber every lesson's `eb` to its new position (the base lessons in
        content.js are hard-numbered "lesson 01".."lesson 23"; later packs number
        themselves dynamically, so they self-correct — but only if this pack runs
        FIRST, which is why index.html loads it ahead of the others);
     2. shift content.js's hard-coded DRILL_LESSON values and LESSON_PRACTICE keys
        by the number of lessons we prepended, so every existing cross-link still
        points at the right chapter;
     3. register cross-links for the four new lessons.

   Validate with: node tools/validate-content.mjs */
"use strict";
(() => {
  const FOUNDATIONS = [
    /* =====================================================================
       01 — concurrency is not parallelism
       ===================================================================== */
    { eb:"lesson 01 · foundations", title:"Concurrency is not parallelism", html:`
    <p class="big">JavaScript is <b class="hl">concurrent</b> but not <b class="hl">parallel</b>. Concurrency is many tasks <i>in progress</i> at once; parallelism is many tasks <i>executing</i> at the same instant. One thread can do the first — it just takes turns — but never the second.</p>
    <p>Your code runs on a <b class="hl">single thread</b>: one call stack, one thing executing at a time, and a function runs to completion before anything else gets a turn. So how does a page load data, animate, and respond to clicks "at once"? It <b class="hl">interleaves</b> them — each task runs a little, hits an <code>await</code> or a callback boundary, and hands the thread to the next. Progress overlaps in time; execution never does.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one thread &middot; two tasks, taking turns</div>
      <svg class="estage" viewBox="0 0 340 152" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="16" fill="#8b90ab" font-size="8.5" text-anchor="middle">ONE THREAD &middot; time &rarr;</text>
        <rect x="20"  y="58" width="60" height="34" rx="6" fill="rgba(142,134,240,.14)" stroke="#2c3350"/>
        <rect x="80"  y="58" width="60" height="34" rx="6" fill="rgba(255,154,107,.14)" stroke="#2c3350"/>
        <rect x="140" y="58" width="60" height="34" rx="6" fill="rgba(142,134,240,.14)" stroke="#2c3350"/>
        <rect x="200" y="58" width="60" height="34" rx="6" fill="rgba(255,154,107,.14)" stroke="#2c3350"/>
        <rect x="260" y="58" width="60" height="34" rx="6" fill="rgba(142,134,240,.14)" stroke="#2c3350"/>
        <text x="50"  y="50" fill="#8e86f0" font-size="9" text-anchor="middle">A</text>
        <text x="110" y="50" fill="#ff9a6b" font-size="9" text-anchor="middle">B</text>
        <text x="170" y="50" fill="#8e86f0" font-size="9" text-anchor="middle">A</text>
        <text x="230" y="50" fill="#ff9a6b" font-size="9" text-anchor="middle">B</text>
        <text x="290" y="50" fill="#8e86f0" font-size="9" text-anchor="middle">A</text>
        <text x="50"  y="106" fill="#6a7090" font-size="7" text-anchor="middle">await</text>
        <text x="110" y="106" fill="#6a7090" font-size="7" text-anchor="middle">await</text>
        <text x="170" y="106" fill="#6a7090" font-size="7" text-anchor="middle">await</text>
        <text x="230" y="106" fill="#6a7090" font-size="7" text-anchor="middle">await</text>
        <circle r="9" cy="75" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.16;0.2;0.36;0.4;0.56;0.6;0.76;0.8;1"
            keyPoints="0;0;0.25;0.25;0.5;0.5;0.75;0.75;1;1"
            path="M 50 0 L 290 0"/>
          <animate attributeName="fill" dur="5s" repeatCount="indefinite"
            keyTimes="0;0.19;0.2;0.39;0.4;0.59;0.6;0.79;0.8;1"
            values="#8e86f0;#8e86f0;#ff9a6b;#ff9a6b;#8e86f0;#8e86f0;#ff9a6b;#ff9a6b;#8e86f0;#8e86f0"/>
        </circle>
        <text x="170" y="128" fill="#6a7090" font-size="8" text-anchor="middle">the thread is the baton &mdash; only one task holds it at a time</text>
        <text x="170" y="142" fill="#8b90ab" font-size="8" text-anchor="middle">handed off at every await, never shared</text>
      </svg>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">concurrency &middot; 1 thread</div>
          <div><span class="chip2 sync">A</span><span class="chip2 macro">B</span><span class="chip2 sync">A</span><span class="chip2 macro">B</span></div>
          <div class="dnote">tasks interleave &mdash; overlap in <b>progress</b>, one at a time in <b>execution</b>. This is JS.</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">parallelism &middot; 2 threads</div>
          <div><span class="chip2 sync">A</span><span class="chip2 sync">A</span></div>
          <div><span class="chip2 macro">B</span><span class="chip2 macro">B</span></div>
          <div class="dnote">two cores run <b>at the same instant</b> &mdash; needs real threads: Workers, or many processes.</div>
        </div>
      </div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The mental model that pays off everywhere: an <code>async</code> function is a task that can be <b class="hl">paused and resumed</b>. It runs straight through until an <code>await</code>, parks, and lets the single thread pick up whatever is ready next; later it resumes right where it left off. Nothing is interrupted mid-statement — the switch only happens at those explicit yield points.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; two tasks, one thread, interleaved at await</div>
      <pre class="code">async function task(name) {
  console.log(name, "step 1");
  await fetch("/x");            <span class="cm">// yield: park here, hand the thread back</span>
  console.log(name, "step 2"); <span class="cm">// resume later, right where we left off</span>
}

task("A");                      <span class="cm">// runs to its await, then parks</span>
task("B");                      <span class="cm">// now B runs to ITS await, then parks</span>

<span class="cm">// A step 1  ·  B step 1  ·  (both parked)  ·  A step 2  ·  B step 2</span>
<span class="cm">// interleaved — but at no instant were two lines running at once</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "single-threaded" is not the same as "one thing at a time from start to finish." Many tasks are in flight together, interleaved at every <code>await</code> — and that interleaving, on one thread, is exactly where the surprises in the rest of this course come from.</p>` },

    /* =====================================================================
       02 — what is actually being competed for?
       ===================================================================== */
    { eb:"lesson 02 · foundations", title:"So what is being competed for?", html:`
    <p class="big">If only one line runs at a time, what is there to fight over? Not the <b class="hl">CPU</b> — that is shared cooperatively and no task is ever cut off mid-statement. The contention is over two other things: <b class="hl">shared state observed across an await</b>, and <b class="hl">finite external resources</b>.</p>
    <p>Because a task holds the thread uninterrupted until it chooses to yield, plain synchronous code needs no lock — nothing can wedge in between two statements. The moment you <code>await</code>, though, you release the thread, and another task can run and change the world before you resume. Anything you read <i>before</i> the await and act on <i>after</i> it may now be stale.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">two tasks reach for one shared cell &middot; across the await gap</div>
      <svg class="estage" viewBox="0 0 340 156" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="170" y="18" fill="#57e0b0" font-size="9" text-anchor="middle">SHARED &middot; count</text>
        <rect x="146" y="24" width="48" height="38" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="170" y="49" font-size="15" text-anchor="middle" fill="#e7e9f3">0
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.61;1" values="1;1;0;0"/></text>
        <text x="170" y="49" font-size="15" text-anchor="middle" fill="#ff9a6b" opacity="0">1
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.61;1" values="0;0;1;1"/></text>
        <text x="170" y="82" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">two +1s, but count = 1
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.86;0.92;1" values="0;0;1;1"/></text>
        <line x1="150" y1="56" x2="66" y2="106" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <line x1="190" y1="56" x2="274" y2="106" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <rect x="12" y="106" width="98" height="42" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="61" y="124" fill="#8e86f0" font-size="9" text-anchor="middle">TASK A</text>
        <text x="61" y="138" fill="#8b90ab" font-size="8" text-anchor="middle">read, await, +1</text>
        <rect x="230" y="106" width="98" height="42" rx="9" fill="#11131c" stroke="#ff9a6b" stroke-width="1.5"/>
        <text x="279" y="124" fill="#ff9a6b" font-size="9" text-anchor="middle">TASK B</text>
        <text x="279" y="138" fill="#8b90ab" font-size="8" text-anchor="middle">read, +1</text>
        <circle r="6.5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.12;0.74;0.86;1" keyPoints="0;1;1;0;0" path="M 150 56 L 66 106"/></circle>
        <circle r="6.5" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.22;0.36;0.48;0.6;1" keyPoints="0;0;1;1;0;0" path="M 190 56 L 274 106"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">Task A</div><div class="lstep seq" style="--i:0">read count &rarr; 0</div>
        <div class="lanehead seq" style="--i:1">Task A</div><div class="lstep wait seq" style="--i:1">await save() &hellip; yields the thread</div>
        <div class="lanehead seq" style="--i:2">Task B</div><div class="lstep seq" style="--i:2">read count &rarr; 0 &middot; write 1</div>
        <div class="lanehead seq" style="--i:3">Task A</div><div class="lstep bad seq pop" style="--i:3">write 0 + 1 = 1 &nbsp;&#10007; B's increment lost</div>
      </div>
      <div class="dnote seq" style="--i:4">Two increments, final value <b style="color:var(--race)">1</b> — should be <b style="color:var(--ordered)">2</b>. Nobody ran in parallel; they interleaved across the <b>await</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>So the "resources" are not what a systems course might lead you to expect. There are really two kinds, and both are shared by every task in flight:</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the two things tasks actually compete for</div>
      <pre class="code"><span class="cm">// 1. SHARED IN-MEMORY STATE read+written across an await</span>
let count = 0;
async function bump() {
  const n = count;      <span class="cm">// read</span>
  await save(n);        <span class="cm">// yield — another bump() can run here</span>
  count = n + 1;        <span class="cm">// write back a now-stale n  -> lost update</span>
}

<span class="cm">// 2. A FINITE EXTERNAL RESOURCE many tasks want at once</span>
<span class="cm">//    - one row / document in a database        (don't double-spend it)</span>
<span class="cm">//    - a connection from a fixed-size pool       (only N exist)</span>
<span class="cm">//    - an API rate limit / quota                 (X calls per second)</span>
<span class="cm">//    - a file, a socket, a hardware device       (one writer at a time)</span>
<span class="cm">// The CPU is NOT on this list: it is handed off cleanly, never contested.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every primitive later in this course exists to guard one of these two — a mutex or a critical section for shared memory, a semaphore or a pool limit or a rate limiter for a finite external resource. Naming the resource is always the first step: <i>what</i> are two tasks reaching for, and <i>where</i> does the await gap let them collide? The next lessons ask that same question of a whole server.</p>` },

    /* =====================================================================
       03 — the same thread, now a server
       ===================================================================== */
    { eb:"lesson 03 · foundations", title:"The same thread, now a server", html:`
    <p class="big">A Node server is the exact same story at scale: <b class="hl">one process, one event loop</b>, handling thousands of requests by interleaving them at every <code>await</code>. It is not one request at a time — it is thousands <i>in flight</i>, each parked at some I/O, taking turns on the single thread.</p>
    <p>Every time a handler <code>await</code>s a database call, a fetch, or a disk read, it parks and the loop picks up the next ready request. That is how one thread serves huge concurrency: while request A waits on its query, requests B and C get their turn. The requests overlap in time; the code still runs one line at a time.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one event loop &middot; three requests, interleaved at their awaits</div>
      <svg class="estage" viewBox="0 0 340 158" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <circle cx="170" cy="52" r="30" fill="none" stroke="#2c3350" stroke-width="1.4" stroke-dasharray="4 5"/>
        <text x="170" y="49" fill="#8e86f0" font-size="8.5" text-anchor="middle">EVENT</text>
        <text x="170" y="60" fill="#8e86f0" font-size="8.5" text-anchor="middle">LOOP</text>
        <text x="24" y="30" fill="#57e0b0" font-size="8" text-anchor="middle">requests</text>
        <rect x="10" y="38" width="26" height="16" rx="4" fill="#11131c" stroke="#57e0b0" stroke-width="1.2"/><text x="23" y="50" fill="#57e0b0" font-size="8" text-anchor="middle">R1</text>
        <rect x="10" y="60" width="26" height="16" rx="4" fill="#11131c" stroke="#57e0b0" stroke-width="1.2"/><text x="23" y="72" fill="#57e0b0" font-size="8" text-anchor="middle">R2</text>
        <rect x="10" y="82" width="26" height="16" rx="4" fill="#11131c" stroke="#57e0b0" stroke-width="1.2"/><text x="23" y="94" fill="#57e0b0" font-size="8" text-anchor="middle">R3</text>
        <line x1="200" y1="52" x2="250" y2="52" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 4"/>
        <text x="292" y="30" fill="#8b90ab" font-size="8" text-anchor="middle">shared</text>
        <rect x="252" y="36" width="80" height="34" rx="8" fill="#11131c" stroke="#ff9a6b" stroke-width="1.4"/>
        <text x="292" y="50" fill="#ff9a6b" font-size="8.5" text-anchor="middle">DATABASE</text>
        <text x="292" y="62" fill="#6a7090" font-size="7" text-anchor="middle">pool &middot; rows</text>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.2;0.5;0.7;1" keyPoints="0;0.5;0.5;1;1"
            path="M 36 46 L 150 52 L 292 52"/></circle>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" begin="-1.6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.2;0.5;0.7;1" keyPoints="0;0.5;0.5;1;1"
            path="M 36 68 L 150 52 L 292 52"/></circle>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" begin="-3.3s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.2;0.5;0.7;1" keyPoints="0;0.5;0.5;1;1"
            path="M 36 90 L 150 52 L 292 52"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">R1</div><div class="lstep wait seq" style="--i:0">handler runs &rarr; await db.query() &hellip; parks</div>
        <div class="lanehead seq" style="--i:1">R2</div><div class="lstep wait seq" style="--i:1">its turn now &rarr; await db.query() &hellip; parks</div>
        <div class="lanehead seq" style="--i:2">R3</div><div class="lstep wait seq" style="--i:2">its turn now &rarr; await db.query() &hellip; parks</div>
        <div class="lanehead seq" style="--i:3">R1</div><div class="lstep good seq pop" style="--i:3">query returns &rarr; resume &rarr; respond</div>
      </div>
      <div class="dnote seq" style="--i:4">One thread, three requests <b>in flight at once</b>. The loop never idles while an <code>await</code> is pending — it serves whoever is ready.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This is where lesson 02's two resources come alive. Each request's <b class="hl">local variables</b> live in their own function call — private, isolated, safe: R1's <code>user</code> and R2's <code>user</code> never touch. But anything <b class="hl">shared</b> — a module-level cache or counter, and the database itself — is reached by every in-flight request, interleaved at exactly the await points above.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; per-request locals are safe; shared state is contended</div>
      <pre class="code">let inFlight = 0;                 <span class="cm">// MODULE scope: shared by every request</span>
const cache = new Map();          <span class="cm">// shared too</span>

app.get("/order/:id", async (req, res) =&gt; {
  const id = req.params.id;       <span class="cm">// LOCAL: private to THIS request — safe</span>
  inFlight++;                     <span class="cm">// shared counter — every request mutates it</span>

  <span class="cm">// read-modify-write on a shared ROW across an await = the lesson-02 race,</span>
  <span class="cm">// now between two live HTTP requests hitting the same order:</span>
  const order = await db.get(id); <span class="cm">// park — another request for id runs here</span>
  order.stock -= 1;               <span class="cm">// both saw the same stock…</span>
  await db.put(order);            <span class="cm">// …and one overwrites the other -> oversold</span>

  inFlight--;
  res.json(order);
});</pre>
    </div>
    <p><b class="hl">Why it matters:</b> a server does not remove the single-thread model — it is the single-thread model under load. "It worked when I tested it alone" and "it corrupts data under traffic" are the same code meeting real concurrency. The fix is the same too: serialize the shared read-modify-write (a lock, or a single atomic DB operation), and cap the finite resources (a pool, a rate limiter). Which raises the next question — what happens when there is more than one copy of this process?</p>` },

    /* =====================================================================
       04 — now run ten copies (horizontal scaling)
       ===================================================================== */
    { eb:"lesson 04 · foundations", title:"Now run ten copies", html:`
    <p class="big">You outgrow one process, so you scale <b class="hl">horizontally</b>: run many identical instances behind a load balancer. Throughput multiplies — and every coordination trick that lived <b class="hl">in memory</b> quietly stops working, because each instance has its own memory and cannot see the others.</p>
    <p>An in-process <code>Mutex</code>, a <code>Map</code> cache, a "run once" flag, a rate-limiter counter — all of them coordinate <i>within one instance</i>. Spin up a second instance and there are now two locks, two caches, two counters, each blind to its twin. A request that lands on instance A and one on instance B pass their <i>local</i> guards independently and collide on the one thing they truly share: the database.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">load balancer &middot; two instances, private memory, one shared store</div>
      <svg class="estage" viewBox="0 0 340 168" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="132" y="8" width="76" height="24" rx="6" fill="#11131c" stroke="#8e86f0" stroke-width="1.4"/>
        <text x="170" y="24" fill="#8e86f0" font-size="8.5" text-anchor="middle">LOAD BAL.</text>
        <line x1="152" y1="32" x2="80" y2="58" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="188" y1="32" x2="260" y2="58" stroke="#2c3350" stroke-width="1.2"/>
        <rect x="20" y="58" width="120" height="46" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.4"/>
        <text x="80" y="74" fill="#57e0b0" font-size="8.5" text-anchor="middle">INSTANCE A</text>
        <text x="80" y="88" fill="#8b90ab" font-size="7.5" text-anchor="middle">own Mutex &middot; own cache</text>
        <text x="80" y="99" fill="#6a7090" font-size="7" text-anchor="middle">lock held: A only</text>
        <rect x="200" y="58" width="120" height="46" rx="9" fill="#11131c" stroke="#ff9a6b" stroke-width="1.4"/>
        <text x="260" y="74" fill="#ff9a6b" font-size="8.5" text-anchor="middle">INSTANCE B</text>
        <text x="260" y="88" fill="#8b90ab" font-size="7.5" text-anchor="middle">own Mutex &middot; own cache</text>
        <text x="260" y="99" fill="#6a7090" font-size="7" text-anchor="middle">lock held: B only</text>
        <line x1="80" y1="104" x2="150" y2="132" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 4"/>
        <line x1="260" y1="104" x2="190" y2="132" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 4"/>
        <rect x="118" y="132" width="104" height="30" rx="8" fill="#11131c" stroke="#8e86f0" stroke-width="1.6"/>
        <text x="170" y="147" fill="#8e86f0" font-size="8.5" text-anchor="middle">SHARED STORE</text>
        <text x="170" y="158" fill="#6a7090" font-size="7" text-anchor="middle">DB / Valkey &mdash; the only common ground</text>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.3;0.5;0.75;1" keyPoints="0;0.5;0.5;1;1" path="M 80 58 L 80 104 L 168 132"/></circle>
        <circle r="6" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" begin="-0.4s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.3;0.5;0.75;1" keyPoints="0;0.5;0.5;1;1" path="M 260 58 L 260 104 L 172 132"/></circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">req &rarr; A</div><div class="lstep good seq" style="--i:0">A's Mutex free &rarr; acquire &rarr; enter</div>
        <div class="lanehead seq" style="--i:1">req &rarr; B</div><div class="lstep good seq" style="--i:1">B's Mutex free &rarr; acquire &rarr; enter</div>
        <div class="lanehead seq" style="--i:2">both</div><div class="lstep bad seq pop" style="--i:2">two "exclusive" holders &rarr; collide on the shared row</div>
      </div>
      <div class="dnote seq" style="--i:3">Each local lock did its job perfectly — and they never knew the other existed. In-memory coordination does not cross the process boundary.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The rule that ties the whole course together: <b class="hl">a coordination primitive only guards inside the boundary it lives in.</b> Scaling moves that boundary outward, and the primitive has to move with it — from the thread, to the process, to the cluster. Shared truth has to live somewhere both instances can see, which means it moves into the shared store.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the same guard at three scopes</div>
      <pre class="code"><span class="cm">// ONE process: an in-memory lock serializes tasks on this thread</span>
await mutex.runExclusive(() =&gt; { <span class="cm">/* critical section */</span> });

<span class="cm">// MANY processes: the lock must live where all of them can see it</span>
<span class="cm"> - distributed lock:   SET lock:orderId me NX PX 5000   (Valkey, one winner)</span>
<span class="cm"> - or push the invariant INTO the store, so no app-side lock is needed:</span>
UPDATE orders SET stock = stock - 1 WHERE id = ? AND stock &gt; 0;
<span class="cm">   one atomic statement — the database serializes it for every instance</span>

<span class="cm">// the other primitives move the same way:</span>
<span class="cm"> counter / rate limit -> INCR in Valkey, not a local variable</span>
<span class="cm"> "run once"           -> a unique row / lease, not a boolean flag</span>
<span class="cm"> cache               -> shared cache, or accept per-instance copies</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the through-line for everything ahead. You will build a mutex, a semaphore, a rate limiter, a "run once" — first the in-memory versions, because the ideas are clearest there and they are what a single process needs. But keep asking <i>where the boundary is</i>: on one thread a variable is enough; across a cluster the very same guarantee has to be rented from a database or a Valkey. Same concept, different scope — and knowing which scope you are in is the whole game.</p>` },
  ];

  /* ---- prepend, then repair numbering + cross-link indices ---- */
  const shift = FOUNDATIONS.length;
  LESSONS.unshift(...FOUNDATIONS);

  // 1. renumber every lesson's eb to its new 1-based position. The base lessons
  //    in content.js are hard-numbered; later packs (loaded after this one)
  //    number themselves off LESSONS.length and self-correct.
  LESSONS.forEach((l, i) => {
    l.eb = l.eb.replace(/^lesson\s+\d+/, "lesson " + String(i + 1).padStart(2, "0"));
  });

  // 2. shift content.js's hard-coded cross-links up by `shift`. At this point
  //    (first pack to load) these maps hold ONLY content.js's base entries.
  for (const k of Object.keys(DRILL_LESSON)) DRILL_LESSON[k] += shift;
  for (const [k, v] of Object.entries(LESSON_PRACTICE).sort((a, b) => b[0] - a[0])) {
    delete LESSON_PRACTICE[k];
    LESSON_PRACTICE[+k + shift] = v;
  }
  // MODULES metadata holds lesson backlinks too (model/race/tradeoffs) — same shift.
  for (const m of MODULES) if (m.conceptLesson != null) m.conceptLesson += shift;

  // 3. cross-links for the four new lessons (now at indices 0..3).
  LESSON_PRACTICE[0] = { mod: "model" };
  LESSON_PRACTICE[1] = { mod: "primitives", drill: "mutex" };
  LESSON_PRACTICE[2] = { mod: "model" };
  LESSON_PRACTICE[3] = { mod: "tradeoffs" };
})();
