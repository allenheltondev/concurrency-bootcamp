"use strict";
/* Performance & Queueing Bootcamp — content pack: capacity.
   Appends lessons 21-25 (final indices; see the LESSON PLAN in js/content.js):
     21 capacity math from first principles
     22 autoscaling lag
     23 the cost of retries
     24 caching as capacity
     25 speed of light: the irreducible floor
   Cross-links for these lessons are already registered in content.js. */
(function () {

  LESSONS.push(
  { eb:"lesson 22 · capacity", title:"Capacity math from first principles", html:`
    <p class="big">"How many instances do we need at 10&times;?" has an arithmetic answer, and it starts from one measured sentence: <b class="hl">one instance serves R rps inside the SLO</b> (the knee, from lesson 21 — or Little's law when you can't load test: λ<sub>max</sub> = concurrency &divide; latency). Everything else is multiplication and honesty about headroom.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">worked example &middot; 10&times; launch, SLO p99 &le; 100ms</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">measured</div><div class="lstep seq" style="--i:0">knee at 400 rps/instance &rarr; plan at &le;70% of knee: <b>280 rps</b> usable each</div>
        <div class="lanehead seq" style="--i:1">demand</div><div class="lstep seq" style="--i:1">today 800 rps peak &times;10 = 8,000 rps &rarr; 8000/280 &asymp; <b>29 instances</b></div>
        <div class="lanehead seq" style="--i:2">+ failure</div><div class="lstep seq" style="--i:2">survive an AZ loss (1 of 3): need the surviving 2/3 to carry it &rarr; &times;1.5 &rarr; <b>44</b></div>
        <div class="lanehead seq" style="--i:3">+ deploys</div><div class="lstep seq" style="--i:3">rolling deploy takes 10% out &rarr; a few more &rarr; <b>~48</b>, rounded up per AZ</div>
        <div class="lanehead seq" style="--i:4">the answer</div><div class="lstep good seq pop" style="--i:4">"48 instances, and here is each factor" &mdash; auditable, updatable, defensible</div>
      </div>
      <div class="qbox micro seq" style="--i:5">
        <div class="dlabel">why 70%, again, with feeling</div>
        <p style="margin:4px 0 0">The hockey stick (lesson 4): at ρ = 0.7 the tail is a small multiple of service time; at 0.9 it isn't. The headroom isn't waste — it's <b class="hl">where the p99 lives</b>, plus the burst absorber for everything the averages hide. Headroom for tail + failure + deploys stacks multiplicatively, and each factor must be NAMED, or it gets "optimized" away in the next cost review.</p>
      </div>
      <div class="dnote seq" style="--i:6">Also check the <b style="color:var(--race)">dependencies</b>: your 8,000 rps becomes the database's offered load. Capacity plans propagate down the call graph — the bottleneck at 10&times; is usually not the tier you scaled.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the plan as arithmetic</div>
      <pre class="code">const usable   = knee * 0.7;                 <span class="cm">// tail headroom</span>
const base     = Math.ceil(peak10x / usable);
const azFactor = az / (az - 1);              <span class="cm">// survive one AZ</span>
const deploys  = 1 / (1 - rolloutSlice);     <span class="cm">// capacity out during deploys</span>
<span class="ok">const fleet = Math.ceil(base * azFactor * deploys);</span>
<span class="cm">// every factor has a name — that's what makes it a plan, not a guess</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the senior-engineer answer to the course's founding question. Not "we should load test" — a number, derived from a measured knee, with named multipliers for tail, failure, and deploys. Ten minutes of arithmetic, and it's the difference between a launch plan and a launch prayer.</p>` },

  { eb:"lesson 23 · capacity", title:"Autoscaling lag: the buffer IS the queue", html:`
    <p class="big">Autoscaling is real capacity on a <b class="hl">delay</b>: metrics aggregate (tens of seconds), evaluation windows pass, instances boot and warm (minutes). Call it <b class="hl">T</b>. Any traffic step that outruns T is served by a queue, headroom, or a shedder — the autoscaler only decides how long the pain lasts, never whether it happens.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">λ steps 100 &rarr; 250 rps &middot; capacity 150 rps &middot; T = 120s</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">t = 0</div><div class="lstep seq" style="--i:0">spike lands &middot; excess (λ&minus;μ) = 100 rps starts queueing</div>
        <div class="lanehead seq" style="--i:1">t = 0&hellip;120</div><div class="lstep bad seq" style="--i:1">backlog = 100 &times; 120 = <b>12,000 requests</b> &middot; waits already tens of seconds (Little)</div>
        <div class="lanehead seq" style="--i:2">t = 120</div><div class="lstep seq" style="--i:2">capacity 300 rps arrives &rarr; drain rate 50 rps &rarr; <b>another 240s</b> to empty the queue</div>
        <div class="lanehead seq" style="--i:3">total</div><div class="lstep bad seq pop" style="--i:3">a 2-minute scaling lag bought a <b>6-minute</b> incident &mdash; the queue outlives its cause</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">designing around T</div>
        <p style="margin:4px 0 0"><b class="hl">Scale on leading signals</b> — concurrency and queue depth move instantly; CPU averages trail by a window. <b class="hl">Up fast, down slow</b> — under-reacting up costs an incident, over-reacting down causes flapping. <b class="hl">Smooth deliberately</b>: the EWMA that stops flapping adds lag of ~1/α samples — pick α knowing you're trading noise for T. And keep <b class="hl">step headroom</b>: capacity for the largest step you must absorb unaided.</p>
      </div>
      <div class="dnote seq" style="--i:5">The sizing question is never "will it scale?" — it's <b style="color:var(--ordered)">"what absorbs the first T seconds?"</b> If the answer is "a queue", size the queue's wait; if "nothing", the answer is shedding, chosen by default.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; size the damage before the incident</div>
      <pre class="code">function backlogDuringLag(lambda, mu, lagSec) {
  <span class="ok">return Math.max(0, lambda - mu) * lagSec;</span>  <span class="cm">// only the excess queues</span>
}
function drainSeconds(backlog, muNew, lambda) {
  if (muNew &lt;= lambda) return Infinity;        <span class="cm">// still under water</span>
  return backlog / (muNew - lambda);
}
<span class="cm">// run these numbers for your worst credible step, today,</span>
<span class="cm">// while it's arithmetic instead of an incident review.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we have autoscaling" ends more capacity conversations than it should. The follow-up that shows seniority is one number: <i>what's our T, and what absorbs a step during it?</i> Every elastic system has this gap; the good ones have sized it.</p>` },

  { eb:"lesson 24 · capacity", title:"The cost of retries: budget them like capacity", html:`
    <p class="big">A retry is <b class="hl">extra offered load</b>, manufactured by your own clients, delivered at the exact moment the system is least able to serve it. With failure rate f and up to r retries, expected attempts per request = <b class="hl">1 + f + f&sup2; + &hellip; + f&#691;</b>. Healthy (f &asymp; 0): free. Hard outage (f &rarr; 1): every request costs <b class="hl">r + 1 attempts</b> — your retry policy is a load multiplier with a timer on it.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">amplification &middot; and how layers compound it</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">f = .10, r = 2</div><div class="lstep seq" style="--i:0">&times;1.11 &mdash; the healthy case: retries are cheap and useful</div>
        <div class="lanehead seq" style="--i:1">f = .50, r = 2</div><div class="lstep bad seq" style="--i:1">&times;1.75 against a service already failing half its work</div>
        <div class="lanehead seq" style="--i:2">f = 1, r = 3</div><div class="lstep bad seq" style="--i:2">&times;4 at the bottom of the outage &mdash; recovery must climb out under quadruple load</div>
        <div class="lanehead seq" style="--i:3">3 layers deep</div><div class="lstep bad seq pop" style="--i:3">gateway &times; service &times; client, each retrying 3&times;: <b>4&sup3; = 64&times;</b> at the lowest tier</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">the retry budget</div>
        <p style="margin:4px 0 0">Cap retries as a <b class="hl">fraction of live first-try traffic</b> — canonically 10%. Healthy: every transient failure gets its retry. Outage: the budget exhausts and retries STOP — amplification capped at &times;1.1 by construction, not by hope. Plus the standing rules: retry only idempotent operations, never on overload signals (429 / queue-full), and <b class="hl">retry at one layer</b>, not every layer. (Backoff and jitter — the timing half — live in the distributed-systems course.)</p>
      </div>
      <div class="dnote seq" style="--i:5">The metastable connection (lesson 12): retry amplification is the pump that keeps a dead system dead. A budget is the pump's <b style="color:var(--ordered)">off switch</b>, installed in advance.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the budget</div>
      <pre class="code">class RetryBudget {
  constructor(ratio = 0.1) { this.ratio = ratio;
    this.firstTries = 0; this.retries = 0; }
  onFirstTry() { this.firstTries++; }
  <span class="ok">canRetry() { return this.retries &lt; this.firstTries * this.ratio; }</span>
  onRetry()   { this.retries++; }
}
<span class="cm">// the denominator is FIRST TRIES only — count retries into it</span>
<span class="cm">// and the budget funds its own storm.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> capacity plans that ignore retries are wrong exactly when it matters — the fleet sized for 8,000 rps meets 14,000 during its first bad day. Budget the retries, subtract them from headroom, and the number on the plan survives contact with an outage.</p>` },

  { eb:"lesson 25 · capacity", title:"Caching as capacity — and the day it isn't", html:`
    <p class="big">A cache in front of an origin doesn't make the origin faster — it makes the origin <b class="hl">smaller</b>: origin load = λ(1&minus;h). At h = 99%, a 50,000-rps edge needs a 500-rps origin. That arithmetic is the magic and the trap, because <b class="hl">h is not a constant</b> — it's a behavior, and behaviors have bad days.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the knife edge &middot; 50,000 rps edge traffic</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">h = 99%</div><div class="lstep good seq" style="--i:0">origin sees 500 rps &mdash; comfortable</div>
        <div class="lanehead seq" style="--i:1">h = 97%</div><div class="lstep bad seq" style="--i:1">origin sees 1,500 rps &mdash; a 2-point dip <b>tripled</b> the origin's world</div>
        <div class="lanehead seq" style="--i:2">what moves h</div><div class="lstep seq" style="--i:2">deploys that flush &middot; TTL herds &middot; key-space churn &middot; a crawler full of unique URLs &middot; cache node loss</div>
        <div class="lanehead seq" style="--i:3">stampede</div><div class="lstep bad seq pop" style="--i:3">one hot key expires &rarr; 1,000 concurrent misses for the SAME key hit the origin as one spike</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">the defenses, named</div>
        <p style="margin:4px 0 0"><b class="hl">Size the origin for the worst credible h</b> (with hockey-stick headroom — the drill does this math). <b class="hl">Coalesce misses</b>: one fetch per key in flight, everyone else waits on it (singleflight, <code>proxy_cache_lock</code>). <b class="hl">Soft TTLs</b>: serve stale while revalidating in the background, so expiry never becomes a synchronized miss. <b class="hl">Jitter TTLs</b> so a warm-up cohort doesn't expire as a herd.</p>
      </div>
      <div class="dnote seq" style="--i:5">Distinguish the two cache jobs: caching for <b style="color:var(--ordered)">latency</b> (nice when it works) vs caching for <b style="color:var(--race)">survival</b> (the origin CANNOT take the misses). The second is an availability dependency and deserves availability-grade engineering.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; miss coalescing</div>
      <pre class="code">const inflight = new Map();          <span class="cm">// key → promise</span>
async function get(key) {
  const hit = cache.get(key);
  if (hit) return hit;
  <span class="ok">if (inflight.has(key)) return inflight.get(key);</span>  <span class="cm">// join, don't pile</span>
  const p = fetchOrigin(key).finally(() =&gt; inflight.delete(key));
  inflight.set(key, p);
  return p;                          <span class="cm">// 1,000 misses → 1 origin fetch</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we'll put a cache in front of it" is the most common capacity plan in industry, and it works — until the one afternoon h dips and the origin meets traffic it hasn't seen since sizing day. The senior question: <b class="hl">what's our origin load at the worst hit ratio we can't rule out?</b> If the answer is "death", the cache isn't a plan; it's a fuse.</p>` },

  { eb:"lesson 26 · capacity", title:"Speed of light: the irreducible floor", html:`
    <p class="big">Under all the queueing sits a floor no optimization touches: light in fiber covers ~200km per millisecond, and a request-response costs a <b class="hl">round trip</b>. Same AZ: ~0.5ms. Cross-region: 70&ndash;150ms. No code review fixes physics — but code decides <b class="hl">how many times you pay it</b>, and that's where chatty systems die.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">same work, two shapes &middot; 20 queries at 1ms RTT</div>
      <svg class="estage" viewBox="0 0 340 128" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="16" width="60" height="26" rx="7" fill="#11131c" stroke="#ff9a6b" stroke-width="1.2"/>
        <text x="40" y="33" fill="#ff9a6b" font-size="8" text-anchor="middle">chatty</text>
        <rect x="10" y="76" width="60" height="26" rx="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.2"/>
        <text x="40" y="93" fill="#57e0b0" font-size="8" text-anchor="middle">batched</text>
        <g stroke="#ff9a6b" stroke-width="1">
          <line x1="80" y1="22" x2="120" y2="36"/><line x1="120" y1="36" x2="160" y2="22"/>
          <line x1="160" y1="22" x2="200" y2="36"/><line x1="200" y1="36" x2="240" y2="22"/>
          <line x1="240" y1="22" x2="280" y2="36"/><line x1="280" y1="36" x2="320" y2="22"/>
        </g>
        <text x="200" y="54" fill="#8b90ab" font-size="8" text-anchor="middle">…20 sequential round trips = 20ms of pure physics</text>
        <line x1="80" y1="84" x2="320" y2="96" stroke="#57e0b0" stroke-width="1.5"/>
        <line x1="320" y1="96" x2="80" y2="108" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="200" y="124" fill="#8b90ab" font-size="8" text-anchor="middle">1 batched round trip = 1ms — same queries, 20× less floor</text>
        <circle r="4" fill="#8e86f0">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            path="M 80 22 L 120 36 L 160 22 L 200 36 L 240 22 L 280 36 L 320 22"/>
        </circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">the smell</div><div class="lstep bad seq" style="--i:0">N+1 queries &middot; per-row lookups &middot; a page = 30 sequential RPCs &mdash; latency floor = RTT &times; depth of the chain</div>
        <div class="lanehead seq" style="--i:1">batch</div><div class="lstep good seq" style="--i:1">cost = fixed + n&middot;marginal &mdash; amortize the fixed part: multi-get, bulk insert, GraphQL-style fan-in</div>
        <div class="lanehead seq" style="--i:2">pipeline</div><div class="lstep good seq" style="--i:2">don't await serially what you can send concurrently &mdash; depth, not count, sets the floor</div>
        <div class="lanehead seq" style="--i:3">move it</div><div class="lstep good seq pop" style="--i:3">cache closer &middot; replicate reads to the user's region &middot; push compute to the data &mdash; shrink the RTT itself</div>
      </div>
      <div class="dnote seq" style="--i:4">Batching is a <b style="color:var(--race)">latency-throughput trade</b> (lesson 1, closing the loop): waiting to fill a batch adds delay per item. Batch with a size cap AND a time cap &mdash; whichever fires first &mdash; so the trade is bounded on both sides.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the coalescer's contract</div>
      <pre class="code">add(item, now) {
  <span class="ok">if (this.batch.length === 0)
    this.deadline = now + this.maxDelay;</span>  <span class="cm">// FIRST item arms it —</span>
  this.batch.push(item);                    <span class="cm">// adds never push it back</span>
  if (this.batch.length &gt;= this.maxSize) return this.flush();
  return null;
}
<span class="cm">// deadline-per-first-item caps every item's added latency;</span>
<span class="cm">// resetting per add is a debounce — a trickle never flushes.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> after five arcs of queues, this is the other half of every latency number: <b class="hl">total = waiting (queues, fixable by capacity and discipline) + physics (RTT &times; round trips, fixable only by shape)</b>. Engineers who can split a latency budget into those two lines — and say which one they're attacking — are doing performance work; everyone else is doing performance vibes.</p>` },
  );

})();
