"use strict";
/* Performance & Queueing Bootcamp — content pack: the production map.
   Loaded after content.js and the lesson packs, before the engine (same
   shared-global model as a classic <script> tag). Registers:
     1. a "production map" sheet module — every concept in this course mapped
        to the construct that embodies it in real infrastructure, with a
        bridge line to SAY out loud in an interview or design review
     2. four flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  const mapHtml = `
    <p class="big">Every primitive you drilled has a <b class="hl">production twin</b> running in real infrastructure. When the design question comes, answer the concept — then say the bridge line. That's the move: show you know the physics, then show you know which piece of the stack is quietly enforcing it.</p>

    <div class="impl">
      <div class="dlabel">streaming histogram &rarr; Prometheus histograms &middot; HdrHistogram &middot; DDSketch</div>
      <p>Prometheus <code>histogram</code> metrics are exactly this course's primitive: bucket counters, aggregated by summing, quantiles computed at query time with <code>histogram_quantile()</code> over the summed buckets. HdrHistogram and DDSketch are the tighter-bucket versions with bounded relative error. The bridge line: <b class="hl">summaries (pre-computed quantiles) can't be aggregated across hosts — histograms can</b>; that single property decides which metric type your fleet dashboards must use.</p>
    </div>

    <div class="impl">
      <div class="dlabel">percentile-merge trap &rarr; the avg(p99) dashboard smell</div>
      <p>Grafana panels averaging per-host quantiles are the most common honest-looking lie in monitoring. The valid pipeline is: export buckets per host &rarr; <code>sum by (le)</code> &rarr; quantile of the merged population. The bridge line: <b class="hl">a percentile is a fact about a population, so the aggregation must merge populations, not statistics</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">open-loop load + omission correction &rarr; wrk2 &middot; k6 arrival-rate &middot; Vegeta</div>
      <p>wrk2's <code>--rate</code> flag, k6's <code>constant-arrival-rate</code> executor, and Vegeta's rate-based attacks all exist to fix the same flaw: thread-per-connection tools (classic wrk, JMeter defaults, ab) are closed-loop and self-throttle under stall. HdrHistogram's expected-interval correction is the after-the-fact patch. The bridge line: <b class="hl">ask any benchmark two questions — open or closed loop, and measured from intended or actual send time</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">deadline shedding &rarr; Envoy overload manager &middot; gRPC deadlines &middot; 429 + Retry-After</div>
      <p>Envoy's overload manager and admission control filters, gRPC's propagated deadlines (a server can see the caller already gave up), and HTTP 429 with <code>Retry-After</code> are the deployed forms of the deadline shedder. The bridge line: <b class="hl">under overload the cheapest thing a server can produce is a fast no — and deadline propagation is what lets every hop stop working for callers that already left</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">AIMD / gradient limits &rarr; Netflix concurrency-limits &middot; Envoy adaptive concurrency &middot; TCP</div>
      <p>Netflix's concurrency-limits library (Gradient/Vegas-style: compare short-term RTT to a long-term baseline) and Envoy's adaptive-concurrency filter are the shipped versions of the AIMD drill; TCP congestion control is their 40-year-old ancestor. The bridge line: <b class="hl">a concurrency limit self-adjusts to slowness via Little's law — a rate limit doesn't — so adaptive limiters bound concurrency, not rate</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">queue discipline &rarr; CoDel &middot; adaptive LIFO &middot; SQS/Kafka lag policies</div>
      <p>CoDel (controlled delay) drops packets when queue DELAY exceeds a target — Little's law as a kernel algorithm; Facebook documented adaptive LIFO + CoDel for request queues in their overload work. The bridge line: <b class="hl">a queue is a scheduling policy, not a buffer — and under overload the policy should maximize completions someone still wants</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">retry budgets &rarr; Envoy retry budgets &middot; Finagle RetryBudget &middot; gRPC retry throttling</div>
      <p>Envoy's <code>retry_budget</code> circuit-breaker field, Finagle's RetryBudget (deposit per request, withdraw per retry), and gRPC's retry throttling all cap retries as a fraction of live traffic. The bridge line: <b class="hl">retry policy is capacity policy — an unbudgeted retry config is a load multiplier wired to fire during outages</b>. The timing half (backoff + jitter) lives in the distributed-systems course.</p>
    </div>

    <div class="impl">
      <div class="dlabel">USE / RED &rarr; Brendan Gregg's method &middot; the four golden signals</div>
      <p>USE (utilization, saturation, errors — per resource) is Gregg's checklist; RED (rate, errors, duration — per service) is Tom Wilkie's; Google's four golden signals are RED plus saturation. The bridge line: <b class="hl">RED outside-in to confirm users hurt, USE resource-by-resource to find the queue doing it — and saturation, not utilization, is the leading indicator</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">on/off-CPU profiling &rarr; perf &middot; pprof &middot; async-profiler &middot; eBPF offcputime</div>
      <p>Flame graphs from perf/pprof/async-profiler show on-CPU cycles; Gregg's offcputime and wall-clock profilers charge blocked time to the stack that waited; distributed traces are off-CPU analysis across machines. The bridge line: <b class="hl">an idle-looking CPU profile on a slow service means the latency is off-CPU — profile the waits, not the work</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">autoscaling lag &rarr; K8s HPA stabilization &middot; target tracking &middot; warm pools</div>
      <p>Kubernetes HPA has metric scrape intervals, stabilization windows, and pod start time; AWS target tracking has cooldowns and instance boot; warm pools and over-provisioned buffers exist purely to shrink T. The bridge line: <b class="hl">every autoscaler has a reaction time T, and the design question is what absorbs the first T seconds of a step — headroom, a bounded queue, or a shedder</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">cache-as-capacity &rarr; CDN hit ratios &middot; singleflight &middot; proxy_cache_lock &middot; stale-while-revalidate</div>
      <p>Request coalescing ships as Go's singleflight, nginx's <code>proxy_cache_lock</code>, and CDN origin shielding; <code>stale-while-revalidate</code> is the soft-TTL defense against synchronized expiry. The bridge line: <b class="hl">origin capacity must be sized for the worst credible hit ratio, because h is a behavior, not a constant — and one hot key expiring is a stampede without coalescing</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">Little's law &rarr; connection-pool sizing &middot; concurrency dashboards</div>
      <p>HikariCP's pool-sizing guidance, worker-count tuning, and every "in-flight requests" gauge are Little's law applied: N = λW, and λmax = N/W is the ceiling a pool silently imposes. The bridge line: <b class="hl">when throughput plateaus at exactly poolSize ÷ latency, the pool is the bottleneck — found from a whiteboard, not a profiler</b>.</p>
    </div>

    <div class="qbox" style="margin-top:18px">
      <div class="dlabel">say this out loud</div>
      <p>Performance work isn't making code fast — it's <b class="hl">managing queues you mostly didn't create</b>. Measure at the edge with histograms, mind the tail because fan-out promotes it, keep utilization off the vertical part of the curve, bound every queue and shed what can't succeed, let limits discover capacity instead of encoding guesses, and size fleets by arithmetic from a measured knee. The tools keep changing; the queue never does.</p>
    </div>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "prodmap",
    label: "production map",
    type: "sheet",
    eyebrow: "reference · design-review bridge",
    title: "The production map",
    lead: "Every concept in this course, mapped to the construct that embodies it in real infrastructure — and the one sentence that bridges your theory answer to the system the interviewer's company actually runs.",
    html: mapHtml,
  });

  /* four more flashcards (content.js carries fourteen) */
  CARDS.push(
    ["Interviewer: 'How would you load test this before the 10× launch?' First three sentences?",
     "Open-loop arrival rates, never virtual-user loops — closed loops self-throttle and hide the cliff. Step the rate up and HOLD each step to steady state, recording p50/p99/errors from histograms measured against intended send times. Capacity is the last step inside the SLO; then I add headroom for tail, AZ loss, and deploys, and repeat against the dependency that the traffic lands on next."],
    ["A vendor benchmark claims 1M QPS. What do you ask before believing anything?",
     "At what latency percentile, and measured how? Open or closed loop? How long was the warmup and the hold? What hardware, what payload sizes, what cache state? And is 1M the knee or the wall — i.e., was there an SLO condition, or did they just report where the server stopped accepting? A throughput number without a latency condition is a wall, not a capacity."],
    ["Your SLO is 99.9% of requests under 400ms, and a request crosses 5 services. How does the budget split?",
     "It doesn't split evenly and it doesn't split by count — it splits by the latency DISTRIBUTION of each hop, and the deepest fan-out eats most of it. Sequential hops add means but tails compound; a 5-deep chain needs each hop's tail far tighter than 400ms/5. This is why edge SLOs force internal services to commit to p99.9s, not p50s — and why cutting chain depth beats optimizing any single hop."],
    ["The postmortem says 'the outage persisted after the trigger was fixed.' What almost certainly happened?",
     "Metastable failure: the queue and the retries became the load. Backlogged work plus retry amplification held ρ above 1 after the original cause cleared — the system was busy serving expired requests and their retries. The fixes are the load-behavior arc: shed by deadline, cap retries with a budget, bound the queues, and in the moment: drain or dump the backlog (that's why restarting 'fixed' it)."],
  );

})();
