"use strict";
/* Observability Bootcamp — content pack: the tracing arc (lessons 11-15)
   and the logging arc (lessons 16-19). Loaded after content.js, before the
   engine — appends LESSONS in place (indices 10-18; see the LESSON PLAN in
   js/content.js). Cross-links for these lessons are already registered in
   content.js against these final indices. */
(function () {

  LESSONS.push(
  { eb:"lesson 11 · tracing", title:"Spans: the request as a tree", html:`
    <p class="big">A metric told you checkout is slow. Now you need the anatomy of <i>one</i> slow checkout — which of the nine services it touched spent the time. That's a <b class="hl">trace</b>: one request's journey, recorded as a tree of <b class="hl">spans</b>, each a named, timed unit of work pointing at its parent.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">one request &middot; five spans &middot; one tree</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">span</div><div class="lstep seq" style="--i:0">{ trace_id, span_id, <b>parent_id</b>, name, start, end, status, attributes }</div>
        <div class="lanehead seq" style="--i:1">root</div><div class="lstep seq" style="--i:1">GET /checkout &middot; 0&rarr;420ms &middot; parent_id = <b>null</b> — the request itself</div>
        <div class="lanehead seq" style="--i:2">children</div><div class="lstep seq" style="--i:2">auth.check (0&ndash;40) &middot; cart.load (40&ndash;120) &middot; charge (120&ndash;410)</div>
        <div class="lanehead seq" style="--i:3">grandchild</div><div class="lstep seq" style="--i:3">charge &rarr; stripe.post (130&ndash;400) — depth is just parent pointers, all the way down</div>
        <div class="lanehead seq" style="--i:4">the catch</div><div class="lstep bad seq pop" style="--i:4">spans arrive as a <b>bag, in any order</b> — children END first, so they often export first</div>
      </div>
      <div class="dnote seq" style="--i:5">The tree is not shipped anywhere — it's <b style="color:var(--ordered)">reassembled from parent ids</b> by whatever renders the trace. Root = the parentless span (a structural fact); "first to arrive" is an accident of exporters.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Spans carry more than timing: <b class="hl">attributes</b> (route, user tier, cache hit/miss, db statement), <b class="hl">status</b> (ok/error), and <b class="hl">events</b> (timestamped moments inside the span — an exception, a retry). That makes a trace the highest-resolution signal you have for one request — and it's exactly why traces must be sampled while metrics never are: this much detail per request doesn't scale to all requests.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; bag of spans &rarr; tree</div>
      <pre class="code">function buildTrace(spans) {
  const nodes = new Map(spans.map(s =&gt; [s.id, { ...s, children: [] }]));
  let root = null;
  for (const s of nodes.values()) {
    <span class="ok">if (s.parent == null) root = s;</span>            <span class="cm">// structure, not order</span>
    else if (nodes.has(s.parent))                <span class="cm">// dropped parents happen</span>
      nodes.get(s.parent).children.push(s);
  }
  for (const s of nodes.values())
    s.children.sort((a, b) =&gt; a.start - b.start);
  return root;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> every trace UI you'll ever use runs this assembly before drawing anything — and the two classic bugs (crowning the first-arrived span, throwing on an orphan) are both in this course's spot-the-bug module, because both ship to production constantly.</p>` },

  { eb:"lesson 12 · tracing", title:"Context propagation: how the trace survives the hop", html:`
    <p class="big">Nothing about a trace is automatic. Service B's spans join service A's trace for exactly one reason: <b class="hl">A sent the trace context along with the request, and B read it</b>. Miss one handoff and the story snaps in two — which is why every "the trace just stops at the queue" mystery has the same answer.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">W3C traceparent &middot; the whole mechanism is one header</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">header</div><div class="lstep seq" style="--i:0">traceparent: 00-<b>4bf92f…36</b>-<b>00f067…b7</b>-<b>01</b> &nbsp;<span style="color:var(--faint)">(trace-id · parent span-id · flags)</span></div>
        <div class="lanehead seq" style="--i:1">flags</div><div class="lstep seq" style="--i:1">the last byte carries the <b>sampled bit</b> — the head-sampling decision rides WITH the context</div>
        <div class="lanehead seq" style="--i:2">http hop</div><div class="lstep good seq" style="--i:2">auto-instrumentation injects/extracts it on every request — feels free &#10003;</div>
        <div class="lanehead seq" style="--i:3">queue hop</div><div class="lstep bad seq" style="--i:3">publish(msg) — no headers touched &rarr; worker finds no context &rarr; <b>mints a fresh trace id</b> &#10007;</div>
        <div class="lanehead seq" style="--i:4">thread hop</div><div class="lstep bad seq pop" style="--i:4">context lives in task-local storage — a bare thread pool / detached callback loses it the same way &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:5">The tell that distinguishes "context lost" from "spans dropped": lost context makes a <b style="color:var(--race)">second trace</b> with a new id; dropped spans leave a <b style="color:var(--race)">hole</b> in the same trace. Different diseases, different cures.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The fix is always the same shape: <b class="hl">carry the context as data across the boundary</b>. For queues, stuff traceparent into message attributes at publish and extract it at consume — the consumer's span then declares the publisher as parent (or as a <b class="hl">span link</b>, the idiom for batch consumers that process fifty messages from fifty different traces at once). For thread pools and background jobs, capture the context object before you detach and reactivate it inside.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; propagating across a queue, by hand</div>
      <pre class="code"><span class="cm">// publisher — the context is just data; ship it:</span>
queue.publish({
  body: order,
  <span class="ok">attributes: { traceparent: ctx.toTraceparent() },</span>
});
<span class="cm">// consumer — resume the story instead of starting a new one:</span>
const parent = Context.fromTraceparent(msg.attributes.traceparent);
tracer.startSpan("charge.consume", <span class="ok">{ parent }</span>);</pre>
    </div>
    <p><b class="hl">Why it matters:</b> distributed tracing is 10% span math and 90% propagation discipline. In an interview, "how does the trace id get to service B?" separates people who've used a trace UI from people who've made one work — the answer is a header, a sampled flag, and a rule: <i>every boundary is manual until proven instrumented</i>.</p>` },

  { eb:"lesson 13 · tracing", title:"Reading a waterfall", html:`
    <p class="big">A waterfall view is not a picture — it's a <b class="hl">worked argument about where the time went</b>, and there are exactly three shapes to read: the critical path, sequential stairs, and gaps. Learn the three and any trace UI becomes legible in seconds.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">GET /checkout &middot; 420ms &middot; read the shapes</div>
      <svg class="estage" viewBox="0 0 340 132" width="100%" style="max-width:380px" font-family="ui-monospace,monospace">
        <rect x="10" y="10" width="320" height="14" rx="4" fill="#11131c" stroke="#8e86f0"/>
        <text x="16" y="21" fill="#8e86f0" font-size="8">GET /checkout · 420ms</text>
        <rect x="10" y="32" width="30" height="12" rx="3" fill="#11131c" stroke="#2c3350"/>
        <text x="14" y="42" fill="#8b90ab" font-size="7.5">auth 40</text>
        <rect x="42" y="50" width="62" height="12" rx="3" fill="#11131c" stroke="#2c3350"/>
        <text x="46" y="60" fill="#8b90ab" font-size="7.5">cart.load 80</text>
        <rect x="106" y="68" width="221" height="12" rx="3" fill="#11131c" stroke="#ff9a6b"/>
        <text x="110" y="78" fill="#ff9a6b" font-size="7.5">charge 290 — critical path</text>
        <rect x="114" y="86" width="205" height="12" rx="3" fill="#11131c" stroke="#ff9a6b" stroke-dasharray="3 2"/>
        <text x="118" y="96" fill="#ff9a6b" font-size="7.5">stripe.post 270</text>
        <line x1="40" y1="44" x2="42" y2="50" stroke="#57e0b0" stroke-width="1"/>
        <line x1="104" y1="62" x2="106" y2="68" stroke="#57e0b0" stroke-width="1"/>
        <text x="46" y="118" fill="#57e0b0" font-size="8">stairs: auth → cart never overlap — could they?</text>
        <circle r="4" fill="#8e86f0">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.18;0.42;0.75;1" keyPoints="0;0.15;0.35;1;1"
            path="M 12 17 L 330 17"/>
        </circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">critical path</div><div class="lstep seq" style="--i:0">the last-finisher chain: checkout &rarr; charge &rarr; stripe — <b>the first-order critical path</b>. The last finisher at every level is always on it; sequential predecessors that gate its start are on it too</div>
        <div class="lanehead seq" style="--i:1">stairs</div><div class="lstep seq" style="--i:1">auth then cart, strictly sequential — if they're independent, that's <b>missing concurrency</b>: 120ms where 80 would do</div>
        <div class="lanehead seq" style="--i:2">gaps</div><div class="lstep bad seq pop" style="--i:2">charge runs 10ms before stripe.post starts and 10ms after it returns — <b>uninstrumented time</b>: serialization, queues, GC, code without spans</div>
      </div>
      <div class="dnote seq" style="--i:3">Total time &ne; sum of spans: parallel spans overlap and gaps belong to nobody. The chain is <b style="color:var(--ordered)">first-order</b>: start optimizing there — and remember the stairs: a sequential predecessor that gates the chain's start (auth gates cart gates charge) shapes the total too.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The mechanical version: walk from the root, and at each node follow <b class="hl">the child that finishes last</b> — that chain is the last-finisher chain, the first-order critical path. Along it, look at each span's <b class="hl">self-time</b> (its duration minus its children's coverage): the biggest self-time is the hop that personally spent the time, as opposed to merely containing a slow descendant. Everything else is context — though the stairs are context you can cash in: a sequential predecessor that gates a chain span's start moves the total when you parallelize it away.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the two questions, as code</div>
      <pre class="code">function criticalPath(root) {
  const path = [root];
  let cur = root;
  while (cur.children.length) {
    <span class="ok">cur = cur.children.reduce((a, b) =&gt; b.end &gt; a.end ? b : a);</span>
    path.push(cur);                <span class="cm">// follow the last-finisher</span>
  }
  return path;
}
<span class="cm">// selfTime(node) = duration − union(children intervals)</span>
<span class="cm">// biggest self-time ON the path = the actual culprit</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we made the cart service 40% faster and checkout latency didn't move" is a critical-path lesson someone paid a sprint for. Read the waterfall first: stairs tell you what to parallelize, gaps tell you what to instrument, and the last-finisher chain tells you where optimization counts first.</p>` },

  { eb:"lesson 14 · tracing", title:"Sampling: head vs tail", html:`
    <p class="big">Tracing every request at full detail would cost more than the service it observes. So you sample — and <b class="hl">where you decide is everything</b>: at the head (trace start), you're cheap and blind; at the tail (trace end), you see everything and pay for the privilege.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the same 0.2% failure &middot; two samplers</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">head</div><div class="lstep seq" style="--i:0">at ingress: hash(trace_id) &lt; 1% &rarr; keep &middot; decision rides the traceparent's sampled flag</div>
        <div class="lanehead seq" style="--i:1">cost</div><div class="lstep good seq" style="--i:1">unsampled traces are <b>never even recorded</b> — cheapest possible, no coordination &#10003;</div>
        <div class="lanehead seq" style="--i:2">but</div><div class="lstep bad seq" style="--i:2">it decided <b>before the outcome existed</b>: keeps 1% of errors because it keeps 1% of everything — the failing trace you need is 1-in-50,000 &#10007;</div>
        <div class="lanehead seq" style="--i:3">tail</div><div class="lstep seq" style="--i:3">collector buffers ALL spans of a trace until it completes &rarr; then judges: error? slow? interesting?</div>
        <div class="lanehead seq" style="--i:4">verdict</div><div class="lstep good seq pop" style="--i:4">keep 100% of errors + everything over the latency bar + 1% of the boring &rarr; <b>the bodies are always in the morgue</b> &#10003;</div>
      </div>
      <div class="dnote seq" style="--i:5">Tail's bill: every span of every trace is exported and <b style="color:var(--race)">held in collector memory</b> until the trace ends (how long is "ended"? — a timeout you must choose), and all of a trace's spans must reach the <b style="color:var(--race)">same collector</b> to be judged together. Head is a hash; tail is a distributed system.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two disciplines make either work. <b class="hl">Determinism</b>: the head decision must be a hash of the trace id, never a coin flip per span — every span (and every service, independently) must reach the same verdict, or you ship fragments. <b class="hl">Bias accounting</b>: the moment you keep "all errors + 1% of the rest," your trace store is no longer a fair sample — fine for debugging, but never count traces to estimate rates. Rates come from metrics, which see everything; traces are specimens.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; both deciders</div>
      <pre class="code"><span class="cm">// head — at the first service, then propagated via the flag:</span>
keep(traceId) { return <span class="ok">fnv1a(traceId)</span> % 10000 &lt; rate * 10000; }

<span class="cm">// tail — at the collector, after the trace completes:</span>
decide(trace) {
  <span class="ok">if (trace.error) return true;</span>              <span class="cm">// never lose a body</span>
  if (trace.durationMs &gt;= slowMs) return true;
  return fnv1a(trace.id) % 10000 &lt; baseRate * 10000;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we have tracing but never the trace we need" is the most common tracing complaint in the industry, and it is this lesson verbatim — a 1% head sampler quietly discarding the incidents. Knowing the buffer-and-judge cost of tail sampling is what makes your fix a proposal instead of a wish.</p>` },

  { eb:"lesson 15 · tracing", title:"Exemplars: from the spike to the specimen", html:`
    <p class="big">The p99 panel says something broke at 15:10. The trace store has the anatomy of individual requests. Between them there is traditionally… nothing: you eyeball timestamps and grep. An <b class="hl">exemplar</b> is the missing pointer — <b class="hl">a real trace id stapled to the histogram bucket it landed in</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the bridge between aggregate and instance</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">record</div><div class="lstep seq" style="--i:0">request takes 1,840ms &rarr; bucket le=2000 ++ &rarr; and its <b>trace_id is attached</b> to that bucket as the exemplar</div>
        <div class="lanehead seq" style="--i:1">panel</div><div class="lstep seq" style="--i:1">p99 spike at 15:10 &rarr; the spiking buckets carry dots — each dot a real victim from that window</div>
        <div class="lanehead seq" style="--i:2">click</div><div class="lstep good seq pop" style="--i:2">dot &rarr; waterfall of an actual slow request from the actual spike &rarr; the culprit hop, one click from the page &#10003;</div>
        <div class="lanehead seq" style="--i:3">without</div><div class="lstep bad seq" style="--i:3">grep logs by timestamp across thousands of interleaved requests, hope the slow ones logged their duration &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:4">This is the two axioms shaking hands: the metric (lossy, cheap, alertable) <b style="color:var(--ordered)">detects</b>; the exemplar de-compresses to one concrete instance so the trace can <b style="color:var(--ordered)">localize</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The fine print that makes exemplars work — or quietly not: the instrument attaches the trace id <b class="hl">only when the current trace is sampled</b> (an exemplar pointing at a trace that was never kept is a dead link), and it keeps the <b class="hl">most recent</b> exemplar per bucket, so the dots are representative, not exhaustive. Pair exemplars with tail sampling or error/latency-biased sampling and the dots on your worst buckets are nearly always live.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; recording with an exemplar</div>
      <pre class="code">record(v) {
  const i = this.bucketFor(v);
  this.counts[i]++;
  const ctx = currentTraceContext();
  <span class="ok">if (ctx &amp;&amp; ctx.sampled)</span>
    this.exemplars[i] = { traceId: ctx.traceId, value: v };
}   <span class="cm">// OpenMetrics ships this next to the bucket; Prometheus,</span>
    <span class="cm">// Grafana, and OTel all speak it — the dots on your panels</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> triage speed is measured in handoffs, and the metric&rarr;trace handoff is the slowest one in most stacks. Exemplars turn it into a click. When you design instrumentation, wire them in on the latency histograms first — the p99 panel is where every incident starts.</p>` },

  { eb:"lesson 16 · logging", title:"Structured logs: events, not prose", html:`
    <p class="big">"Charged customer 4482 the amount $940.50 after 3 retries" is a sentence. Sentences are for humans reading one line; production questions are about <b class="hl">ten thousand lines at once</b> — and you cannot GROUP BY a sentence. A log entry should be an <b class="hl">event: named fields, machine-queryable</b>, human-readable second.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the same fact &middot; two futures</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">prose</div><div class="lstep bad seq" style="--i:0">"Charged customer 4482 … after 3 retries" &rarr; answers arrive by <b>regex archaeology</b>, one format change from breaking &#10007;</div>
        <div class="lanehead seq" style="--i:1">event</div><div class="lstep good seq" style="--i:1">{ event:"charge", customer_id:4482, amount_cents:94050, retries:3, trace_id:"…" } &#10003;</div>
        <div class="lanehead seq" style="--i:2">now ask</div><div class="lstep good seq pop" style="--i:2">p95 of amount by route &middot; retries&gt;0 grouped by region &middot; every event for THIS trace_id — <b>questions, not greps</b></div>
      </div>
      <div class="dnote seq" style="--i:3">Fields you can query beat strings you grep — and the difference compounds: every field is a dimension the 3am GROUP BY can slice, which is precisely the <b style="color:var(--ordered)">unknown-unknowns machinery</b> from lesson 04. Prose has zero dimensions.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The craft is in the field discipline. <b class="hl">Consistent names</b> (user_id everywhere, never uid/userId/user in three services), <b class="hl">consistent units in the name</b> (amount_cents, duration_ms — a bare "duration" is a bug you'll chart someday), <b class="hl">low-effort context on every event</b>: trace_id, request_id, service, version. That last group is what stitches logs to traces and metrics — an unstitched log line is a fact with no address.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the event, in practice</div>
      <pre class="code"><span class="cm">// not this:</span>
log.info("charged " + userId + " $" + amt + " after " + n + " retries");
<span class="cm">// this:</span>
log.info({
  event: "charge.succeeded",
  <span class="ok">trace_id: ctx.traceId,</span>          <span class="cm">// the stitch</span>
  customer_id: userId,
  amount_cents: amt * 100,          <span class="cm">// unit in the name</span>
  retries: n,
});</pre>
    </div>
    <p><b class="hl">Why it matters:</b> structured-vs-prose is decided once, in a logging middleware, and paid for (or collected on) at every incident afterward. It's also the prerequisite for the next two lessons — you can't build a canonical line, or sample logs safely, out of sentences.</p>` },

  { eb:"lesson 17 · logging", title:"Levels: why WARN is where signals die", html:`
    <p class="big">Log levels look like a severity scale. Operationally they're a <b class="hl">routing table</b>: who — or what — is supposed to consume this event, and when. Most teams get ERROR and DEBUG roughly right and pour everything ambiguous into WARN, which is precisely the level <b class="hl">nothing and nobody consumes</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the routing table nobody wrote down</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">ERROR</div><div class="lstep seq" style="--i:0">this operation failed; someone may need to act &middot; consumed by <b>queries during incidents</b> — always kept, never sampled</div>
        <div class="lanehead seq" style="--i:1">WARN</div><div class="lstep bad seq" style="--i:1">"something's off but I handled it" &middot; consumed by… <b>no one</b>: not paged, not read, not queried &#10007;</div>
        <div class="lanehead seq" style="--i:2">INFO</div><div class="lstep seq" style="--i:2">the request narrative (canonical lines, lifecycle marks) &middot; consumed by <b>humans reconstructing a story</b></div>
        <div class="lanehead seq" style="--i:3">DEBUG</div><div class="lstep seq" style="--i:3">development detail &middot; consumed in dev; in prod: off, or flag-gated for one investigation</div>
      </div>
      <div class="dnote seq" style="--i:4">The autopsy classic: <b style="color:var(--race)">"WARN pool exhausted" 9,400 times in the hour before the outage</b>. It predicted the failure and reached no consumer. A warning that matters is a metric-plus-alert wearing the wrong costume; a warning that doesn't is INFO with anxiety.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The WARN test, applied in code review: <b class="hl">does this condition predict user-visible failure?</b> If yes, it must become a <b class="hl">metric with an alert</b> — detection is the machine's job, and log lines have no pager. If no, log it at INFO as context for humans, or delete it. Either answer is fine; the unexamined middle — where 9,400 predictions scroll past unread — is the only wrong one.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; promoting a warning to a signal</div>
      <pre class="code"><span class="cm">// before: a prediction, shouted into the void</span>
log.warn("pool exhausted, queueing caller");
<span class="cm">// after: the condition becomes detectable…</span>
<span class="ok">metrics.gauge("pool_waiters").set(pool.waiters);</span>
<span class="ok">// alert: pool_waiters &gt; 0 for 5m -&gt; ticket; &gt; 20 -&gt; page</span>
<span class="cm">// …and the log line stays as INFO context for the human who arrives</span>
log.info({ event: "pool.saturated", waiters: pool.waiters });</pre>
    </div>
    <p><b class="hl">Why it matters:</b> postmortems that end with "the logs actually predicted this" are describing a routing failure, not a mystery. Levels are consumption contracts — and once you read them that way, log review becomes a real engineering activity: for each line, name its consumer or change its form.</p>` },

  { eb:"lesson 18 · logging", title:"The canonical log line", html:`
    <p class="big">A single request emits 40 log lines across its lifetime — auth here, cache there, a retry, a timing, an error. Reconstructing the request means joining 40 rows by request id, at query time, forever. The alternative, used by the shops that log best: <b class="hl">one wide event per request</b>, accumulated during processing and emitted at the end — the <b class="hl">canonical log line</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">40 scattered lines vs one canonical event</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">scattered</div><div class="lstep bad seq" style="--i:0">"auth ok" … "cache miss" … "retrying" … "took 1,204ms" — the story exists only after a 40-row join &#10007;</div>
        <div class="lanehead seq" style="--i:1">canonical</div><div class="lstep good seq" style="--i:1">{ route, user_tier, cache:"miss", db_ms:840, retries:1, status:500, error:"pool timeout", duration_ms:1204, trace_id } &#10003;</div>
        <div class="lanehead seq" style="--i:2">query</div><div class="lstep good seq pop" style="--i:2">one row per request &rarr; GROUP BY anything, filter by everything — the wide event from lesson 04, delivered</div>
      </div>
      <div class="dnote seq" style="--i:3">The invariant that makes it trustworthy: <b style="color:var(--ordered)">exactly one line per request, emitted in a finally</b> — success, error, or unhandled explosion. The request that dies mid-handler is the one your 3am query is looking for; it must not be the one missing from the table.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Mechanically it's middleware: open an empty record at request start, let every layer <b class="hl">set fields into it</b> as it works (the cache layer writes cache=miss, the db layer writes db_ms), and emit once at the end with status and duration stamped. The scattered lines can stay at DEBUG for development; the canonical line is the production interface. Stripe made the pattern famous; Honeycomb built a company on the generalization.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the middleware</div>
      <pre class="code">wrap(handler) {
  return (req) =&gt; {
    const canon = { route: req.route, request_id: req.id, started: now() };
    const set = (k, v) =&gt; { canon[k] = v; };      <span class="cm">// layers write here</span>
    try {
      const out = handler(req, set);
      canon.status = out.status;
      return out;
    } catch (e) {
      canon.status = 500; canon.error = e.message;
      throw e;
    } <span class="ok">finally {
      canon.duration_ms = now() - canon.started;
      emit(canon);                    // one line. no matter what.
    }</span>
  };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the canonical line is the cheapest big upgrade in observability — no new vendor, no new pipeline, one middleware — and it converts your logs from prose to the queryable wide events every other lesson leans on. If you adopt one practice from this arc, adopt this one.</p>` },

  { eb:"lesson 19 · logging", title:"Log sampling: keep the bodies, thin the crowd", html:`
    <p class="big">Logging is usually the largest line item on the observability bill, and the bulk of it is the same happy-path event repeated a million times an hour. The fix is the same as tracing's — sample — with one extra commandment: <b class="hl">errors are never sampled. Ever.</b></p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">1,000,000 requests/hour &middot; what actually needs to exist</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">errors</div><div class="lstep good seq" style="--i:0">4,000 events &rarr; keep <b>100%</b> — each is evidence; "we kept 10% of the bodies" is not a sentence you want in a postmortem</div>
        <div class="lanehead seq" style="--i:1">happy path</div><div class="lstep seq" style="--i:1">996,000 near-identical events &rarr; keep <b>1%</b> + <b>record the rate</b> on each kept event (sample_rate: 100)</div>
        <div class="lanehead seq" style="--i:2">reweigh</div><div class="lstep good seq pop" style="--i:2">count(*) &times; sample_rate &rarr; honest totals from sampled data — the estimate knows it's an estimate</div>
        <div class="lanehead seq" style="--i:3">order!</div><div class="lstep bad seq" style="--i:3">sample first, check level second &rarr; the error that lands on a dropped tick <b>vanishes</b> — the outage logs 4 of its 40 failures &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:4">The classifier runs BEFORE the sampler: level, then dice. And the dice should be <b style="color:var(--ordered)">deterministic by trace id</b> where possible, so the requests whose logs survive are the same requests whose traces survived — signals that agree on their specimens.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Refinements that earn their keep at scale: <b class="hl">sample by key, not globally</b> (1% per route, so a rare route isn't erased by a chatty one); <b class="hl">first-N-per-window</b> for repeated identical errors (keep the first 50 of the same stack trace per minute, then count); and put the <b class="hl">sample_rate on the event itself</b>, because a number divorced from its weight is how sampled data turns into wrong dashboards.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the error-preserving sampler</div>
      <pre class="code">emit(record) {
  <span class="ok">if (record.level === "error") return keep(record);</span>  <span class="cm">// unconditional, FIRST</span>
  if (fnv1a(record.trace_id) % 100 &lt; 1) {
    record.sample_rate = 100;         <span class="cm">// the weight travels with it</span>
    return keep(record);
  }
  return null;                        <span class="cm">// thinned, and accounted for</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> cost control is where good observability programs die — someone turns logging "down" with a blunt filter and the next incident has no evidence. Error-preserving, rate-annotated, key-aware sampling is how you cut 90% of the bill while keeping 100% of the forensics; the ordering bug in the diagram is in this course's spot-the-bug because it ships constantly.</p>` }
  );

})();
