"use strict";
/* Observability Bootcamp — content pack: the stack map.
   Loaded after content.js and the lesson packs, before the engine (same
   shared-global model as a classic <script> tag). Registers:
     1. a "stack map" sheet module — every concept in this course mapped to
        the real construct that embodies it in a production observability
        stack, with a bridge line to SAY out loud in an interview or
        design review
     2. four more read-the-incident quiz questions
     3. six flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  /* =========================================================
     1. THE STACK MAP — a static "sheet" module
        concept -> production construct -> a line to SAY out loud
     ========================================================= */
  const mapHtml = `
    <p class="big">Every primitive you drilled has a <b class="hl">production twin</b> in real observability stacks. When the design question comes, answer the concept — then say the bridge line. That's the move: show you know the mechanism, then show you know which piece of the stack is quietly running it.</p>

    <div class="impl">
      <div class="dlabel">reset-proof counter rate &rarr; Prometheus rate() / increase()</div>
      <p>The monotonic-counter-plus-reset-rule you built is exactly what <code>rate(http_requests_total[5m])</code> does: detect the drop, count from zero, average per second over the window (with a little extrapolation to the window edges). The bridge line: <b class="hl">never graph a raw counter and never subtract counter samples by hand</b> — the reset rule is why deploy days don't show negative traffic.</p>
    </div>

    <div class="impl">
      <div class="dlabel">bucket quantile estimator &rarr; histogram_quantile() + OTel explicit-bucket histograms</div>
      <p>Your interpolating estimator is <code>histogram_quantile(0.99, sum by (le) (rate(..._bucket[5m])))</code>, and the buckets themselves are OpenTelemetry/Prometheus explicit-boundary histograms. The bridge line: the p99 on the panel is <b class="hl">an interpolation inside one bucket</b> — accuracy is set by boundary placement at instrumentation time, which is why the SLO threshold must be an edge. (Native/exponential histograms are the newer answer: automatic boundaries, better error, same merge property.)</p>
    </div>

    <div class="impl">
      <div class="dlabel">histogram merge &rarr; sum by (le) — and recording rules that keep buckets</div>
      <p>Merging bucket counts across hosts is the <code>sum by (le)</code> in every fleet-latency query, and it's why exporters ship buckets instead of precomputed percentiles. The bridge line: <b class="hl">you can sum counters and merge histograms; you cannot average percentiles</b> — so any pipeline stage that throws away buckets and keeps p99s has destroyed the fleet view forever.</p>
    </div>

    <div class="impl">
      <div class="dlabel">cardinality accounting &rarr; TSDB active-series limits & label policy</div>
      <p>Your series product is what Prometheus calls active series and what every metrics vendor bills by. Real stacks enforce it with label policies in code review, relabeling rules that drop offenders, and per-tenant series limits at ingest. The bridge line: <b class="hl">a label must be enumerable in a design doc</b> — identity (user_id, request_id, raw URL) rides on traces and wide events, with exemplars as the bridge back.</p>
    </div>

    <div class="impl">
      <div class="dlabel">span tree + context propagation &rarr; OpenTelemetry + W3C traceparent</div>
      <p>Spans, parent ids, and the assembly you wrote are OpenTelemetry's data model; the context that keeps a trace alive across hops is the <code>traceparent</code> header — trace id, parent span id, and the sampled flag. The bridge line: <b class="hl">every async boundary is manual until proven instrumented</b> — queues, thread pools, and batch jobs need the context carried as data (message attributes, span links), or the story snaps into two trace ids.</p>
    </div>

    <div class="impl">
      <div class="dlabel">head vs tail sampling &rarr; SDK samplers vs the OTel Collector's tail_sampling processor</div>
      <p>Head sampling is a TraceIdRatioBased sampler in the SDK, propagated via the sampled flag. Tail sampling lives in the Collector: buffer every span of a trace (memory! and all spans must reach the same collector instance), then keep errors, latency outliers, and a baseline slice. The bridge line: <b class="hl">head is cheap and outcome-blind; tail keeps the bodies but is a stateful distributed system you now operate</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">exemplars &rarr; OpenMetrics exemplars, the dots on Grafana panels</div>
      <p>The trace id stapled to a histogram bucket is an OpenMetrics exemplar; Prometheus stores them alongside samples and Grafana renders them as clickable dots on the latency panel. The bridge line: <b class="hl">exemplars are the metric-to-trace handoff</b> — one click from the p99 spike to a waterfall of an actual victim, instead of twenty minutes of timestamp archaeology.</p>
    </div>

    <div class="impl">
      <div class="dlabel">canonical log line / wide events &rarr; Stripe's canonical lines, Honeycomb's events</div>
      <p>One wide, field-rich event per request — accumulated in middleware, emitted in a finally — is Stripe's famous canonical log line, and it's the atom Honeycomb-style tooling is built on. The bridge line: <b class="hl">fields you can query beat strings you grep</b>, and the wide event is what answers the unknown-unknown question via GROUP BY when no dashboard predicted it.</p>
    </div>

    <div class="impl">
      <div class="dlabel">error-preserving log sampling &rarr; ingest pipelines & sampling processors</div>
      <p>Production log pipelines (collector processors, vendor ingest rules) implement exactly your two rules: errors pass unconditionally, the happy path is sampled — ideally by trace id so logs and traces keep the same specimens — with the sample rate stamped on each kept record for query-time reweighing. The bridge line: <b class="hl">cut the crowd, never the bodies</b> — and make every kept record carry its own weight.</p>
    </div>

    <div class="impl">
      <div class="dlabel">SLI/SLO/error budget + burn rates &rarr; the SRE workbook's multi-window alerts, Sloth, Grafana SLO</div>
      <p>The 14.4×/1h+5m and 6×/6h+30m pairs you drilled are the Google SRE workbook's canonical policy, and tools like Sloth or Grafana SLO generate exactly these rules from an SLO definition. The bridge line: <b class="hl">14.4 is derivable — 2% of a 30-day budget in one hour is 0.02 × 720</b>; the AND of a long and short window is what makes pages fast, real, and quick to reset.</p>
    </div>

    <div class="impl">
      <div class="dlabel">symptom vs cause paging &rarr; "page on SLOs, everything else is a ticket"</div>
      <p>The routing you drilled — symptoms page, causes become dashboards and deadline-tickets — is the operating policy of every mature SRE org, encoded in their alertmanager trees. The bridge line: <b class="hl">the symptom set is complete, every cause list is finite</b> — user-pain alerts catch even the failure mode nobody imagined, which is why they own the pager.</p>
    </div>

    <div class="impl">
      <div class="dlabel">deploy correlation &rarr; deploy markers, version labels, canary analysis</div>
      <p>CI emitting markers onto every dashboard, a <code>version</code> label on metrics and events, and automated canary comparison (new version's RED vs old, on 5% of traffic) are the productionized forms of "the release is the prime suspect." The bridge line: <b class="hl">most outages follow a change — make every change queryable and rollback the first mitigation</b>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">telemetry testing &rarr; OTel in-memory exporters + trace-based testing</div>
      <p>The CI assertion you read — drive a request, assert its spans/metrics/events — runs on OpenTelemetry's in-memory exporters (trace-based testing tools productize it). The bridge line: <b class="hl">instrumentation is load-bearing code that only runs for real during a disaster</b> — test the telemetry contract like the API contract, because dashboards and alerts are its consumers.</p>
    </div>

    <div class="qbox" style="margin-top:18px">
      <div class="dlabel">say this out loud</div>
      <p>Observability isn't a vendor — it's <b class="hl">a set of compressions chosen before the incident</b>. Counters and histograms compress events (mergeable by construction); traces compress request structure (sampled, so choose head or tail deliberately); wide events keep the dimensions for questions nobody predicted. Alert on the user's promise via burn rates, page on symptoms, treat every deploy as the prime suspect, and audit after every incident: which question couldn't we answer, and what telemetry would have answered it? The tools keep changing; those jobs don't.</p>
    </div>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "stackmap",
    label: "stack map",
    type: "sheet",
    eyebrow: "reference · design-review bridge",
    title: "The stack map",
    lead: "Every concept in this course, mapped to the construct that embodies it in a real observability stack — and the one sentence that bridges your theory answer to the system the interviewer's company actually runs.",
    html: mapHtml,
  });

  /* =========================================================
     2. QUIZ — four more incidents for the 3am pool
     ========================================================= */
  QUIZ.push(
    { code:`// 09:14 - the db starts refusing 20% of queries.
