"use strict";
/* Performance & Queueing Bootcamp — content pack: the tail.
   Appends lessons 4-9 (final indices; see the LESSON PLAN in js/content.js):
     4  latency is a distribution, not a number
     5  percentiles: p50 / p95 / p99, and why you can't average them
     6  tail amplification under fan-out
     7  variability is the enemy
     8  coordinated omission
     9  histograms: the honest primitive
   Cross-links for these lessons are already registered in content.js.
   Loaded after content.js, before the engine — same shared-global model as a
   classic <script> tag. */
(function () {

  LESSONS.push(
  { eb:"lesson 05 · the tail", title:"Latency is a distribution, not a number", html:`
    <p class="big">Ask "what's the latency?" and you'll get a number. There is no such number. A service's latency is a <b class="hl">distribution</b> — thousands of individual experiences per minute — and any single summary throws most of the story away. The question is <b class="hl">which part</b> of the story your summary keeps.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">two services, identical mean (20ms), different products</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">service A &middot; tight</div>
          <div class="lstep good">almost everything 15&ndash;25ms</div>
          <div class="lstep">p99 &asymp; 30ms &middot; worst case &asymp; best case</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">service B &middot; bimodal</div>
          <div class="lstep">cache hit: 5ms &times; 95% of requests</div>
          <div class="lstep bad">cache miss: 300ms &times; 5% &mdash; p99 = 300ms, 10&times; A's</div>
        </div>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:2">same mean</div><div class="lstep seq" style="--i:2">20ms both &mdash; the dashboards agree, the users don't</div>
        <div class="lanehead seq" style="--i:3">why modes</div><div class="lstep seq" style="--i:3">hit vs miss &middot; warm vs cold &middot; fast path vs GC pause vs retry &mdash; real systems are <b>mixtures</b></div>
        <div class="lanehead seq" style="--i:4">therefore</div><div class="lstep good seq pop" style="--i:4">summarize with <b>points on the distribution</b> (percentiles), never with its center of mass</div>
      </div>
      <div class="dnote seq" style="--i:5">The mean is pulled by outliers it never describes: one 10s timeout in a thousand 10ms requests moves the mean to ~20ms &mdash; a value <b style="color:var(--race)">no request experienced</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; keep the distribution, not a scalar</div>
      <pre class="code"><span class="cm">// wrong: one accumulator, infinite regret</span>
totalMs += latency; count++;        <span class="cm">// mean-only: the tail is gone</span>
<span class="cm">// right: a histogram — the whole shape, in constant memory</span>
<span class="ok">hist.record(latency);</span>
hist.percentile(50); hist.percentile(99); hist.percentile(99.9);</pre>
    </div>
    <p><b class="hl">Why it matters:</b> every decision downstream — SLOs, capacity, alerting, "is the deploy safe?" — depends on which part of the distribution you look at. The mean is the right tool for <b class="hl">cost and capacity</b> (means add); it is the wrong tool for <b class="hl">experience</b>, always. The next lesson makes "points on the distribution" precise.</p>` },

  { eb:"lesson 06 · the tail", title:"Percentiles: p50, p95, p99", html:`
    <p class="big">The <b class="hl">p99</b> is the value that 99% of requests beat: sort the samples, cut at the 99% rank. p50 is the typical experience, p95 the bad day, p99 the tail — and the tail is not noise: at scale it's a <b class="hl">steady stream of your unhappiest requests</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">1,000 sorted samples &middot; where the cuts land</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">p50</div><div class="lstep seq" style="--i:0">rank 500 &rarr; 12ms &mdash; half of everyone does better</div>
        <div class="lanehead seq" style="--i:1">p95</div><div class="lstep seq" style="--i:1">rank 950 &rarr; 80ms &mdash; 50 requests per 1,000 are past here</div>
        <div class="lanehead seq" style="--i:2">p99</div><div class="lstep bad seq" style="--i:2">rank 990 &rarr; 420ms &mdash; at 1,000 rps that's <b>10 users per second</b>, all day</div>
      </div>
      <div class="qbox macro seq" style="--i:3">
        <div class="dlabel">the two classic percentile crimes</div>
        <p style="margin:4px 0 0"><b class="hl">Averaging the mean into an SLO:</b> the mean sits wherever the tail drags it and describes nobody. <b class="hl">Averaging percentiles across hosts:</b> avg(host p99s) is a statistic of <i>nothing</i> — it weights hosts equally regardless of traffic and corresponds to no request. Percentiles come from <b class="hl">populations</b>; to combine hosts you must merge the populations (lesson 10 shows how histograms make that trivial).</p>
      </div>
      <div class="dnote seq" style="--i:4">Also name your population: per-<b style="color:var(--ordered)">request</b> p99 &ne; per-<b style="color:var(--ordered)">user</b> p99. A user session of 20 requests samples the request distribution 20 times &mdash; sessions live further into the tail than requests do.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; a percentile is a rank, nothing more</div>
      <pre class="code">function percentile(sorted, p) {
  <span class="ok">const rank = Math.ceil((p / 100) * sorted.length);</span>  <span class="cm">// count UP from 1</span>
  return sorted[rank - 1];
}
<span class="cm">// p99 of merged hosts = percentile of the MERGED samples —</span>
<span class="cm">// never a function of the per-host p99s alone.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> percentiles are the shared language of SLOs, load tests, and incident review — and the averaging trap is the single most common way senior-looking dashboards lie. When an interviewer slides "so we averaged the p99s across the fleet…" into a story, that's the test.</p>` },

  { eb:"lesson 07 · the tail", title:"Tail amplification: fan-out multiplies the p99", html:`
    <p class="big">A request that fans out to <b class="hl">n</b> backends and waits for all of them is as slow as its <b class="hl">slowest leg</b>. Each leg samples the backend's latency distribution independently — so the probability of touching the tail is <b class="hl">1 &minus; (1&minus;p)&#8319;</b>, and it grows brutally fast.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">per-leg tail probability p = 1% &middot; request hits the tail if ANY leg does</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">n = 1</div><div class="lstep seq" style="--i:0">1% of requests &mdash; the p99 behaves like a p99</div>
        <div class="lanehead seq" style="--i:1">n = 10</div><div class="lstep seq" style="--i:1">1 &minus; 0.99&sup1;&#8304; &asymp; <b>9.6%</b> &mdash; the tail is now a p90 problem</div>
        <div class="lanehead seq" style="--i:2">n = 69</div><div class="lstep bad seq" style="--i:2">&asymp; <b>50%</b> &mdash; the per-leg p99 latency is the request MEDIAN</div>
        <div class="lanehead seq" style="--i:3">n = 100</div><div class="lstep bad seq pop" style="--i:3">&asymp; <b>63%</b> &mdash; most requests wait on at least one slow shard</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">what actually helps</div>
        <p style="margin:4px 0 0"><b class="hl">Shrink n</b> (coarser shards, caching whole fan-outs). <b class="hl">Shrink p</b> — tail-cut the backends themselves; at fan-out, backend p99.9 work pays off at the request p99. <b class="hl">Stop waiting for stragglers</b>: hedged/backup requests and partial results (the distributed-systems course builds those). What never helps: improving the backend <i>median</i>.</p>
      </div>
      <div class="dnote seq" style="--i:5">This is why Google-scale systems obsess over p99.9: at n = 100, the leg's p99.9 is the request's p90. <b style="color:var(--ordered)">Fan-out promotes tails toward the median</b> — design for the percentile your fan-out will promote.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the amplifier</div>
      <pre class="code">function pTouchesTail(pSlow, n) {
  <span class="ok">return 1 - Math.pow(1 - pSlow, n);</span>  <span class="cm">// fast only if EVERY leg is fast</span>
}
<span class="cm">// assumes independent legs — correlated slowness (shared host,</span>
<span class="cm">// shared GC, hot key) makes reality WORSE than this, never better.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> fan-out is how modern services are built — one page, dozens of RPCs. The math says the tail is not an edge case there; it's the <b class="hl">expected case</b>. When someone proposes "just parallelize across 50 shards," the senior question is: what happens to our p50 when their p99 becomes our median?</p>` },

  { eb:"lesson 08 · the tail", title:"Variability is the enemy", html:`
    <p class="big">Why do queues form at all when λ &lt; μ? <b class="hl">Variability.</b> If requests arrived perfectly spaced and took identical time, a server could run at 99% with zero waiting. Real arrivals <b class="hl">burst</b> and real service times <b class="hl">vary</b> — and the queue exists to absorb exactly that. More variability, more queue, at the same utilization.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">same ρ = 0.8, three worlds &middot; Wq = queue wait</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">D/D/1</div><div class="lstep good seq" style="--i:0">clockwork arrivals, fixed service &rarr; Wq = <b>0</b> &mdash; no variability, no queue</div>
        <div class="lanehead seq" style="--i:1">M/D/1</div><div class="lstep seq" style="--i:1">random arrivals, fixed service &rarr; Wq = <b>2&times;S</b> &mdash; half of M/M/1's wait, exactly</div>
        <div class="lanehead seq" style="--i:2">M/M/1</div><div class="lstep bad seq" style="--i:2">random arrivals, variable service &rarr; Wq = <b>4&times;S</b> &mdash; both dice rolling</div>
      </div>
      <div class="qbox micro seq" style="--i:3">
        <div class="dlabel">the shape of the law (Kingman's approximation — stated as one)</div>
        <p style="margin:4px 0 0">Wq &asymp; <b class="hl">(C&sup2;&#8336; + C&sup2;&#8347;)/2</b> &middot; ρ/(1&minus;ρ) &middot; S — where C&sup2; are the squared coefficients of variation of arrivals and service. Utilization sets the <b class="hl">pole</b>; variability sets the <b class="hl">multiplier</b>. (For M/M/1 both C&sup2; = 1 and it's exact.)</p>
      </div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:4">cut C&sup2;&#8336;</div><div class="lstep seq" style="--i:4">smooth arrivals: pace clients, spread crons, jitter the thundering herds</div>
        <div class="lanehead seq" style="--i:5">cut C&sup2;&#8347;</div><div class="lstep seq" style="--i:5">uniform service: split the 10s report query out of the 10ms lane; cap request cost</div>
      </div>
      <div class="dnote seq" style="--i:6">The 4am cron that fires 10k requests in one second and the one endpoint that's 100&times; the others &mdash; <b style="color:var(--race)">those are capacity problems</b>, even though the daily average looks fine.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; separate the lanes</div>
      <pre class="code"><span class="cm">// one queue mixing 10ms lookups with 10s exports:</span>
<span class="cm">// Cs² explodes → everyone waits behind the whale</span>
<span class="ok">pool.fast  = workers(8);   // bounded, uniform work</span>
<span class="ok">pool.heavy = workers(2);   // whales queue with whales</span>
<span class="cm">// same total capacity, a fraction of the tail — bulkheading</span>
<span class="cm">// as VARIANCE control, not just fault isolation</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the mechanism under the hockey stick — utilization only hurts because variability needs headroom to absorb. It hands you a whole class of fixes that don't buy hardware: smooth the arrivals, split the whales, cap the cost. Same servers, same ρ, half the wait.</p>` },

  { eb:"lesson 09 · the tail", title:"Coordinated omission: the benchmark's blind spot", html:`
    <p class="big">A load generator that sends a request, <b class="hl">waits for the response</b>, then sends the next one has a fatal courtesy: when the server stalls, the generator <b class="hl">stops sampling</b>. The samples it fails to take are precisely the worst ones. Gil Tene named it <b class="hl">coordinated omission</b> — your measurement coordinates with the system's bad moments.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">intended: one send / 100ms &middot; the server freezes for 1s</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">plan</div><div class="lstep seq" style="--i:0">t=0, 100, 200, 300 &hellip; 1000 &mdash; eleven sends scheduled</div>
        <div class="lanehead seq" style="--i:1">reality</div><div class="lstep bad seq" style="--i:1">t=0 send &rarr; stall &rarr; ONE 1,000ms sample &middot; t=100&hellip;900's sends <b>never left</b></div>
        <div class="lanehead seq" style="--i:2">users</div><div class="lstep bad seq" style="--i:2">kept arriving on the world's clock: they'd have waited 900, 800, &hellip; 100ms</div>
        <div class="lanehead seq" style="--i:3">histogram</div><div class="lstep seq" style="--i:3">records 1 bad sample instead of ~10 &rarr; p99.9 reads ~100&times; too good</div>
        <div class="lanehead seq" style="--i:4">correction</div><div class="lstep good seq pop" style="--i:4">backfill v&minus;100, v&minus;200, &hellip; down to the interval &mdash; the ramp the missing sends would have felt</div>
      </div>
      <div class="dnote seq" style="--i:5">Same disease in production monitoring: a probe that waits for the previous check before starting the next <b style="color:var(--race)">under-reports every incident</b> it was built to catch.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the HdrHistogram-style backfill</div>
      <pre class="code">function correctOmission(samples, intervalMs) {
  const out = [];
  for (const v of samples) {
    out.push(v);
    <span class="ok">for (let m = v - intervalMs; m >= intervalMs; m -= intervalMs)</span>
      out.push(m);              <span class="cm">// each later send waits a bit less</span>
  }
  return out;
}
<span class="cm">// better still: don't omit — send on schedule (open loop) and</span>
<span class="cm">// measure from the INTENDED send time. correction is the patch;</span>
<span class="cm">// open-loop generation is the cure.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> most benchmark numbers in the wild — including vendor ones — carry this flaw, and it always flatters the system under test. Knowing to ask "open or closed loop? measured from intended or actual send?" instantly separates people who have measured systems from people who have run scripts. The full open-vs-closed story is the next arc's opener.</p>` },

  { eb:"lesson 10 · the tail", title:"Histograms: the honest primitive", html:`
    <p class="big">You can't keep every latency sample, and you can't summarize with a mean. The working answer everywhere — Prometheus, HdrHistogram, DDSketch — is the <b class="hl">histogram</b>: counters per latency bucket. Constant memory, any percentile on demand, and — the killer feature — <b class="hl">mergeable</b>: bucket counts add across hosts and across time.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">record = find bucket, increment &middot; percentile = walk to the rank</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">buckets</div><div class="lstep seq" style="--i:0">&le;10 &middot; &le;20 &middot; &le;50 &middot; &le;100 &middot; &le;200 &middot; overflow &mdash; log-spaced: constant <b>relative</b> error</div>
        <div class="lanehead seq" style="--i:1">record 8ms</div><div class="lstep seq" style="--i:1">counts[&le;10]++ &mdash; one integer add, no allocation, no sort</div>
        <div class="lanehead seq" style="--i:2">p99 of 1,000</div><div class="lstep good seq" style="--i:2">rank 990 &rarr; walk cumulative counts &rarr; report that bucket's <b>upper bound</b></div>
        <div class="lanehead seq" style="--i:3">fleet view</div><div class="lstep good seq pop" style="--i:3">sum counts bucket-wise across 40 hosts &rarr; one true fleet histogram &rarr; any percentile</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">the two honesty rules</div>
        <p style="margin:4px 0 0"><b class="hl">Report the upper bound.</b> Within a bucket you know nothing finer — the upper edge may over-report by a bucket width but can never hide an SLO breach; the lower edge under-reports the tail by design. <b class="hl">Bounds must cover reality:</b> a top bucket of "&le;1s, overflow" makes every 30s catastrophe read as "&gt;1s". Buckets are a measurement decision, not a default.</p>
      </div>
      <div class="dnote seq" style="--i:5">This is why percentile-merging is solvable: percentiles don't merge, but <b style="color:var(--ordered)">populations do</b> — and a histogram IS the population, compressed.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; record and query</div>
      <pre class="code">record(v) {
  let i = 0;
  while (i &lt; this.bounds.length &amp;&amp; v &gt; this.bounds[i]) i++;
  this.counts[i]++; this.total++;
}
percentile(p) {
  <span class="ok">const rank = Math.ceil((p / 100) * this.total);</span>
  let cum = 0;
  for (let i = 0; i &lt; this.counts.length; i++) {
    cum += this.counts[i];
    if (cum &gt;= rank)
      <span class="ok">return i &lt; this.bounds.length ? this.bounds[i] : Infinity;</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the histogram is where the tail arc becomes practice — it's the data structure that makes distributions cheap enough to keep, honest enough to alert on, and mergeable enough to reason about fleets. Every latency claim you make from here on should be able to answer: <i>which histogram, which buckets, whose population?</i></p>` },
  );

})();
