"use strict";
/* Performance & Queueing Bootcamp — content pack: load behavior.
   Appends lessons 10-15 (final indices; see the LESSON PLAN in js/content.js):
     10 open vs closed loop load
     11 what overload actually looks like
     12 load shedding and admission control
     13 backpressure end-to-end
     14 queue discipline under overload
     15 adaptive concurrency limits
   Cross-links for these lessons are already registered in content.js. */
(function () {

  LESSONS.push(
  { eb:"lesson 11 · load behavior", title:"Open vs closed loop: how load actually arrives", html:`
    <p class="big">Every load model is one of two species. <b class="hl">Closed loop:</b> N users in a cycle — send, wait for the response, think, send again. <b class="hl">Open loop:</b> arrivals come from the outside world's clock, indifferent to how you're doing. The difference decides <b class="hl">what overload even means</b> — and which one your benchmark speaks decides whether it can lie to you.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the server slows from 10ms to 1s &middot; watch each model react</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">closed (50 VUs)</div><div class="lstep seq" style="--i:0">arrival rate = 50 &divide; latency &rarr; it <b>drops 100&times;</b> with the slowdown &mdash; at most 50 ever in flight</div>
        <div class="lanehead seq" style="--i:1">open (500 rps)</div><div class="lstep bad seq" style="--i:1">arrivals keep coming at 500/s &rarr; 499/s join a queue that grows without bound</div>
        <div class="lanehead seq" style="--i:2">closed reports</div><div class="lstep bad seq" style="--i:2">"latency rose to 1s, throughput fell" &mdash; tidy, self-limiting, <b>wrong about production</b></div>
        <div class="lanehead seq" style="--i:3">open reports</div><div class="lstep good seq pop" style="--i:3">the backlog, the multi-second waits, the cliff &mdash; what your users will actually meet</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">which is real? both — know which one you have</div>
        <p style="margin:4px 0 0">Public traffic is <b class="hl">open</b>: new visitors don't wait for other people's responses. Batch workers, connection-pool-limited callers, and one upstream service with a concurrency cap are <b class="hl">closed</b> — their concurrency limit is a natural backpressure. The deadly mismatch is testing an open system with a closed tool.</p>
      </div>
      <div class="dnote seq" style="--i:5">Closed-loop tests also hide <b style="color:var(--race)">coordinated omission</b> (lesson 9) for free: the generator stops sampling exactly when the server stalls. Two lies, one loop.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the open-loop core</div>
      <pre class="code">for (let i = 0; i &lt; n; i++) {
  <span class="ok">const scheduled = i * intervalMs;</span>      <span class="cm">// the world's clock</span>
  const start = Math.max(scheduled, free);  <span class="cm">// queue if busy</span>
  free = start + serviceTimes[i];
  <span class="ok">lat.push(free - scheduled);</span>             <span class="cm">// from INTENDED send</span>
}
<span class="cm">// wrk2's --rate, k6's arrival-rate executors: this loop, weaponized</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we load-tested to 5,000 rps" means nothing until you know the loop. Closed-loop numbers describe a system with built-in backpressure; production has none unless you build it — which is exactly what the rest of this arc is about.</p>` },

  { eb:"lesson 12 · load behavior", title:"What overload actually looks like", html:`
    <p class="big">Overload is not "slower." Push an unprotected system past capacity and <b class="hl">goodput</b> — work completed <i>in time, for a caller still listening</i> — doesn't plateau. It <b class="hl">collapses</b>. Throughput keeps looking busy; usefulness falls off a cliff, and feedback loops keep it there.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">offered load rises left to right &middot; what each curve does</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">under the knee</div><div class="lstep good seq" style="--i:0">goodput = offered load &mdash; everything served, on time</div>
        <div class="lanehead seq" style="--i:1">at capacity</div><div class="lstep seq" style="--i:1">throughput flatlines at μ &middot; queues grow &middot; latency climbs toward timeouts</div>
        <div class="lanehead seq" style="--i:2">past it</div><div class="lstep bad seq" style="--i:2">completions arrive AFTER client timeouts &rarr; goodput &rarr; 0 while the server runs at 100%</div>
        <div class="lanehead seq" style="--i:3">the storm</div><div class="lstep bad seq" style="--i:3">timeouts trigger retries &rarr; offered load &times;1.5&ndash;4 &rarr; deeper overload &rarr; more retries</div>
        <div class="lanehead seq" style="--i:4">metastable</div><div class="lstep bad seq pop" style="--i:4">the trigger passes; the retry+queue load alone keeps ρ &gt; 1 &mdash; the outage <b>sustains itself</b></div>
      </div>
      <div class="qbox macro seq" style="--i:5">
        <div class="dlabel">the signature to memorize</div>
        <p style="margin:4px 0 0">CPU 100%, throughput "fine", error rate low, latency insane, and <b class="hl">restarting the service fixes it</b> — because the restart dumped the queue. If a restart fixes it, the queue WAS the problem: you were metastable, serving the backlog's ghosts instead of live traffic.</p>
      </div>
      <div class="dnote seq" style="--i:6">Work wasted on the doomed &mdash; timed-out requests still being served, retries of things that succeeded &mdash; is capacity spent making the outage <b style="color:var(--race)">longer</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; goodput is the only honest overload metric</div>
      <pre class="code"><span class="cm">// throughput: completions/sec — counts zombies happily</span>
<span class="cm">// goodput: completions IN DEADLINE, caller still waiting</span>
<span class="ok">goodput = completed.filter(r =&gt;
  r.finishedAt &lt;= r.deadline).length / seconds;</span>
<span class="cm">// if goodput &lt; throughput, you are paying full price</span>
<span class="cm">// to disappoint people.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every defense in the next three lessons — shedding, backpressure, discipline, adaptive limits — exists to break one of these feedback loops. Diagnosing which loop you're in ("is this load, or is this retry amplification of load?") is the difference between adding servers and ending the incident.</p>` },

  { eb:"lesson 13 · load behavior", title:"Load shedding: reject early, reject cheap", html:`
    <p class="big">When offered load exceeds capacity, you <b class="hl">will</b> fail some requests — the only choice is <b class="hl">how</b>. Queue-and-die fails them slowly, expensively, after they've consumed resources. Admission control fails the excess <b class="hl">instantly and nearly free</b> at the front door, so everything you do accept gets real service.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">150% of capacity arrives &middot; two doors</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">no shedding</div>
          <div class="lstep bad">queue grows &middot; ALL requests slow</div>
          <div class="lstep bad">timeouts everywhere &middot; server busy serving corpses</div>
          <div class="lstep bad">goodput &rarr; 0</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">shed the excess ~33%</div>
          <div class="lstep good">67% served at normal latency</div>
          <div class="lstep good">33% get an instant, honest 429</div>
          <div class="lstep good">goodput = capacity &mdash; the maximum possible</div>
        </div>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:2">deadline-aware</div><div class="lstep good seq" style="--i:2">admit only if est. queue wait + service fits the request's remaining deadline &mdash; never serve the doomed</div>
        <div class="lanehead seq" style="--i:3">priority-aware</div><div class="lstep seq" style="--i:3">shed prefetches and retries before checkouts &mdash; criticality is a request field, not a vibe</div>
        <div class="lanehead seq" style="--i:4">signal-aware</div><div class="lstep seq" style="--i:4">a 429 + Retry-After tells clients to back off &mdash; a timeout teaches them to retry harder</div>
      </div>
      <div class="dnote seq" style="--i:5">A shed must cost <b style="color:var(--race)">almost nothing</b> &mdash; reject before parsing, before auth, before the expensive layers &mdash; or shedding itself becomes the overload.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the deadline gate</div>
      <pre class="code">offer(now, deadline) {
  <span class="ok">const finishBy = now + (this.queued + 1) * this.est;</span>
  if (finishBy &gt; deadline) return "shed";   <span class="cm">// fast, free no</span>
  this.queued++;
  return "admitted";                        <span class="cm">// a real yes</span>
}
<span class="cm">// invariant: everything admitted CAN still finish in time.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> shedding feels like giving up; it's the opposite — it's choosing to serve <i>capacity's worth</i> of users perfectly instead of serving nobody slowly. The interview form: "you're at 150% capacity for the next ten minutes; describe exactly who gets errors and when they find out."</p>` },

  { eb:"lesson 14 · load behavior", title:"Backpressure: bounded queues, end to end", html:`
    <p class="big">Every queue needs an answer to "what happens when I'm full?" An <b class="hl">unbounded</b> queue answers: nothing — I'll absorb it. That converts overload into <b class="hl">memory growth plus unbounded latency</b>, silently. A <b class="hl">bounded</b> queue answers: I push back — and the slowdown propagates <b class="hl">upstream, to the source</b>, which is the only place it can actually be resolved.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">a three-stage pipeline &middot; stage C slows down</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">bounded</div><div class="lstep good seq" style="--i:0">C's queue fills &rarr; B's writes block/fail &rarr; B's queue fills &rarr; A slows its intake &mdash; <b>the source feels it in seconds</b></div>
        <div class="lanehead seq" style="--i:1">unbounded</div><div class="lstep bad seq" style="--i:1">B keeps accepting &middot; every metric green &middot; queue = 4M items &middot; latency = 40 minutes &middot; then OOM</div>
        <div class="lanehead seq" style="--i:2">little's law</div><div class="lstep seq" style="--i:2">a bound IS a latency cap: cap 1,000 items at 100/s &rArr; max ~10s in queue &mdash; choose depth by the wait you can stomach</div>
        <div class="lanehead seq" style="--i:3">the leak</div><div class="lstep bad seq pop" style="--i:3">one unbounded hop in a bounded chain &rarr; ALL the pressure pools there &mdash; the chain is as honest as its softest link</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">when full, pick deliberately</div>
        <p style="margin:4px 0 0"><b class="hl">Block</b> the producer (in-process pipelines — the classic backpressure). <b class="hl">Fail fast</b> to the caller (RPC — becomes load shedding). <b class="hl">Drop oldest</b> (metrics, telemetry — freshness beats completeness). "Grow forever" is the one indefensible setting, and it's the default in every language's standard queue.</p>
      </div>
      <div class="dnote seq" style="--i:5">Backpressure isn't a failure mode &mdash; it's <b style="color:var(--ordered)">information</b>: the system telling its callers the truth about capacity while there's still time to act on it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; a bound with an answer</div>
      <pre class="code">async push(item) {
  <span class="ok">if (this.q.length &gt;= this.cap) {</span>
    <span class="cm">// the full-queue policy is the design decision:</span>
    throw new QueueFull();      <span class="cm">// fail fast → caller sheds/retries-with-budget</span>
    <span class="cm">// or: await this.space;     // block → upstream slows</span>
    <span class="cm">// or: this.q.shift();       // drop-oldest → freshness wins</span>
  }
  this.q.push(item);
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we added a queue so we can't be overloaded" is the most common capacity myth in system design. A queue doesn't add capacity — it adds <b class="hl">time-shifting</b>, and unbounded time-shifting is just an outage with a delay. Every queue in your architecture diagram should have its depth, its wait budget, and its full-policy written next to it.</p>` },

  { eb:"lesson 15 · load behavior", title:"Queue discipline: FIFO breaks under overload", html:`
    <p class="big">FIFO is the fair default — first come, first served. Under overload it develops a cruel property: by the time a request reaches the front, it has <b class="hl">burned most of its deadline in line</b>. The server ends up faithfully serving requests whose callers <b class="hl">hung up seconds ago</b>, in arrival order.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">sustained overload, 30s client timeouts &middot; who gets served?</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">fifo</div><div class="lstep bad seq" style="--i:0">serve the oldest &rarr; 29.9s in queue &rarr; completes &rarr; caller left at 30s &mdash; <b>a zombie completion</b></div>
        <div class="lanehead seq" style="--i:1">fifo, forever</div><div class="lstep bad seq" style="--i:1">every dequeued request is nearly expired &rarr; throughput 100%, goodput &asymp; 0</div>
        <div class="lanehead seq" style="--i:2">lifo</div><div class="lstep good seq" style="--i:2">serve the NEWEST &rarr; fresh deadline budget &rarr; completes with a live caller &mdash; the p50 comes back</div>
        <div class="lanehead seq" style="--i:3">+ sweep</div><div class="lstep good seq pop" style="--i:3">drop expired entries from the old end &mdash; they cost memory and lie to your depth metrics</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">but isn't LIFO unfair?</div>
        <p style="margin:4px 0 0">Brutally — to requests that were <b class="hl">already doomed</b>. Under FIFO they'd complete after their callers left: worthless. LIFO redirects capacity from the dead to the living. That's why it's a real overload pattern — Facebook's adaptive LIFO switches discipline only when queue delay crosses a threshold, and CoDel applies the same idea inside network queues. Healthy queue: FIFO. Drowning queue: LIFO + shed.</p>
      </div>
      <div class="dnote seq" style="--i:5">Discipline is a <b style="color:var(--ordered)">goodput</b> decision, not a courtesy one: the queue's job during overload is to maximize completions that still matter.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the overload dequeue</div>
      <pre class="code">function next(queue, now) {
  <span class="ok">while (queue.length &amp;&amp; now &gt; queue[0].deadline)</span>
    queue.shift();               <span class="cm">// the expired cost memory, not capacity</span>
  <span class="ok">return queue.pop() || null;</span>    <span class="cm">// freshest first while drowning</span>
}
<span class="cm">// adaptive version: use shift() (FIFO) while queue delay &lt; target,</span>
<span class="cm">// flip to pop() when it isn't. fairness is a fair-weather policy.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the cheapest overload win in the catalog — no capacity added, no clients changed, and the p50 during incidents transforms. It also reframes queues for you permanently: a queue is not a buffer, it's a <b class="hl">scheduling policy</b>, and under stress the policy is the product.</p>` },

  { eb:"lesson 16 · load behavior", title:"Adaptive concurrency: discover the limit", html:`
    <p class="big">Every static limit — max connections, worker counts, rate caps — encodes a guess about capacity that was measured <b class="hl">on a different fleet, on a different day</b>. Deploys, host mixes, payload drift, and noisy neighbors move the real limit constantly. The alternative: <b class="hl">probe for it</b>, the way TCP has since 1988 — additive increase, multiplicative decrease.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">AIMD around a moving capacity &middot; the sawtooth is the feature</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">probe</div><div class="lstep seq" style="--i:0">a full window of successes &rarr; limit + 1 &mdash; gently feel for the ceiling</div>
        <div class="lanehead seq" style="--i:1">signal</div><div class="lstep bad seq" style="--i:1">timeout / overload error / RTT spike above baseline &rarr; the ceiling spoke</div>
        <div class="lanehead seq" style="--i:2">escape</div><div class="lstep good seq" style="--i:2">limit &divide; 2 &mdash; shed load <b>faster than the overload grows</b>; that's why it's a halving</div>
        <div class="lanehead seq" style="--i:3">result</div><div class="lstep good seq pop" style="--i:3">a sawtooth hugging true capacity from below &mdash; and when capacity moves, the sawtooth follows it</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">why limit CONCURRENCY, not rate</div>
        <p style="margin:4px 0 0">Little's law again: sustainable concurrency = capacity &times; latency, so a concurrency limit <b class="hl">auto-adjusts to slowness</b> — when the downstream slows, the same limit admits less per second, exactly right. A rate limit set for fast responses keeps firing full speed into a slow system. Gradient-style limiters (Netflix's concurrency-limits) refine the failure signal — compare short-term RTT against a long-term baseline — but the loop is the same.</p>
      </div>
      <div class="dnote seq" style="--i:5">The asymmetry is the whole algorithm: <b style="color:var(--ordered)">gentle up, violent down</b>. AIAD never escapes; MIMD never settles; AIMD converges &mdash; and fair-shares among competing clients, which is why the internet still works.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the discovery loop</div>
      <pre class="code">release(ok) {
  this.inflight--;
  if (!ok) {
    this.streak = 0;
    <span class="ok">this.limit = Math.max(this.min, Math.floor(this.limit / 2));</span>
    return;
  }
  if (++this.streak &gt;= this.limit) {   <span class="cm">// one full window clean</span>
    this.streak = 0;
    <span class="ok">this.limit = Math.min(this.max, this.limit + 1);</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this closes the load-behavior arc with its central lesson — capacity is not a config value, it's a <b class="hl">measurement that expires</b>. Shedding protects the server, backpressure informs the caller, and adaptive limits keep the two agreeing automatically while everything underneath them shifts.</p>` },
  );

})();