// 09:16 - traffic TO the db has tripled, latency is
// 10x, and now ~90% of queries fail.
// clients use retry-on-error, 3 attempts, no backoff`,
      options:["a retry storm: every failure mints more attempts, the extra load deepens the failure, and the loop feeds itself — the tell is traffic RISING during an incident",
               "an attacker picked this moment — organic traffic doesn't triple in two minutes",
               "the db is failing harder on its own; the traffic rise is a coincidence of peak hours"],
      answer:0,
      whys:[
        "Right. 20% failure x 3 attempts turns each user request into up to 3 db calls — the db sees multiplied load precisely when it's sickest, fails more, and earns even more retries. Traffic rising DURING an incident is the signature; the fixes are upstream: exponential backoff with jitter, retry budgets, circuit breaking.",
        "Check the composition first: retried requests carry the same routes, the same users, the same shapes as the failing traffic — an attack brings new shapes. The multiplier in your own client config is the far more common villain, and it deploys itself with every incident.",
        "The causality runs the other way, and the timeline says so: failures began at 09:14, the traffic rise followed at 09:16. Your dashboards can show this directly if error rate and request rate share a panel — which is exactly why RED puts them together."] },

    { code:`// a burst of slowness lasted exactly 90 seconds.
// the p99 panel is built on rate(bucket[5m]).
// on-call: "the graph shows a gentle bump, half the
// height the incident felt like. was it real?"`,
      options:["it was real and worse than the panel shows — a 5m window averages the 90-second burst with 3.5 minutes of healthy traffic; the compression is the panel's, not reality's",
               "if the panel shows half the spike, half the spike is what happened — the histogram doesn't lie",
               "the TSDB dropped samples during the burst; re-query with backfill"],
      answer:0,
      whys:[
        "Right. Every windowed rate is a low-pass filter: bursts shorter than the window get diluted by the healthy seconds around them. The histogram counted every slow request faithfully — the QUERY averaged them with calm traffic. Zoom the window down (or check burst-sensitive signals like max latency or the trace store) before declaring an incident 'minor'.",
        "The histogram doesn't lie, but rate(x[5m]) answers a different question than 'how bad was the worst 90 seconds' — it answers 'what was the average over each 5 minutes'. Confusing the two systematically under-grades every short incident, which is how real user pain gets closed as 'blip'.",
        "Nothing was dropped — all the samples are there, feeding the average that diluted them. Blaming the storage for a windowing artifact sends you debugging the pipeline while the actual lesson (know your panel's window before trusting its shape) goes unlearned."] },

    { code:`// a trace: root span 900ms.
// its children: auth 40ms + cart 60ms + charge 110ms
// = 210ms of instrumented work.
// where did the other 690ms go?`,
      options:["into the gaps — time nobody instrumented: queueing before handlers, serialization, connection pools, GC pauses, code between spans. The trace shows where you LOOKED, not where time went",
               "the root span's clock is wrong — children must sum to the parent's duration",
               "the missing time is network latency, which tracing fundamentally cannot see"],
      answer:0,
      whys:[
        "Right. A span only measures code someone wrapped. The 690ms lives between and around the spans — the middleware you didn't wrap, the pool you waited on, the GC pause, the queue before the handler. Gaps in a waterfall are the instrumentation TODO list, and 'sum of children is much less than parent' is the standard way you find it.",
        "Children sum to the parent only when the parent does nothing itself and the children cover it perfectly — neither is typical. Parents legitimately have self-time; the diagnostic isn't 'the clock is wrong', it's 'what is the parent doing during those uninstrumented stretches?'",
        "Network time is very visible to tracing — it's the gap between a client span's start and the server span's start (clock skew caveats aside). Declaring 690ms 'invisible' writes off exactly the investigation the waterfall exists to trigger."] },

    { code:`// customer: "checkout takes 3+ seconds."
// your server-side histogram: p99 = 310ms, green.
// both measurements are correct.`,
      options:["they measure different journeys — the server histogram starts when the request reaches your handler; the customer's 3s includes DNS, TLS, LB queueing, retries, and the mobile network. Measure at the user's edge or you're grading your own homework",
               "the customer's network is their problem — the service is meeting its SLO",
               "one of the two numbers must be wrong; instrument both again and compare"],
      answer:0,
      whys:[
        "Right. Every latency number is defined by where the clock starts and stops. Server-side histograms can't see the load balancer's accept queue, connection setup, or the client's retry that doubled everything. This is why serious SLOs measure as close to the user as possible (edge, synthetic probes, RUM) — and why 'p99 green, users angry' is a measurement-point bug, not a mystery.",
        "The SLO was supposed to encode user experience — if it's green while users wait 3 seconds, the SLI is measuring the wrong journey, and 'meeting it' is a bookkeeping victory. The fix is moving the measurement, not dismissing the report.",
        "Both numbers can be simultaneously true — they clock different segments of the same journey. 'Re-instrument and compare' without changing WHERE you measure will reproduce the same disagreement with more decimal places."] },
  );

  /* =========================================================
     3. CARDS — six flashcards (checked against content.js's
        fourteen to avoid duplicates)
     ========================================================= */
  CARDS.push(
    ["A vendor demo shows beautiful dashboards. What do you ask before signing?",
     "The compression questions: what happens to high-cardinality fields (per-value series, or event columns?), can you merge histograms across hosts or only average precomputed percentiles, is trace sampling head or tail and who buffers, do errors survive log sampling, and can you get from a metric spike to a trace in one click (exemplars)? Dashboards are the output; the compressions underneath decide what 3am looks like."],
    ["Interviewer: 'Design observability for a new payments service.' First four sentences?",
     "RED metrics per route with histogram boundaries at the SLO thresholds, emitted by middleware. One canonical wide event per request — trace id, version, customer tier — for the unknown-unknowns. Tracing with context propagated through the queue, tail-sampled so errors and slow traces always survive. One symptom page: multi-window burn rate on the SLO; everything else is dashboards and deadline tickets."],
    ["When is MORE telemetry the wrong answer?",
     "When the existing telemetry is unreadable: pages that aren't actionable, WARN-level noise nobody consumes, twenty dashboards and no SLO. Volume without routing worsens the signal-to-noise that's already failing. Fix consumption first — symptom paging, canonical lines, an actionability review — then add emission where the triage loop went blind."],
    ["The client says 3 seconds; your server histogram says 310ms. Who's lying?",
     "Nobody — the clocks start in different places. Server-side timing misses DNS, TLS, the load balancer's queue, client retries, and the mobile network. Latency numbers are meaningless without their measurement point; user-facing SLOs measure at the user's edge (or via RUM/synthetics), because the journey users experience is the only one they grade."],
    ["When is 100% trace sampling the right call?",
     "When traffic is small enough that the math says so: a service doing 5 rps generates trivial span volume, and the debugging value of every-trace-present beats the pennies saved. Also during launches, migrations, and incident investigations (temporarily raise the rate). Sampling exists to control cost at scale — at low scale, blanket coverage is the bargain."],
    ["The CFO says observability costs 15% of the infra bill. Where do you cut without going blind?",
     "In cost order: log sampling with error preservation (the happy path is the bulk), tail sampling or lower head rates for traces (metrics carry the aggregates), cardinality triage on metrics (drop identity labels, template the paths), retention tiers (traces days, metrics months). Never cut: error events, SLO metrics, deploy markers. Cut crowd, keep evidence — and measure the bill per signal so the next conversation is arithmetic."],
  );

})();
