"use strict";
/* Performance & Queueing Bootcamp — content pack: measurement.
   Appends lessons 16-20 (final indices; see the LESSON PLAN in js/content.js):
     16 benchmarking lies
     17 measuring the right thing
     18 USE and RED
     19 profiling intuition: on-CPU vs off-CPU
     20 throughput-latency curves: load testing that tells the truth
   Cross-links for these lessons are already registered in content.js. */
(function () {

  LESSONS.push(
  { eb:"lesson 17 · measurement", title:"Benchmarking lies", html:`
    <p class="big">Microbenchmarks answer with confident numbers that are wrong in four standard ways. None of them are exotic — every one is the <b class="hl">default behavior</b> of a loop around a timer. Knowing them turns "I benchmarked it, it's 3&times; faster" from a conclusion into a claim requiring a checklist.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the same function, four wrong numbers</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">cold start</div><div class="lstep bad seq" style="--i:0">first 10k iterations include interpretation + JIT tiers + cold caches &mdash; timing them charges setup to the steady state</div>
        <div class="lanehead seq" style="--i:1">dead code</div><div class="lstep bad seq" style="--i:1">the result is never used &rarr; the optimizer deletes the work &rarr; "2 nanoseconds!" measures an empty loop</div>
        <div class="lanehead seq" style="--i:2">one sample</div><div class="lstep bad seq" style="--i:2">a single run can't see variance &mdash; GC, thermal throttling, a background tab &mdash; and a mean-only report hides what it did see</div>
        <div class="lanehead seq" style="--i:3">wrong world</div><div class="lstep bad seq" style="--i:3">hot-in-cache, single-threaded, no contention &mdash; production shares its caches, cores, and locks with everything else</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">the honest harness, in one breath</div>
        <p style="margin:4px 0 0"><b class="hl">Warm up</b> (run until times stabilize, THEN start the clock) &middot; <b class="hl">consume the result</b> (accumulate it into a sink the optimizer can't ignore) &middot; <b class="hl">many samples, report the distribution</b> (median + spread, never a lone mean) &middot; <b class="hl">state the environment</b> (isolation, input sizes, cache state). Tools like JMH and Criterion exist because every one of these is easy to get wrong by hand.</p>
      </div>
      <div class="dnote seq" style="--i:5">The tell of a lying benchmark: the per-op cost <b style="color:var(--race)">changes with the iteration count</b>. A true steady-state cost doesn't care how long you watch it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the shape of a defensible measurement</div>
      <pre class="code"><span class="cm">// warm up until stable — DON'T time this</span>
while (!stable(samples)) samples.push(timeOnce(fn));
<span class="cm">// measure: many samples, result consumed</span>
let sink = 0;
for (let i = 0; i &lt; N; i++) {
  const t0 = now();
  <span class="ok">sink += fn(inputs[i]);</span>          <span class="cm">// the optimizer must do the work</span>
  timings.push(now() - t0);
}
report(median(timings), p95(timings), sink);  <span class="cm">// distribution, not a mean</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> teams reroute roadmaps around benchmark numbers. The senior move isn't running more benchmarks — it's interrogating the harness: <i>warmed up? result used? how many samples? what's the spread?</i> Four questions, thirty seconds, and most miraculous speedups evaporate.</p>` },

  { eb:"lesson 18 · measurement", title:"Measuring the right thing", html:`
    <p class="big">A request's life has segments: client &rarr; network &rarr; load balancer &rarr; <b class="hl">accept queue</b> &rarr; handler &rarr; downstream calls &rarr; back. "Latency" means a different number depending on <b class="hl">where you start the stopwatch</b> — and the most popular place to put it is exactly wrong.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">one 900ms request, decomposed &middot; where the time hid</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">client sees</div><div class="lstep bad seq" style="--i:0">900ms &mdash; the number that IS the experience</div>
        <div class="lanehead seq" style="--i:1">queue wait</div><div class="lstep bad seq" style="--i:1">750ms in the LB + accept queue + thread pool &mdash; <b>before any app code ran</b></div>
        <div class="lanehead seq" style="--i:2">handler timer</div><div class="lstep seq" style="--i:2">150ms &mdash; what the service dashboard proudly reports</div>
        <div class="lanehead seq" style="--i:3">the gap</div><div class="lstep seq" style="--i:3">6&times; between "our latency" and the user's &mdash; and it's <b>load-dependent</b>: the gap IS the queue</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">why this bites during incidents specifically</div>
        <p style="margin:4px 0 0">Queue wait grows with load; service time mostly doesn't. So the handler-side dashboard stays flat while users drown — the metric is blind to <b class="hl">exactly the component that explodes</b>. Utilization has the same trap: averaged over a minute it hides one-second bursts pinned at 100%.</p>
      </div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:5">the rule</div><div class="lstep good seq pop" style="--i:5"><b>SLO at the edge</b> (what users see, retries included) &middot; <b>decomposed timers inside</b> (queue wait vs service time per hop) &mdash; outer for truth, inner for diagnosis</div>
      </div>
      <div class="dnote seq" style="--i:6">The queue-wait/service split tells you the fix: high <b style="color:var(--ordered)">service</b> time &rarr; optimize the code; high <b style="color:var(--race)">wait</b> &rarr; capacity, concurrency, shedding. Optimizing code to fix a wait problem is the classic wasted quarter.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; stamp arrival, split the timer</div>
      <pre class="code"><span class="cm">// stamp when the request ARRIVES at the box, not the handler:</span>
onAccept(req)  { req.arrivedAt = now(); }
onStart(req)   { <span class="ok">queueWait.record(now() - req.arrivedAt);</span> }
onFinish(req)  { <span class="ok">serviceTime.record(now() - req.startedAt);</span>
                 latency.record(now() - req.arrivedAt); }
<span class="cm">// three histograms. the ratio waitTime/serviceTime is your</span>
<span class="cm">// live utilization alarm — it blows up before CPU does.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> half of all "we optimized and nothing improved" stories are stopwatch placement. Measure at the edge for the SLO, decompose inward for the diagnosis, and treat any latency metric that can't say <i>which segment</i> as a rumor.</p>` },

  { eb:"lesson 19 · measurement", title:"USE and RED: the two checklists", html:`
    <p class="big">Under pressure, ad-hoc dashboard spelunking finds what it expects. Two checklists replace it. <b class="hl">RED</b> — per <b class="hl">service</b>: Rate, Errors, Duration (as a distribution). <b class="hl">USE</b> — per <b class="hl">resource</b>: Utilization, Saturation, Errors. RED tells you <b class="hl">whether users hurt</b>; USE tells you <b class="hl">which resource is doing it</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">"the API is slow" &middot; the drill, in order</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">RED, edge</div><div class="lstep seq" style="--i:0">rate normal &middot; errors flat &middot; p99 up 8&times; &rarr; real, latency-shaped, not error-shaped</div>
        <div class="lanehead seq" style="--i:1">RED, hops</div><div class="lstep seq" style="--i:1">gateway slow &rarr; orders slow &rarr; db calls slow &mdash; follow duration downstream to the deepest slow hop</div>
        <div class="lanehead seq" style="--i:2">USE, there</div><div class="lstep bad seq" style="--i:2">db host: CPU 40% (fine) &middot; disk util 96%, io queue depth 30 (<b>saturated</b>) &rarr; found it</div>
        <div class="lanehead seq" style="--i:3">the key</div><div class="lstep good seq pop" style="--i:3">saturation &ne; utilization: <b>saturation is queued work</b> — run-queue length, io queue, pool waiters. it's the leading indicator</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">USE's power is the enumeration</div>
        <p style="margin:4px 0 0">Per resource — CPU, memory, disk io, network, <b class="hl">and the invisible ones</b>: connection pools, thread pools, file descriptors, locks, semaphores. The bottleneck you can't find is usually a resource you didn't list. Utilization + saturation + errors for each, mechanically, until one confesses.</p>
      </div>
      <div class="dnote seq" style="--i:5">RED without USE finds symptoms forever; USE without RED optimizes resources nobody's waiting on. <b style="color:var(--ordered)">Outside-in, then resource-by-resource</b> — that's the whole method.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the checklists as data structures</div>
      <pre class="code">const RED = (svc) =&gt; ({ rate: rps(svc), errors: errRate(svc),
                        duration: latencyHist(svc) });   <span class="cm">// per service</span>
const USE = (res) =&gt; ({ utilization: busyFrac(res),
                        <span class="ok">saturation: queuedWork(res),</span>     <span class="cm">// the early warning</span>
                        errors: errCount(res) });        <span class="cm">// per resource</span>
<span class="cm">// interview: narrate this order out loud — RED at the edge,</span>
<span class="cm">// RED down the call graph, USE on the suspect's resources.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "walk me through debugging a slow service" is a top-five interview prompt, and the winning answer is a <b class="hl">method, not a war story</b>. USE and RED are that method — and in production they turn a 40-minute dashboard safari into four questions asked in the right order.</p>` },

  { eb:"lesson 20 · measurement", title:"Profiling: on-CPU vs off-CPU", html:`
    <p class="big">A profiler answers "where does the time go?" — but there are two kinds of time. <b class="hl">On-CPU</b>: cycles spent computing — the flame graph's bread and butter. <b class="hl">Off-CPU</b>: time spent <b class="hl">waiting</b> — locks, disk, network, the scheduler. Latency problems live overwhelmingly in the second kind, which the default profiler <b class="hl">doesn't show</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">request takes 800ms &middot; CPU profiler says: 40ms &middot; where's the rest?</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">on-cpu 40ms</div><div class="lstep seq" style="--i:0">parse, serialize, business logic &mdash; what the flame graph draws</div>
        <div class="lanehead seq" style="--i:1">off-cpu 760ms</div><div class="lstep bad seq" style="--i:1">280ms lock wait &middot; 300ms downstream RPC &middot; 180ms connection-pool queue &mdash; <b>invisible to a CPU profiler</b></div>
        <div class="lanehead seq" style="--i:2">the misread</div><div class="lstep bad seq" style="--i:2">"the profile is basically idle &mdash; the code is fast, must be the network" &rarr; no: <b>idle = waiting = the actual problem</b></div>
        <div class="lanehead seq" style="--i:3">the tools</div><div class="lstep good seq pop" style="--i:3">off-CPU / wall-clock profiling and distributed traces &mdash; they charge WAITING to the stack that waited</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">which profiler for which complaint</div>
        <p style="margin:4px 0 0"><b class="hl">"CPU is pegged / it's expensive"</b> &rarr; on-CPU flame graph: widest frames = most cycles; flatten the widest plateau. <b class="hl">"It's slow but CPU is low"</b> &rarr; off-CPU analysis or a wall-clock trace: the answer is a wait, and the fix is capacity, contention, or concurrency — not faster code. The two complaints share a vocabulary and nothing else.</p>
      </div>
      <div class="dnote seq" style="--i:5">Rule of thumb: <b style="color:var(--ordered)">throughput problems are usually on-CPU; latency problems are usually off-CPU</b>. Pick the profiler after the complaint, not before.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; reading a flame graph without lying to yourself</div>
      <pre class="code"><span class="cm">// flame graph: x = fraction of SAMPLES (not time sequence!),</span>
<span class="cm">// y = stack depth. width = cost. look for:</span>
<span class="ok">widePlateaus(profile)</span>   <span class="cm">// one fat frame → optimize it</span>
<span class="ok">deathByAThousand(profile)</span> <span class="cm">// no fat frames → cost is diffuse; look</span>
                          <span class="cm">// for a shared cause (allocs, serialization)</span>
<span class="cm">// and if total on-CPU ≪ wall time: stop. profile the WAITS.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the most expensive profiling mistake is optimizing the code the CPU profiler showed you while 95% of the latency sat in a lock queue it couldn't see. One question up front — <i>is the wall time actually on-CPU?</i> — decides whether you need an optimizer or a queueing lesson.</p>` },

  { eb:"lesson 21 · measurement", title:"The throughput-latency curve: load testing that tells the truth", html:`
    <p class="big">A load test that outputs one number answers nothing. The real deliverable is a <b class="hl">curve</b>: latency percentiles as a function of offered load. Its shape is always the same — flat, knee, wall — and <b class="hl">capacity is where the curve crosses your SLO</b>, not where the server dies.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the protocol &middot; step, hold, measure, repeat</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1 · open loop</div><div class="lstep seq" style="--i:0">fixed arrival rate per step (lesson 11) &mdash; closed loops can't see the cliff they're testing for</div>
        <div class="lanehead seq" style="--i:1">2 · step + hold</div><div class="lstep seq" style="--i:1">100, 200, 300 &hellip; rps, each held minutes &mdash; queues need time to reach steady state; a 10s burst measures the warm-up</div>
        <div class="lanehead seq" style="--i:2">3 · record</div><div class="lstep seq" style="--i:2">p50 / p99 / errors per step, from histograms, from intended send times</div>
        <div class="lanehead seq" style="--i:3">4 · read</div><div class="lstep good seq pop" style="--i:3">capacity = last step inside SLO &middot; knee = first step outside &middot; <b>stop reading there</b></div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">the post-knee mirage</div>
        <p style="margin:4px 0 0">Past the knee, latency numbers <b class="hl">improve</b> as the server collapses into fast errors — a table reading 58ms &rarr; 130ms &rarr; "70ms" is not recovering at the end, it's dying. Goodput, not throughput, is the y-axis that can't be fooled. Any tool that reports "max sustained rps" without an SLO condition found the wall, not the capacity.</p>
      </div>
      <div class="dnote seq" style="--i:5">Say the result as a sentence: <b style="color:var(--ordered)">"one instance serves 300 rps inside a 100ms p99; the knee is at 400."</b> That sentence — per instance — is the input to every capacity plan in the next arc.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; reading the curve</div>
      <pre class="code">function findKnee(points, slo) {   <span class="cm">// points ascending by rps</span>
  let capacity = 0, knee = null;
  for (const pt of points) {
    if (pt.p99 &lt;= slo) capacity = pt.rps;
    <span class="ok">else { knee = pt; break; }</span>   <span class="cm">// post-collapse points lie</span>
  }
  return { capacity, knee };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this lesson is the measurement arc cashing out — open-loop generation (lesson 11), honest percentiles (lessons 6 and 10), and steady-state discipline, composed into the one artifact that answers "how will this behave at 10&times;?": the curve, with your SLO drawn across it.</p>` },
  );

})();
