"use strict";
/* Observability Bootcamp — authored content: course config, module registry,
   quiz, drills, flashcards, spot-the-bug cards, write-it exercises, lessons,
   cross-links.

   CONTENT PACKS: js/packs/*.js load AFTER this file and BEFORE the shared
   engine (../js/app.js). A pack appends content by pushing into these
   collections (LESSONS, QUIZ, DRILLS.<module>, CARDS, BUGHUNT, WRITE, MODULES)
   and registering cross-links in DRILL_LESSON / LESSON_PRACTICE.

   LESSON PLAN (final indices — the lesson packs MUST keep this order):
     content.js  0-9    foundations (0-3) + metrics (4-9)
     pack 10     10-18  tracing (10-14) + logging (15-18)
     pack 20     19-28  SLOs & alerting (19-23) + debugging production (24-27)
                        + verifying observability (28)
   Cross-links below reference these final indices. */

/* course config: the engine reads storage keys and defaults here */
const COURSE = {
  id: "observability",
  storagePrefix: "obs",
};

const MODULES = [
  { id:"learn", label:"lessons", type:"learn" },
  { id:"signals", label:"the 3am test", type:"lesson",
    eyebrow:"module 00", title:"The 3am test", conceptLesson:0,
    cardNote:"predict what you'd see",
    poolTitle:"Read the incident", poolQuestion:"What do the signals actually show?",
    lead:`Two axioms generate this whole field: you <b style="color:var(--text)">can't attach a debugger to production</b> — you can only interrogate telemetry you emitted in advance — and <b style="color:var(--text)">aggregates lie</b> — every metric is a lossy compression, and you must know what was thrown away. Every question here is an incident: predict what the dashboards, alerts, and traces show before you tap.`,
    sub:`Predict each outcome before you tap. One at a time — answer, read why, then step on.` },
  { id:"primitives", label:"primitives", type:"drills",
    eyebrow:"module 01", title:"Build the telemetry stack",
    lead:`Reset-proof counter rates, bucket quantile estimators, histogram merges, trace assemblers, samplers, burn-rate math, canonical log lines, cardinality accounting. Each is a small rule that keeps the signals honest while production misbehaves. Choose the correct line at each decision point, then run the reference to watch the invariant hold.` },
  { id:"incident", label:"incident sim", type:"sim", renderFn:"renderIncidentSim",
    eyebrow:"module 02", title:"The incident simulator", conceptLesson:24 },
  { id:"tradeoffs", label:"trade-offs", type:"cards",
    eyebrow:"module 03", title:"Trade-offs", conceptLesson:1,
    lead:`No code here — just the judgment calls that separate wiring up a dashboard from designing observability. Tap to flip, then advance. Rehearse until they're reflexive.` },
  { id:"bank", label:"problem bank", type:"drills",
    eyebrow:"module 04", title:"Problem bank",
    lead:`The on-call decisions built on the primitives — which signal answers the question, which hop to blame, where the bucket boundaries go, which alert design pages for real outages only, what to shed when cardinality melts the bill. State the invariant in your head before you choose.` },
  { id:"bughunt", label:"spot the bug", type:"bugs",
    eyebrow:"module 05", title:"Spot the bug",
    lead:`A full telemetry component — the rate calculator, the quantile estimator, the sampler, the burn-rate alert — with one scenario describing how it misbehaves in production and one subtle fault hiding in the implementation. Read the whole thing, tap the buggy line(s), then check.`,
    sub:`Reading real instrumentation and finding the fault is the actual job. One implementation at a time — read the symptom, scan the code, pick the line(s), then check.` },
  { id:"write", label:"write it", type:"write",
    eyebrow:"module 06", title:"Write it",
    lead:`No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the implementation, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.`,
    sub:`This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. A runaway loop just times out — the sandbox can't freeze the page.` },
  { id:"test", label:"test yourself", type:"test",
    eyebrow:"test yourself", title:"Test mode",
    lead:`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`,
    sub:`Prep tip: once you can pass these cold, rebuild each pattern in a blank file while talking it through out loud — that's the skill the interview actually grades.` },
];

/* ---- signals module: read-the-incident quiz ---- */
const QUIZ = [
  { code:`// checkout latency dashboard, 10:24
//   p50:  210ms  — flat all day
//   p99:  480ms -> 950ms over 20 minutes
//   mean: 228ms -> 241ms  ("basically fine")`,
    options:["a small slice of requests got dramatically slower — a tail problem (one shard, one dependency, one retry path); the mean dilutes it and the p50 will never see it",
             "the histogram must be corrupted — if p99 doubled, the p50 and the mean have to move with it",
             "only ~1% of requests are affected, so this can wait for business hours"],
    answer:0,
    whys:[
      "Right. Percentiles are independent cuts of the distribution: the slowest 1% can double while the median doesn't move a millisecond. A flat p50 with a climbing p99 is the classic signature of a minority path — one bad host, one slow dependency, lock contention past a threshold. The mean is the worst of the three: it averages the pain away.",
      "Nothing is corrupted — this is what distributions DO. The p50 answers 'what does the typical request see?' and the p99 answers 'what do the unlucky see?'. They move independently, which is exactly why you keep both; a system that only charted the mean would call this incident invisible.",
      "1% of requests is your biggest customers (more data, more fan-out) and everyone behind a fan-out: a page that touches 50 backends experiences the p99 of SOMETHING on ~40% of loads. Tail latency compounds; 'only the tail' is how it starts, not how it ends."] },

  { code:`// panel: raw value of http_requests_total, plus an
// alert on (value_now - value_5m_ago)
// 14:02 — a deploy rolls all 6 pods
// 14:03 — dashboard shows RPS at -3,400/s`,
    options:["counters reset to zero when a process restarts — the raw difference goes negative on every deploy; rate() detects the drop and treats it as a restart, so nothing real changed",
             "traffic genuinely reversed — clients cancelled ~3,400 requests per second during the rollout",
             "the TSDB lost the samples during the deploy and is interpolating garbage"],
    answer:0,
    whys:[
      "Right. A counter is cumulative per process: new process, new counter, starting at 0. last-minus-first across a restart is a large negative number. rate()/increase() exist precisely for this — a decrease can only mean reset, so they count the post-restart value as the increase from zero. The dashboard bug is doing counter math by hand.",
      "Requests can't un-happen — a monotonic counter never legitimately goes down. Negative 'RPS' is always an artifact of the query, and 'it happens at every deploy' is the fingerprint: restarts reset counters.",
      "The samples are all present and correct — 1300 then 70 is exactly what the two processes reported. The lie is in the arithmetic layered on top. Blaming the database for a query bug costs you the afternoon."] },

  { code:`// PR review: http_requests_total gains a new label
//   user_id  (the service has ~2M monthly users)
// "it'll make per-user debugging so much easier"`,
    options:["every active user mints new time series (multiplied by every existing label combo) — TSDB memory and the bill explode, queries crawl; per-user questions belong in traces and wide events",
             "it's one more field on the metric — storage grows a little per request, like adding a column",
             "approve it: only users who actually appear create series, so the cost is proportional to traffic"],
    answer:0,
    whys:[
      "Right. A time series exists per distinct label-set, and series are the unit of cost: each one is an indexed, in-memory entity with its own samples. 2M users multiplied by the existing method × path × status combinations is on the order of billions of series (2.8 billion at this course's label counts) — that's a TSDB outage, not a feature. High-cardinality identity goes in events/traces, where each value is a field on a row, not a new row forever.",
      "Metrics aren't rows — they're series. A label isn't a column on existing data; every new VALUE creates a new series with its own index entry and sample stream. The cost model is multiplicative (product of label cardinalities), and that's the single most expensive misunderstanding in observability.",
      "Even 'only' 50k active users multiplied by the existing labels is millions of series — and churn makes it worse: every new user is a permanent index entry. The bill arrives monthly; the query slowdown arrives immediately."] },

  { code:`// 40 hosts each export their own p99.
// fleet panel: avg(p99) = 310ms.
// one canary host: p99 = 2,900ms.
// SLO: p99 < 500ms — "we're compliant"`,
    options:["the panel is fiction — percentiles don't average; the canary drowns in the mean of 40 numbers, and the fleet 'meets' an SLO that real users on that host are violating. Merge the histograms, then take the quantile",
             "avg(p99) is a reasonable approximation as long as the hosts get roughly equal traffic",
             "use max(p99) across hosts instead — that's the honest fleet number"],
    answer:0,
    whys:[
      "Right. A percentile is a property of one distribution; the average of 40 of them is a property of nothing. The only valid path is to aggregate the raw distributions — sum the histogram buckets (bucket counts add exactly), then compute the quantile of the merged result. That fleet p99 will show the canary's damage in proportion to its traffic.",
      "Equal traffic doesn't rescue it: avg(p99) weights each HOST equally, but the fleet p99 is about REQUESTS. 39 healthy hosts at 240ms and one at 2,900ms average to 306 — while ~2.5% of all requests (everything on the canary) are catastrophically slow, which is exactly what a fleet p99 must surface.",
      "max(p99) answers 'how bad is the worst host?' — useful for a different panel, wrong for the SLO: one idle host that served 3 requests, one of them slow, pins the fleet number forever. You want the distribution over all requests, and only merged histograms give you that."] },

  { code:`// alert: error_rate > 1% for 5m -> page
// 03:12, traffic: ~2 req/min on this service
// one bot request hits a broken redirect: 500
// last 5 minutes: 9 requests, 1 error`,
    options:["the page fires on an 11% 'error rate' that is one failed bot request — at low traffic, ratios are noise; a burn-rate alert over windows sized to the SLO (1h AND 5m) would stay quiet",
             "the page is right to fire: 11% is 11%, and an error rate that high is an outage at any volume",
             "keep the static alert but raise the threshold to 50% so it stops paging at night"],
    answer:0,
    whys:[
      "Right. A ratio over 9 requests has a granularity of 11 points — one request swings it past any reasonable threshold. Burn-rate alerting fixes this structurally: the 1-hour window has enough volume that one bot can't move it past 14.4× budget, and the page requires BOTH windows. The 3am page that wakes a human for one bot request is how on-call rotations die.",
      "Impact is users × severity, and this is one bot. 'A rate is a rate' ignores that rates estimated from tiny samples are mostly variance — the same alert at daytime traffic needs ~1% of thousands of requests to fire. An alert that means different things at different hours is not a signal.",
      "Now it's deaf: at daytime volume a REAL 20% outage — thousands of failing requests — never crosses 50%. Tuning a broken shape just moves which incident it lies about. The fix is an alert whose windows carry enough volume to mean something, not a bigger constant."] },

  { code:`// checkout publishes to a queue; a worker charges cards.
// trace for a stuck order: edge -> api -> queue.publish …
// and the trace ENDS. the worker's spans exist,
// but under a completely different trace id.`,
    options:["context wasn't propagated through the message — the worker started a fresh trace; carry the traceparent in the message headers and start the consumer span with that parent",
             "tracing can't cross an async boundary — a queue always terminates the trace, by design",
             "the collector dropped the worker's spans; fix the export pipeline and the trace will connect"],
    answer:0,
    whys:[
      "Right. Trace context is just data — a trace id + parent span id (the W3C traceparent) that every hop must copy forward. HTTP auto-instrumentation does it in headers for free, which is why it feels automatic — until a queue, a thread pool, or a batch job breaks the chain. Stuff the traceparent into message metadata at publish, extract it at consume, and the stuck order reads as one story again.",
      "Queues terminate traces only when nobody carries the context across. Async links are bread-and-butter tracing (span links / remote parents exist for exactly this); 'by design' here is learned helplessness — the design is a header you forgot to forward.",
      "The spans arrived fine — they're right there under a different trace id, which is the tell: a dropped export leaves a GAP in the same trace, not a second trace. A fresh id means the worker's instrumentation found no incoming context and minted its own."] },

  { code:`// head sampling: keep 1% (hash of trace id at ingress).
// incident: 0.2% of requests fail on one code path.
// on-call opens the trace UI: "show me failing traces"`,
    options:["expect ~1 sampled failure per 50,000 requests — head sampling decided before the outcome existed, so failures get no preference; tail sampling keeps the errors because it decides after seeing them",
             "1% of all traces includes 1% of the failures, and 1% of the failures is plenty to debug with",
             "sampling only affects metric accuracy — the trace store always keeps errors regardless"],
    answer:0,
    whys:[
      "Right. Head sampling is a coin flip at the front door: it can't favor errors it hasn't seen yet. Failing AND sampled is 0.2% × 1% = one in 50,000 requests — at 100 rps that's one specimen every ~8 minutes, and probably not from the customer whose ticket you're holding. Tail sampling buffers the trace, sees the error flag, and keeps 100% of them.",
      "The arithmetic is the trap: 1% of a 0.2% slice is 0.002% of traffic. 'Plenty' assumes failures are common; the failures that page you at 3am are usually rare, specific, and exactly what an outcome-blind sampler throws away.",
      "There is no 'regardless' — the trace store holds what the sampler exported, and a pure head sampler exports a hash-based slice with no error bias. Believing errors are always kept is how teams discover, mid-incident, that their tracing is a random photo album."] },

  { code:`// postmortem finding: for the hour before checkout
// went down, the connection pool logged
//   WARN pool exhausted, queueing caller
// 9,400 times. nobody saw a single one.`,
    options:["WARN is where signals die — nobody pages on it and nobody reads it in time; promote the condition to a metric (pool saturation gauge) with an alert, and reserve log levels for humans reading AFTER detection",
             "the fix is paging on every WARN line so this can't happen again",
             "the on-call should have been watching the logs — process failure, not instrumentation failure"],
    answer:0,
    whys:[
      "Right. A log line is a record, not a signal: it has no threshold, no window, no pager. A condition that predicts an outage (saturation!) must exist where alerting lives — as a metric with a burn or saturation alert. The postmortem action item isn't 'read more logs'; it's 'this failure mode was telemetry-visible but not alert-visible.'",
      "Page-on-WARN turns 9,400 lines into 9,400 pages — every retry, every deprecation, every transient blip. Within a week the pages are muted and you're worse off than before. Logs are too cheap to write to be worth waking humans per-line; that's what aggregation into metrics is FOR.",
      "Humans don't watch logs, and a process that depends on them doing so has designed its own failure. 9,400 identical lines in an hour is a firehose no operator reads in real time — detection is the machine's job (metrics + alerts); logs are for the human who arrives afterwards asking why."] },

  { code:`// memory gauge, scraped every 60s. OOM kill at 14:31:40.
//   14:31:00 -> 61%
//   14:32:00 -> (pod gone)
// "memory looked fine right before the crash"`,
    options:["a gauge is a snapshot at scrape instants — the 30-second spike between scrapes is invisible; the allocation burst happened and finished entirely inside the gap, so the panel can't testify either way",
             "memory truly was fine at 61% — the OOM must be a container limit misconfiguration",
             "scrape every 5 seconds instead — then the gauge can't miss a spike like this"],
    answer:0,
    whys:[
      "Right. Gauges don't accumulate between scrapes; whatever happens between two samples never existed as far as the TSDB knows. Counters survive the gap (the count is cumulative), gauges don't. For point-in-time death like OOM you want the evidence that CAN'T be missed: the kernel's OOMKilled reason on the pod, restart counters, and an allocation-size histogram if you need the shape.",
      "'Fine at the last scrape' and 'fine' are different claims — that's the whole lesson. 61% at 14:31:00 says nothing about 14:31:39. Redefining the incident as a limits problem because the sampled curve looked calm is exactly the aggregate-shaped lie this course is about.",
      "5s scrapes shrink the blind spot 12× and multiply your sample volume 12× — and a 2-second allocation burst still vanishes. Sampling faster never closes a sampling gap; it just makes the gap smaller than the failures you've met so far."] },

  { code:`// SLO 99.9% over 30 days (43.2 min error budget).
// 14:00 — bad config: 100% of requests failing.
// page rule: burn > 14.4 on 1h AND 5m windows.
// when does the page fire?`,
    options:["in about a minute — the 5m window crosses instantly and the 1h window needs only ~52s of total failure to average past 1.44% (burn 14.4); the full budget would die in 43 minutes",
             "not for an hour — the 1-hour window can't say anything until it contains an hour of the incident",
             "never — 100% failure for under 43.2 minutes still fits inside the monthly budget"],
    answer:0,
    whys:[
      "Right. A windowed rate doesn't wait to 'fill': the 1h window is an average over the last hour, and 52 seconds of 100% failure pushes that average to 52/3600 ≈ 1.44% — which is exactly 14.4× the 0.1% budget. Both windows over the line → page. That's the design: the worse the burn, the faster the long window crosses.",
      "The window is a denominator, not a queue — it always contains the last hour, mostly-healthy or not. Waiting an hour to page on total failure would make burn-rate alerting strictly worse than a naive threshold; in fact its whole point is that severity sets the speed.",
      "The budget is an allowance for the MONTH, not a free pass per incident — spend it all in one 43-minute fire and every future blip that month is an SLO violation. Burn-rate alerting exists to page you at minute one, while there's still budget left to protect."] },

  { code:`// 15:10 — p99 spike on the latency histogram panel.
// you need ONE slow request's full story, fast.
// the histogram buckets carry exemplars.`,
    options:["click the exemplar — it's a real trace id captured when that bucket was incremented, a direct bridge from the aggregate spike to a concrete slow trace",
             "grep the logs for the spike's timestamp and reconstruct a slow request from the lines",
             "open the trace UI and search duration > 2s — same thing, no exemplars needed"],
    answer:0,
    whys:[
      "Right. An exemplar is the anti-aggregation escape hatch: when a request lands in a bucket, its trace id is (sometimes) attached to that bucket. So the spike on the panel carries live pointers to actual victims — one click from 'p99 went up' to 'here is the waterfall of a request that made it go up.' This is the two axioms shaking hands: the aggregate detects, the exemplar de-compresses.",
      "The timestamp matches thousands of interleaved requests, and log lines don't sort by slowness unless you logged durations and correlate by request id — a 20-minute forensic project for what the exemplar answers in one click. Grep is where you go when the bridge doesn't exist.",
      "Only works if slow traces survived sampling — under head sampling most didn't, and you'll 'discover' there were no slow requests. And even among survivors, a duration search is unanchored guesswork (slower than what, in which window?), while an exemplar is a bucket-targeted pointer from the exact panel and spike you're staring at. Pair exemplars with tail or error-biased sampling and the dots on your worst buckets are nearly always live."] },

  { code:`// two alert candidates for the same service:
//  A: page on user pain — SLO burn on errors + latency
//  B: page on db CPU > 90%, cache hit < 70%,
//     queue depth > 10k, pod restarts > 3
// which set pages, which set doesn't?`,
    options:["A pages, B becomes dashboards and tickets — page on symptoms (users hurting), consult causes during diagnosis; cause-based pages fire on states that often hurt nobody",
             "B pages — catching the cause early means users never see the symptom at all",
             "both page — redundancy means nothing slips through"],
    answer:0,
    whys:[
      "Right. Symptom alerts inherit their meaning from users: if the SLO is burning, someone real is having a bad time, whatever the cause; if it isn't, no page — whatever the CPU says. Cause conditions (hot CPU, cold cache) are invaluable ANSWERS once you're looking, which is what dashboards and ticket queues are for. Every page should mean 'a human must act now.'",
      "The early-warning dream dies on specificity: db CPU pins at 90% every peak hour harmlessly, caches run cold after every deploy by design. Cause alerts can't know whether users are affected — so they page for states, on-call learns most pages are noise, and the one real page gets the reflexive ack-and-snooze.",
      "Redundancy in paging is subtraction, not addition: when A fires, B's four sympathetic pages arrive with it, burying the signal in its own echo at the exact moment focus matters. Alert fatigue is a system failure — every duplicate page spends the on-call's trust, and trust is the pager's only currency."] },
];

/* ---- drill definitions (fill the blank) ---- */
const DRILLS = {
  primitives:[
    { id:"counterrate", title:"Reset-Proof Counter Rate", why:"deploys restart processes; the rate must not care", demo:demoCounterRate,
      pre:`// samples: [{t, v}] — cumulative counter values a scraper
// collected. a deploy restarted the process mid-window:
//   1000 -> 1300 -> 70 -> 370
function increase(samples) {
  let inc = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].v - samples[i - 1].v;`,
      blank:{ q:"The scrape after the deploy reads 70, down from 1300. Which body keeps the increase truthful through the restart?",
        options:[
`    inc += d >= 0 ? d : samples[i].v;`,
`    inc += d;`,
`    inc += Math.max(0, d);`],
        answer:0,
        whys:["Right. A counter can't go down — a drop can only mean the process restarted and began counting again from zero, so the post-reset sample IS the increase since the reset. This is exactly what rate()/increase() do; it's why counters are monotonic in the first place.",
              "Raw deltas ship the lie straight to the dashboard: 70 − 1300 = −1230, and the panel shows negative RPS at 14:02 every deploy day. Worse, the alert on 'rate < X' fires on arithmetic, not on traffic.",
              "Clamping to zero hides the negative but silently deletes the 70 requests the new process already served — every deploy window undercounts, and your busiest deploy days look mysteriously quiet. The post-reset value isn't noise to discard; it's the count since zero."] },
      post:`  }
  return inc;
}` },

    { id:"histquantile", title:"Bucket Quantile Estimator", why:"the p99 on your dashboard is an interpolation — know its rules", demo:demoHistQuantile,
      pre:`// counts[i] = observations in (bounds[i-1], bounds[i]];
// the last slot is the +Inf bucket. mirror of
// histogram_quantile(): find the bucket, then estimate.
quantile(q) {
  const rank = q * this.total;
  let cum = 0;
  for (let i = 0; i < this.counts.length; i++) {
    const prev = cum;
    cum += this.counts[i];
    if (cum >= rank && this.counts[i] > 0) {
      if (i >= this.bounds.length)
        return this.bounds[this.bounds.length - 1];  // +Inf
      const lo = i === 0 ? 0 : this.bounds[i - 1];
      const hi = this.bounds[i];`,
      blank:{ q:"The rank lands inside a bucket that only knows its edges. Which return gives histogram_quantile()'s answer?",
        options:[
`      return lo + (hi - lo) * ((rank - prev) / this.counts[i]);`,
`      return hi;`,
`      return lo + (hi - lo) * (rank / cum);`],
        answer:0,
        whys:["Right. Linear interpolation: how deep into this bucket's count does the rank sit, mapped onto the bucket's width. It assumes observations spread evenly inside the bucket — a documented fiction, which is why boundary placement decides accuracy and why the estimate can name a latency no request ever had.",
              "Returning the upper bound makes every quantile snap to a boundary: the dashboard shows plateaus and cliffs, p99 'jumps' from 500 to 1000 with no traffic change, and small regressions hide inside a bucket until they burst through its edge. Real histogram_quantile interpolates precisely to avoid this staircase.",
              "rank/cum is the rank's depth into ALL observations so far, not into THIS bucket — quantiles skew low in early buckets and the error changes shape whenever traffic shifts between buckets. The fraction must be (rank − prev) / counts[i]: this bucket's share only."] },
      post:`    }
  }
}` },

    { id:"histmerge", title:"Fleet Percentile", why:"40 hosts, one honest p99 — there is exactly one valid path", demo:demoHistMerge,
      pre:`// hosts: per-host Histograms with IDENTICAL bounds.
// wanted: the fleet-wide p99 across every request.
function fleetP99(hosts) {`,
      blank:{ q:"One canary host is 6× slower than the rest. Which body produces a fleet p99 that real requests actually experienced?",
        options:[
`  const m = new Histogram(hosts[0].bounds);
  for (const h of hosts) {
    h.counts.forEach((c, i) => m.counts[i] += c);
    m.total += h.total;
  }
  return m.quantile(0.99);`,
`  const p99s = hosts.map(h => h.quantile(0.99));
  return p99s.reduce((a, b) => a + b) / p99s.length;`,
`  return Math.max(
    ...hosts.map(h => h.quantile(0.99)));`],
        answer:0,
        whys:["Right. Bucket counts are just counts — they add exactly, host by host, and the quantile of the merged distribution is the fleet's truth weighted by real traffic. This is the entire reason histograms (not precomputed percentiles) are what services export.",
              "The average of 40 p99s is a property of no distribution — the canary's 2,900ms drowns among 39 healthy numbers and the panel reports a latency nobody had. 'You can't average percentiles' isn't a style rule; the math simply doesn't commute.",
              "max() answers 'how slow is the worst host?' — a fine capacity panel, but as the fleet p99 it lets one idle host that served three requests (one slow) pin the number forever, and it can't weight by traffic. The SLO is about requests, so the aggregation must be too."] },
      post:`}` },

    { id:"traceassemble", title:"Trace Assembler", why:"spans arrive in any order; the tree comes from parent ids", demo:demoTraceAssemble,
      pre:`// spans: {id, parent, name, start, end} — exporters ship
// children before parents constantly (children END first).
function buildTrace(spans) {
  const nodes = new Map(
    spans.map(s => [s.id, { ...s, children: [] }]));
  let root = null;
  for (const s of nodes.values()) {`,
      blank:{ q:"The db span arrives first, the request root arrives last. Which wiring reassembles the tree no matter the order?",
        options:[
`    if (s.parent == null) root = s;
    else if (nodes.has(s.parent))
      nodes.get(s.parent).children.push(s);`,
`    if (s === nodes.values().next().value) root = s;
    else nodes.get(s.parent).children.push(s);`,
`    if (s.parent == null) root = s;
    else nodes.get(s.parent).children.push(s);`],
        answer:0,
        whys:["Right. The root is the span with NO parent — a structural fact, immune to arrival order — and children attach by parent id, guarded against parents that never arrived (dropped spans happen). The tree is data; the ordering is noise.",
              "First-arrived-as-root is the classic prod-only bug: in dev, spans export tidily and the root happens to come first; under load, a child that finished early arrives first and gets crowned — the UI shows db.query as the 'request' with the real request dangling under it.",
              "One dropped or still-in-flight parent span and nodes.get(s.parent) is undefined — the assembler throws, and one lost UDP packet takes the whole trace view down with it. Orphans are a fact of exporters; the guard is what lets the rest of the tree still render."] },
      post:`  }
  for (const s of nodes.values())
    s.children.sort((a, b) => a.start - b.start);
  return root;
}` },

    { id:"headtail", title:"Deterministic Head Sampler", why:"one trace, one verdict — on every service independently", demo:demoHeadTail,
      pre:`// keep ~1 trace in 100 at ingress. every service that
// touches the trace must reach the SAME decision without
// asking anyone.
class HeadSampler {
  constructor(rate) { this.rate = rate; }
  keep(span) {`,
      blank:{ q:"A trace fans out across five services. Which decision keeps whole traces — never fragments?",
        options:[
`    return fnv1a(span.traceId) % 10000
        < this.rate * 10000;`,
`    return Math.random() < this.rate;`,
`    return fnv1a(span.id) % 10000
        < this.rate * 10000;`],
        answer:0,
        whys:["Right. Hash the TRACE id: every span of a trace shares it, so every service computes the same verdict independently — no coordination, no fragments, and the kept 1% is a stable pseudo-random slice you can reason about. (In practice the decision rides the traceparent's sampled flag so downstream doesn't even recompute.)",
              "A coin flip per span keeps 1% of SPANS, not 1% of traces: every stored trace is full of holes — parents without children, children floating without parents — and the waterfall view is unreadable. Sampling is a per-trace property; randomness per span breaks the unit of debugging.",
              "span.id is unique per span — hashing it is the same fragmentation as the coin flip, just deterministic about it. The one-character difference (span.id vs span.traceId) is invisible in review and catastrophic in the trace store; it's the sampler bug worth memorizing."] },
      post:`  }
}` },

    { id:"burnrate", title:"Burn-Rate Calculator", why:"how many times faster than budget is the promise dying?", demo:demoBurnRate,
      pre:`// slo = 0.999 -> budget rate = 0.001 (0.1% may fail).
// burn = errRate / (1 - slo):
//   burn 1 = exactly on budget (30-day budget lasts 30 days)
//   burn 14.4 = 2% of the monthly budget per hour
function evaluateBurn(w, slo) {   // w = windowed error rates
  const b = (r) => r / (1 - slo);`,
      blank:{ q:"Which condition pages fast on real fires, quiets after recovery, and never pages on a 90-second blip?",
        options:[
`  if (b(w.h1) > 14.4 && b(w.m5) > 14.4)
    return "page";
  if (b(w.h6) > 6 && b(w.m30) > 6)
    return "page";
  return null;`,
`  if (b(w.h1) > 14.4 || b(w.m5) > 14.4)
    return "page";
  if (b(w.h6) > 6 || b(w.m30) > 6)
    return "page";
  return null;`,
`  if (b(w.m5) > 14.4) return "page";
  return null;`],
        answer:0,
        whys:["Right. AND is the design: the long window (1h/6h) proves the burn is statistically real, the short window (5m/30m) proves it's STILL happening — so you page fast when it's serious, you don't page on blips the long window never confirms, and the alert resets promptly after recovery instead of dragging an hour of stale errors behind it.",
              "OR pages whenever EITHER window twitches: every 90-second blip trips the 5m window (burn math on five minutes is jumpy), and after a real incident ends the 1h window keeps paging for most of an hour on errors that already stopped. The AND isn't caution — it's what makes the alert mean 'burning now, and it's real.'",
              "A lone 5m window is a nervous static threshold in disguise — it pages on every transient spike and carries no memory: a slow 8% burn that never spikes the 5-minute rate sails underneath forever. The multi-window pairs exist because no single window can be both fast and sure."] },
      post:`}` },

    { id:"canonlog", title:"Canonical Log Line", why:"one wide event per request — especially the request that died", demo:demoCanonLog,
      pre:`// middleware: accumulate fields during the request, emit
// exactly ONE wide event when it ends — whatever happens.
wrap(handler) {
  return (req) => {
    const canon = { route: req.route, request_id: req.id,
                    started: this.now() };
    const set = (k, v) => { canon[k] = v; };`,
      blank:{ q:"The handler can return or throw. Which body guarantees exactly one complete event either way?",
        options:[
`    try {
      const out = handler(req, set);
      canon.status = out.status;
      return out;
    } catch (e) {
      canon.status = 500; canon.error = e.message;
      throw e;
    } finally {
      canon.duration_ms = this.now() - canon.started;
      this.emit(canon);
    }`,
`    const out = handler(req, set);
    canon.status = out.status;
    canon.duration_ms = this.now() - canon.started;
    this.emit(canon);
    return out;`,
`    try {
      const out = handler(req, set);
      canon.status = out.status;
      return out;
    } catch (e) {
      canon.status = 500; canon.error = e.message;
      this.emit(canon);
      throw e;
    }`],
        answer:0,
        whys:["Right. The finally is the invariant: one event per request, success or explosion, with the duration stamped and the error captured. The requests that throw are precisely the ones the 3am query is looking for — the emit path must be unconditional.",
              "The happy path only: any thrown error skips the emit entirely, so the failing requests — the whole point of the exercise — are the ones missing from the log. Your error-rate-by-route query now reads 0% during the outage. Telemetry that only survives success is anti-telemetry.",
              "Inverted hole: now the SUCCESSES never emit (the return skips the catch), so the event stream is a museum of failures with no denominator — error ratios read 100%, and every 'how do normal requests behave?' question has no data. One code path must own the emit: finally."] },
      post:`  };
}` },

    { id:"cardinality", title:"Series Accountant", why:"series = distinct label-sets; count them like money", demo:demoCardinality,
      pre:`// every distinct (metric, label-set) is one time series —
// one index entry, one sample stream, forever. the tracker
// must count TRUE distinct series across call sites.
class SeriesTracker {
  #seen = new Set();
  observe(name, labels) {`,
      blank:{ q:"Two call sites pass the same labels in different key order. Which key counts series the way the TSDB does?",
        options:[
`    const key = name + "{" + Object.keys(labels).sort()
      .map(k => k + "=" + labels[k]).join(",") + "}";
    this.#seen.add(key);
    return this.#seen.size;`,
`    const key = name;
    this.#seen.add(key);
    return this.#seen.size;`,
`    const key = name + JSON.stringify(labels);
    this.#seen.add(key);
    return this.#seen.size;`],
        answer:0,
        whys:["Right. A series is the metric name plus the SET of label pairs — order-free. Sorting the keys canonicalizes {method,path} and {path,method} into one identity, so the count matches what the TSDB will actually store and bill.",
              "Keying on the name alone counts every metric as one series regardless of labels — the accountant reports 40 series while the TSDB stores 14 million. This is the exact bug that lets a user_id label sail through a 'cardinality guard' untouched.",
              "JSON.stringify preserves insertion order, so the same label-set arriving as {a,b} and {b,a} mints two 'series' — the tracker overcounts (noisy, loses trust) and, used as a guard key, undercounts real explosions it split across phantom keys. Canonicalize before you count."] },
      post:`  }
}` },
  ],

  bank:[
    { id:"picksignal", title:"Pick the Signal", why:"metrics detect, traces localize, logs explain", demo:demoPickSignal,
      pre:`// triage router: given what the on-call needs RIGHT NOW,
// route to the signal that answers it at that grade.
// need: "detect" | "localize" | "explain" | "explore"
function pickSignal(need) {`,
      blank:{ q:"03:04. Which routing gets each question answered instead of drowning the on-call in the wrong signal?",
        options:[
`  return {
    detect:   "metrics",      // is it broken? how much?
    localize: "traces",       // where in THIS request?
    explain:  "logs",         // why did that hop do that?
    explore:  "wide events",  // questions nobody predicted
  }[need] || null;`,
`  return "logs";  // everything is in the logs
                  // if you grep hard enough`,
`  return {
    detect:   "traces",
    localize: "traces",
    explain:  "traces",
    explore:  "traces",
  }[need] || null;`],
        answer:0,
        whys:["Right. Each signal is a compression tuned for one question: metrics are cheap aggregates you can alert on; traces carry the request's structure; logs/events carry the detail at one hop; wide events keep the dimensions for the questions you didn't predict. Triage means moving DOWN this ladder, not grepping sideways.",
              "Logs contain almost everything and answer almost nothing at 3am: no thresholds to page on, no request structure, and 'grep the fleet' during an incident is a distributed systems project of its own. You always CAN reconstruct an answer from logs — in about ninety minutes. The ladder exists to make it ninety seconds.",
              "Traces are sampled and per-request: you can't alert on them ('is it broken?' needs unsampled aggregates), and 'why did the db return a constraint violation' lives in the hop's own events, not in span timing. Tracing is the middle of the ladder — indispensable there, wrong at both ends."] },
      post:`}` },

    { id:"culprithop", title:"Find the Culprit Hop", why:"errors bubble UP a trace; causes live at the bottom", demo:demoCulpritHop,
      pre:`// a trace tree where parents inherit failure from children,
// and every span has selfTime() = duration not explained
// by its children. which hop gets the blame?
function culpritHop(root) {`,
      blank:{ q:"Four spans are flagged red because one hop failed; on slow traces nothing is red at all. Which body names the real culprit both times?",
        options:[
`  let deepest = null, depth = -1;
  walk(root, (span, d) => {
    if (span.error && d > depth) {
      deepest = span; depth = d;
    }
  });
  if (deepest) return deepest;
  return criticalPath(root)
    .reduce((a, b) => selfTime(b) > selfTime(a) ? b : a);`,
`  let first = null;
  walk(root, (span) => {
    if (span.error && !first) first = span;
  });
  return first || root;`,
`  let slowest = root;
  walk(root, (span) => {
    const dur = span.end - span.start;
    if (dur > slowest.end - slowest.start) slowest = span;
  });
  return slowest;`],
        answer:0,
        whys:["Right. Errors propagate upward — the edge 500s because the api 500'd because the db timed out — so the DEEPEST error is where the failure was born. No errors means a latency hunt: the biggest self-time on the critical path is the hop that personally spent the time, not one that merely contained a slow child.",
              "The first error in walk order is usually the ROOT — the span that inherited the failure last but appears first. You page the edge team, they stare at a 500 that came from below, and twenty minutes later someone finally scrolls to db.query. Blame flows down, pages should too.",
              "Total duration always crowns a parent — the root 'takes 500ms' because it contains everything, the way a building contains its rooms. Self-time is the difference between containing latency and causing it; without subtracting children you'll forever blame the gateway for the database's work."] },
      post:`}` },

    { id:"bucketdesign", title:"Buckets for the SLO", why:"the promise must be a boundary, or compliance is a guess", demo:demoBucketDesign,
      pre:`// SLO: 95% of checkout requests complete <= 300ms.
// compliance = fraction of observations at or below 300ms,
// computed FROM THE HISTOGRAM. choose the bounds:`,
      blank:{ q:"Which bounds make the SLO number a count instead of an interpolated guess — without going blind everywhere else?",
        options:[
`const bounds =
  [50, 100, 200, 300, 600, 1200, 3000];
// the SLO threshold IS an edge; shape
// preserved above and below it`,
`const bounds =
  [100, 250, 500, 1000, 2500];
// tidy round numbers, evenly spread`,
`const bounds = [300];
// one edge: exactly at the SLO —
// compliant on one side, violating on the other`],
        answer:0,
        whys:["Right. Everything at-or-below 300 is an exact bucket sum — compliance becomes arithmetic, not estimation — while the edges around it keep resolution where regressions will creep (200→300) and where violations spread (600, 1200). Rule of thumb: put a boundary on every number you've promised anyone.",
              "No edge at 300 means the compliance query interpolates inside (250, 500] — assuming requests spread evenly across a bucket where yours cluster at 280. The demo shows the damage: truth 85% compliant, reported 20%. The bounds are pretty; the SLO number they produce is fiction that changes with traffic shape.",
              "Perfectly accurate about the one promise and blind to everything else: no p50, no p99, no 'how close to the edge are we', no seeing the regression that moved requests from 80ms to 280ms — still compliant, silently primed to blow. You'd re-bucket during the incident, and histograms don't backfill."] },
      post:`` },

    { id:"alertdesign", title:"Design the Page", why:"one alert must catch fires AND leaks — and ignore blips", demo:demoAlertDesign,
      pre:`// service SLO 99%. two incidents to survive:
//   the blip: 100% errors for 2 min, self-heals
//   the leak: 8% errors, flat, for six hours
// choose what pages the human:`,
      blank:{ q:"Which design pages on the fire and the leak, and lets the blip pass as a ticket?",
        options:[
`// multi-window burn rate:
page if burn(1h) > 14.4 && burn(5m) > 14.4
page if burn(6h) > 6    && burn(30m) > 6
// blip: 1h burn only 3.3 -> quiet
// leak: 6h & 30m burn 8  -> page`,
`// static threshold:
page if errorRate(5m) > 0.10
// simple, readable, battle-tested`,
`// static threshold, tightened:
page if errorRate(5m) > 0.02
// the leak is 8% — now we catch it`],
        answer:0,
        whys:["Right. Burn rate measures against the PROMISE: the leak burns budget 8× — six hours of it is a real chunk of the month — so the 6h/30m pair pages; the blip costs 2 minutes of budget and the 1h window never confirms it, so it correctly stays a ticket. One design, both shapes, no constants tuned per service.",
              "The 10% threshold pages on the blip (5-minute rate hits 40% while it self-heals — the on-call arrives to a green dashboard) and sleeps through the leak forever (8 < 10 at every instant, while a tenth of users fail all night). A static line asks 'how high?'; outages come in 'how long × how high', which is what budget burn measures.",
              "Tightening to 2% catches the leak — and now every 3-minute deploy wobble and cache warmup pages too, because nothing distinguishes '8% for six hours' from '3% for ninety seconds'. Chasing sensitivity with a constant buys alert fatigue; the missing dimension is time, and burn windows are how you buy it."] },
      post:`` },

    { id:"cardtriage", title:"Cardinality Triage", why:"the TSDB is melting; shed the right dimension first", demo:demoCardTriage,
      pre:`// http_server_duration explodes:
//   {method: 7, path: 1200, status: 5, user_id: 40000}
//   -> 1,680,000,000 potential series. budget: 10,000.
function triage(labels, budget) {`,
      blank:{ q:"Which triage gets under budget while keeping the questions metrics are actually FOR?",
        options:[
`  // shed the widest label first, repeat:
  //   drop user_id  -> 42,000 (still over)
  //   drop raw path -> 35     (under)
  // user_id -> traces/wide events (exemplars
  // bridge back); path -> route templates
  return dropUntilBudget(labels, budget);`,
`  // drop the narrowest first — smallest
  // change to the metric's shape:
  //   drop status (5) -> 336,000,000
  //   drop method (7) -> 48,000,000 …
  return dropNarrowestFirst(labels, budget);`,
`  // keep all labels, cut retention:
  // store the series for 7 days instead of 90
  return shortenRetention(labels, "7d");`],
        answer:0,
        whys:["Right. Cardinality is a product, so only the big factors matter: user_id (40k) is 96% of the explosion and — being unbounded identity — was never a valid metric label; raw path (1200) collapses to a few dozen route templates with no question lost. What remains (method × route × status) is exactly what RED dashboards need.",
              "Dropping narrow labels first is triage by least usefulness AND least effect: status (×5) is both the cheapest factor and the one your error-rate queries can't live without. After three such drops you've gutted the metric's meaning and you're still 4,800× over budget — the product forgives nothing but the big factors.",
              "Retention caps disk for OLD samples; the explosion is ACTIVE series — index entries and memory for every label-set currently reporting. 1.68B series melts ingest today no matter how fast you age samples out. Cost lives at write time in the series count; retention is a different bill."] },
      post:`}` },

    { id:"missingtelemetry", title:"The Missing Instrumentation", why:"audit the questions you'll ask, not the dashboards you have", demo:demoMissingTelemetry,
      pre:`// before the incident: walk the triage script against the
// telemetry inventory. every unanswerable question is an
// action item TODAY, not a postmortem finding next month.
function coverageGaps(inventory, questions) {
  const have = new Set(inventory);`,
      blank:{ q:"A question needs several capabilities. Which filter flags every question the 3am on-call cannot actually answer?",
        options:[
`  return questions.filter(q =>
    !q.needs.every(n => have.has(n)));`,
`  return questions.filter(q =>
    !q.needs.some(n => have.has(n)));`,
`  return questions.filter(q =>
    q.needs.length > inventory.length);`],
        answer:0,
        whys:["Right. A question is answerable only if EVERY capability it needs exists — missing one of three means the on-call still ends up guessing. Flag anything not fully covered; the gap list is your instrumentation backlog, written while it's cheap.",
              "some() passes a question when ANY one capability exists — 'which shard is failing?' gets marked answerable because you have fleet error rates, and the on-call discovers the missing per-shard breakdown live, mid-incident. Partial coverage is exactly the false comfort this audit exists to kill.",
              "Comparing list lengths tests nothing about CONTENT — a question needing two capabilities you lack passes because the inventory is long. Coverage is set membership per requirement, not arithmetic on sizes."] },
      post:`}` },

    { id:"deploycorr", title:"Deploy Correlation", why:"most outages are self-inflicted and recent — check the change log first", demo:demoDeployCorr,
      pre:`// error rate: flat 0.3% … then a STEP to 4.0% at minute 42.
// change log: db config @10, api deploy @41, web deploy @55.
function suspectChange(stepAt, changes, windowMin) {`,
      blank:{ q:"Three changes, one step. Which body names the change to roll back first?",
        options:[
`  const prior = changes.filter(c =>
    c.t <= stepAt && stepAt - c.t <= windowMin);
  if (!prior.length) return null;
  return prior.reduce((a, b) => b.t > a.t ? b : a);`,
`  return changes.reduce((a, b) =>
    Math.abs(b.t - stepAt) < Math.abs(a.t - stepAt)
      ? b : a);`,
`  return changes[0];`],
        answer:0,
        whys:["Right. Causes precede effects: only changes AT or BEFORE the step qualify, recent enough to be plausible — then the LATEST of those is the prime suspect (api deploy @41 for a step @42). Roll it back first; investigate second. If nothing qualifies, say so — a null is more honest than a scapegoat.",
              "Nearest-in-either-direction happily blames the web deploy @55 — a change that happened THIRTEEN MINUTES AFTER the errors began, quite possibly the attempted fix. Rolling back the fix during the outage is a real and famous failure mode; the arrow of time is not optional in correlation.",
              "The earliest change of the day (db config @10) sat harmless for 32 minutes of flat 0.3% before the step — the series itself testifies against it. Old changes CAN detonate late, but that's the fallback hypothesis after the recent-change rollback fails, not the first page."] },
      post:`}` },
  ],
};

/* ---- flashcards: the judgment calls ---- */
const CARDS = [
  ["Metrics vs logs vs traces — the one-line division of labor?","Metrics detect: cheap, aggregated, alertable — is it broken and how much. Traces localize: where inside THIS request the time or failure went. Logs explain: why that hop did what it did. Start a grade too low and you drown in detail; a grade too high and you stare at an aggregate that can't answer."],
  ["When does a field belong in a trace/event instead of a metric label?","When its values are unbounded or user-scoped: user_id, request_id, session, full URL, error message. Each distinct label value mints a permanent time series; each event field is just data on a row. Rule: labels you can enumerate in a design doc — everything else rides the event, with exemplars as the bridge back."],
  ["Head vs tail sampling — the actual trade?","Head: decided at ingress by hashing the trace id — cheap, coordination-free, statistically fair, and blind: it keeps 1% of errors because it keeps 1% of everything. Tail: decided after the trace completes — keeps every error and slow trace, but must buffer all spans until the end (collector memory, cost, complexity). Head answers 'what does normal look like'; tail answers 'show me the bodies.'"],
  ["Why can you sum counters and merge histograms, but never average percentiles?","Counts add — that's what makes them counts; a histogram is counts, so fleets merge exactly. A percentile is a RESULT computed from a distribution, and results don't compose: avg(p99s) weights hosts instead of requests and describes no distribution at all. Aggregate raw, compute last."],
  ["Counter vs gauge — and the cost of choosing wrong?","Counter for events (requests, errors, bytes): cumulative, so nothing between scrapes is lost, and rate() survives restarts. Gauge for states (memory, queue depth, temperature): a snapshot that is only true at scrape instants. Events-as-gauge is the classic sin: a spike that starts and ends between two scrapes never existed."],
  ["What earns an alert the right to page a human?","Three tests: a user-visible symptom (someone real is hurting), actionable (there is something to DO now), and urgent (it can't wait for morning). Fail any one and it's a ticket or a dashboard. Every non-actionable page spends the on-call's trust, and trust is the pager's only currency."],
  ["What does an error budget actually buy the team?","A currency: 1 − SLO, spendable on risk. Budget healthy → ship fast, run experiments, do the risky migration. Budget burned → freeze features, pay reliability debt. It converts the eternal speed-vs-safety argument into arithmetic both sides already agreed to — and burn rate is its exchange rate."],
  ["Dashboards vs wide events — known vs unknown unknowns?","A dashboard is a pre-computed answer to a question you predicted; incidents specialize in questions you didn't. Wide events (one rich record per request, high cardinality kept) let you ask new questions after the fact — group by anything, filter by anything. Dashboards for the knowns you must watch; events for the unknowns you'll need to interrogate."],
  ["What belongs at ERROR, WARN, INFO, DEBUG — in production?","ERROR: this request/operation failed and someone may need to act — always kept. WARN is where signals die: if it predicts failure, promote it to a metric with an alert; if it doesn't, demote it. INFO: the canonical line and lifecycle marks — the after-the-fact narrative. DEBUG: off in prod, or sampled behind a flag; it's for development, not forensics."],
  ["First move of any incident — cause or scope?","Scope. All users or one segment? All routes or one? Total failure or degraded? Scope decides severity, comms, and who you wake — and it prunes the hypothesis tree harder than any log line: 'one AZ' and 'all traffic' point at disjoint worlds. Cause-hunting before scoping is how you debug the wrong outage."],
  ["Why do deploy markers live on every dashboard?","Because the base rate says the culprit is you: most incidents trace to a recent change — deploy, config, flag, migration. A vertical line at 14:02 next to a step change at 14:03 answers 'what happened?' faster than any profiler. Change correlation is the cheapest diagnostic in the entire discipline; rollback first, understand second."],
  ["The fleet p99 is green but a big customer swears it's slow. Where do you look?","Under the aggregate — that's the axiom. Slice by customer, route, region, shard: a minority segment can burn while the global percentile smiles (their traffic is a rounding error in the distribution). If you can't slice by the dimension they're complaining about, that's the finding: the telemetry lacks the cardinality to see this customer at all."],
  ["Why keep metrics for a year but traces only for days?","Retention follows question shape. Metrics answer trends — capacity, seasonality, regressions across quarters — and they're tiny per series. Traces answer 'what happened in this request' — enormous, and nobody debugs a specific request from last spring. Errors and exemplar-linked traces earn longer keeps; the happy-path bulk ages out fast."],
  ["Minimum telemetry for one production request — the senior checklist?","A counter increment for RED (rate/errors by route and status), a duration observation into a histogram whose bounds include your SLO threshold, one canonical wide event carrying the request's who/what/outcome, and a span if sampled — all stitched by the same trace/request id, so every signal can hand off to the others."],
];

/* ---- spot-the-bug: real code, one broken scenario, tap the faulty line(s) ---- */
const BUGHUNT = [
  { id:"bug_rate", title:"Counter rate calculator", why:"a counter that drops didn't go backwards — it was reborn", lesson:4,
    scenario:"Every deploy, the traffic dashboard plunges below zero for one scrape interval, and the 'low traffic' alert pages the on-call while actual traffic is perfectly healthy. Which line manufactures the negative RPS?",
    lines:[
      "// samples: [{t, v}] cumulative counter scrapes,",
      "// oldest first. returns requests/second.",
      "function ratePerSec(samples) {",
      "  let inc = 0;",
      "  for (let i = 1; i < samples.length; i++) {",
      "    inc += samples[i].v - samples[i - 1].v;",
      "  }",
      "  const seconds =",
      "    (samples[samples.length - 1].t - samples[0].t) / 1000;",
      "  return inc / seconds;",
      "}",
    ],
    bug:[5],
    explain:"Line 6 trusts the raw delta. A counter is cumulative per process — when a deploy restarts the service, the counter is reborn at zero, and 70 − 1300 contributes −1230 to the sum. The rate goes negative once per restart, the low-traffic alert fires on arithmetic instead of traffic, and the panel is wrong exactly when people watch it hardest (during deploys). The delta needs the reset rule: a decrease can only mean restart, so count the post-reset value itself — `const d = samples[i].v - samples[i-1].v; inc += d >= 0 ? d : samples[i].v;` — which is precisely what rate()/increase() do." },

  { id:"bug_quantile", title:"Histogram quantile estimator", why:"the rank's depth into THIS bucket, not into everything", lesson:7,
    scenario:"The homegrown p99 panel reads suspiciously LOW while users report worse — and the higher the quantile, the harder it hugs its bucket's floor: the p99 is the most wrong number on the panel. The bucket search is fine. Which line skews the estimate?",
    lines:[
      "quantile(q) {",
      "  const rank = q * this.total;",
      "  let cum = 0;",
      "  for (let i = 0; i < this.counts.length; i++) {",
      "    const prev = cum;",
      "    cum += this.counts[i];",
      "    if (cum >= rank && this.counts[i] > 0) {",
      "      if (i >= this.bounds.length)",
      "        return this.bounds[this.bounds.length - 1];",
      "      const lo = i === 0 ? 0 : this.bounds[i - 1];",
      "      const hi = this.bounds[i];",
      "      const frac = (rank - prev) / cum;",
      "      return lo + (hi - lo) * frac;",
      "    }",
      "  }",
      "}",
    ],
    bug:[11],
    explain:"Line 12 divides by `cum` — the running total of ALL observations up to and including this bucket — instead of `this.counts[i]`, the count inside the bucket the rank landed in. The fraction is systematically too small, so every quantile hugs its bucket's lower edge — and the higher the quantile, the larger `prev`'s share of `cum`, so the p99 hugs the floor hardest of all: your most-watched number is your most wrong one. Interpolation is local: `(rank − prev) / this.counts[i]` measures how deep into THIS bucket's population the rank sits, which is the fiction histogram_quantile actually promises." },

  { id:"bug_traceasm", title:"Trace assembler", why:"the root is a structural fact, not an arrival accident", lesson:10,
    scenario:"In dev every trace renders perfectly. In production, roughly half the waterfalls show a database span as the 'request', with the real HTTP request nested underneath it as a child — and the durations read nonsense. Which line crowns the wrong span?",
    lines:[
      "function buildTrace(spans) {",
      "  const nodes = new Map(",
      "    spans.map(s => [s.id, { ...s, children: [] }]));",
      "  const root = nodes.get(spans[0].id);",
      "  for (const s of nodes.values()) {",
      "    if (s.parent != null && nodes.has(s.parent)) {",
      "      nodes.get(s.parent).children.push(s);",
      "    }",
      "  }",
      "  for (const s of nodes.values())",
      "    s.children.sort((a, b) => a.start - b.start);",
      "  return root;",
      "}",
    ],
    bug:[3],
    explain:"Line 4 assumes the first span in the batch is the root. Exporters ship spans when they END — and children finish before their parents by definition, so under real load the db span routinely arrives first and gets crowned. Dev traffic is sequential enough to hide it, which is why the bug 'only happens in production'. The root is the span with no parent — `for (const s of nodes.values()) if (s.parent == null) root = s;` — a structural fact that no arrival order can disturb." },

  { id:"bug_headsampler", title:"Head sampler", why:"one character between whole traces and confetti", lesson:13,
    scenario:"After the sampler shipped, storage costs landed exactly on target — but every trace in the UI is fragments: parents without children, orphan spans floating loose. The rate math is right. Which line shreds the traces?",
    lines:[
      "class HeadSampler {",
      "  constructor(rate) {",
      "    this.rate = rate;   // e.g. 0.01 -> keep 1%",
      "  }",
      "",
      "  // called once per span at export time",
      "  keep(span) {",
      "    const h = fnv1a(span.id);",
      "    return h % 10000 < this.rate * 10000;",
      "  }",
      "}",
    ],
    bug:[7],
    explain:"Line 8 hashes `span.id` — unique per span — so each span of a trace gets an independent verdict, and a 20-span trace survives intact with probability 0.01^20 ≈ never. Storage hits the target because 1% of SPANS are kept; debugging gets nothing because 0% of TRACES are whole. The hash must key on `span.traceId`, the one value all spans of a trace share, so every span (and every service, computing independently) reaches the same decision. One character; the difference between a sampling strategy and a shredder." },
];

/* ===========================================================
   WRITE IT — assemble the implementation from a shuffled line
   bank. Grading is honest: the assembled code actually RUNS
   against assertions in a sandboxed worker.
   =========================================================== */
const WRITE = [
  { id:"w-rate", title:"Reset-proof rate — write it", why:"deploys restart counters; dashboards must not care", lesson:4,
    spec:"Write increase(samples) and ratePerSec(samples): samples are cumulative counter scrapes [{t (ms), v}], oldest first. increase() sums the growth, treating any decrease as a process restart — the post-reset value counts from zero. ratePerSec() divides by the window in seconds.",
    pre:`// a counter can only grow; a drop means the process
// restarted and began again at zero.`,
    post:`// scrapes arrive oldest-first; the window is timestamps, not counts`,
    lines:[
      "function increase(samples) {",
      "  let inc = 0;",
      "  for (let i = 1; i < samples.length; i++) {",
      "    const d = samples[i].v - samples[i - 1].v;",
      "    inc += d >= 0 ? d : samples[i].v;",
      "  }",
      "  return inc;",
      "}",
      "function ratePerSec(samples) {",
      "  const seconds =",
      "    (samples[samples.length - 1].t - samples[0].t) / 1000;",
      "  return increase(samples) / seconds;",
      "}",
    ],
    distractors:[
      { code:"    inc += d;",
        why:"Raw deltas go hugely negative across a restart (70 − 1300 = −1230) — the dashboard shows negative RPS after every deploy and the low-traffic alert pages on arithmetic." },
      { code:"    inc += Math.max(0, d);",
        why:"Clamping hides the negative but deletes the traffic the new process already served — every deploy window undercounts by exactly the post-restart value. The 70 requests since reset are real; count them." },
      { code:"  const seconds = samples.length;",
        why:"The window is the timestamps' span, not the sample count — with 15s scrapes this inflates the rate 15×, and it silently changes whenever the scrape interval does." },
    ],
    test:`const quiet = [{ t: 0, v: 100 }, { t: 15000, v: 400 }, { t: 30000, v: 700 }];
assert(increase(quiet) === 600, "steady growth: increase must be 600, got " + increase(quiet));
assert(Math.abs(ratePerSec(quiet) - 20) < 1e-9, "600 over 30s is 20/s, got " + ratePerSec(quiet));
const deploy = [{ t: 0, v: 1000 }, { t: 15000, v: 1300 }, { t: 30000, v: 70 }, { t: 45000, v: 370 }];
log("scrapes across a restart: 1000 -> 1300 -> 70 -> 370");
const inc = increase(deploy);
assert(inc === 670, "300 + 70 (reborn from zero) + 300 = 670, got " + inc);
assert(inc >= 0, "an increase can never be negative");
const r = ratePerSec(deploy);
log("increase " + inc + " over 45s -> " + r.toFixed(2) + "/s");
assert(Math.abs(r - 670 / 45) < 1e-9, "rate must be 670/45, got " + r);
const doubleReset = [{ t: 0, v: 50 }, { t: 15000, v: 10 }, { t: 30000, v: 5 }];
assert(increase(doubleReset) === 15, "two resets: 10 + 5 = 15, got " + increase(doubleReset));`,
    pass:"the rate stayed truthful straight through the restarts — no negative RPS, no vanished traffic",
    takeaway:"Monotonic counters + the reset rule are why rate() survives deploys: a decrease can only mean rebirth at zero, so the new value IS the increase. This is the contract underneath every RPS panel you've ever trusted.",
    hint:"Loop from the second sample: d = current − previous. If d >= 0 add d; otherwise the process restarted — add the current value itself. Rate = increase / ((lastT − firstT) / 1000)." },

  { id:"w-hist", title:"Histogram + quantile — write it", why:"the p99 is an interpolation; build the machine that makes it", lesson:7,
    spec:"Write record(v) and quantile(q) for a bucketed histogram. bounds are upper edges; values above the last bound land in the +Inf slot (counts has one extra slot). quantile(q): rank = q × total; find the bucket where the cumulative count reaches the rank, then linearly interpolate within it. A rank in the +Inf bucket returns the largest finite bound.",
    pre:`class Histogram {
  constructor(bounds) {
    this.bounds = bounds;
    this.counts = new Array(bounds.length + 1).fill(0);
    this.total = 0;
  }`,
    post:`}`,
    lines:[
      "  record(v) {",
      "    let i = this.bounds.findIndex(b => v <= b);",
      "    if (i === -1) i = this.bounds.length;",
      "    this.counts[i]++;",
      "    this.total++;",
      "  }",
      "  quantile(q) {",
      "    const rank = q * this.total;",
      "    let cum = 0;",
      "    for (let i = 0; i < this.counts.length; i++) {",
      "      const prev = cum;",
      "      cum += this.counts[i];",
      "      if (cum >= rank && this.counts[i] > 0) {",
      "        if (i >= this.bounds.length)",
      "          return this.bounds[this.bounds.length - 1];",
      "        const lo = i === 0 ? 0 : this.bounds[i - 1];",
      "        const hi = this.bounds[i];",
      "        return lo + (hi - lo) * ((rank - prev) / this.counts[i]);",
      "      }",
      "    }",
      "  }",
    ],
    distractors:[
      { code:"    let i = this.bounds.findIndex(b => v < b);",
        why:"Strict `<` puts a value equal to a boundary in the NEXT bucket — le (less-or-equal) is the histogram contract, and an SLO measured at exactly its threshold silently miscounts the compliant requests." },
      { code:"        return hi;",
        why:"No interpolation: every quantile snaps to a bucket edge, dashboards show staircases, and regressions hide inside a bucket until they burst through it. The estimate must move continuously within the bucket." },
      { code:"        return lo + (hi - lo) * (rank / cum);",
        why:"rank/cum is depth into ALL observations so far, not into this bucket — quantiles hug the lower edge and the error grows with traffic. The local fraction is (rank − prev) / counts[i]." },
    ],
    test:`const h = new Histogram([100, 250, 500, 1000]);
for (let i = 0; i < 40; i++) h.record(50);
for (let i = 0; i < 30; i++) h.record(200);
for (let i = 0; i < 20; i++) h.record(400);
for (let i = 0; i < 10; i++) h.record(800);
assert(h.total === 100, "100 observations recorded, got " + h.total);
assert(h.counts.join(",") === "40,30,20,10,0", "bucket counts wrong: " + h.counts.join(","));
const p50 = h.quantile(0.5);
log("p50 -> " + p50.toFixed(1) + "ms (rank 50, 10/30 deep into (100,250])");
assert(Math.abs(p50 - 150) < 1e-9, "p50 must interpolate to 150, got " + p50);
const p99 = h.quantile(0.99);
log("p99 -> " + p99.toFixed(1) + "ms — every real sample in that bucket was 800");
assert(Math.abs(p99 - 950) < 1e-9, "p99 must interpolate to 950, got " + p99);
h.record(250);
assert(h.counts[1] === 31, "a value equal to a bound belongs in that bucket (le semantics)");
const big = new Histogram([100, 200]);
big.record(5000);
assert(big.quantile(0.99) === 200, "+Inf bucket must return the largest finite bound, got " + big.quantile(0.99));`,
    pass:"buckets counted, ranks interpolated, the +Inf rule held — you built histogram_quantile",
    takeaway:"A histogram forgets the values and keeps the counts — so every quantile is an interpolation whose accuracy the BOUNDARIES decided at design time. The 950ms p99 over samples that were all 800ms isn't a bug; it's the compression being honest about itself.",
    hint:"record: first bound where v <= b, else the extra +Inf slot; bump counts and total. quantile: rank = q*total; walk buckets accumulating; in the bucket where cum >= rank, interpolate lo + (hi−lo) × (rank−prev)/counts[i]; +Inf returns the last finite bound." },

  { id:"w-merge", title:"Histogram merge — write it", why:"the only honest fleet percentile is merge-then-quantile", lesson:8,
    spec:"Write merge(hists): given Histograms with identical bounds, return a new Histogram whose counts and total are the element-wise sums. Throw if any bounds differ — merging mismatched buckets silently corrupts every quantile downstream.",
    pre:`// Histogram: { bounds, counts (bounds.length + 1 slots),
//   total, quantile(q) } — provided by the harness below.
function merge(hists) {`,
    post:`}
function makeHistogram(bounds) {
  return {
    bounds: bounds, counts: new Array(bounds.length + 1).fill(0), total: 0,
    quantile(q) {
      const rank = q * this.total; let cum = 0;
      for (let i = 0; i < this.counts.length; i++) {
        const prev = cum; cum += this.counts[i];
        if (cum >= rank && this.counts[i] > 0) {
          if (i >= this.bounds.length) return this.bounds[this.bounds.length - 1];
          const lo = i === 0 ? 0 : this.bounds[i - 1];
          return lo + (this.bounds[i] - lo) * ((rank - prev) / this.counts[i]);
        }
      }
    },
  };
}`,
    lines:[
      "  const bounds = hists[0].bounds;",
      "  for (const h of hists)",
      "    if (h.bounds.join() !== bounds.join())",
      "      throw new Error(\"bucket bounds must match\");",
      "  const m = makeHistogram(bounds);",
      "  for (const h of hists) {",
      "    h.counts.forEach((c, i) => m.counts[i] += c);",
      "    m.total += h.total;",
      "  }",
      "  return m;",
    ],
    distractors:[
      { code:"    h.counts.forEach((c, i) => m.counts[i] = Math.max(m.counts[i], c));",
        why:"max() keeps one host's count per bucket and discards the rest of the fleet's observations — the merged 'distribution' represents nobody, and total no longer equals the sum of the counts." },
      { code:"  return hists.map(h => h.quantile(0.99)).reduce((a, b) => a + b) / hists.length;",
        why:"That's the aggregation trap itself: averaging per-host percentiles produces a number no request experienced and lets one sick canary vanish among healthy hosts. Merge the raw counts, THEN ask for the quantile." },
      { code:"  const bounds = hists.map(h => h.bounds).flat();",
        why:"Concatenating bounds builds a Franken-histogram whose buckets overlap — counts land against edges they were never recorded under, and every quantile after that is quiet nonsense. Identical bounds are a precondition, not a suggestion." },
    ],
    test:`const a = makeHistogram([100, 250, 500]);
[80, 80, 80, 80, 80, 80, 80, 80, 80, 200].forEach(v => { let i = a.bounds.findIndex(b => v <= b); a.counts[i]++; a.total++; });
const b = makeHistogram([100, 250, 500]);
[80, 400, 400, 400, 400, 400, 400, 400, 400, 400].forEach(v => { let i = b.bounds.findIndex(b2 => v <= b2); b.counts[i]++; b.total++; });
log("host A p99 " + a.quantile(0.99).toFixed(0) + "ms · canary B p99 " + b.quantile(0.99).toFixed(0) + "ms");
const m = merge([a, b]);
assert(m.total === 20, "merged total must be 20, got " + m.total);
assert(m.counts.join(",") === "10,1,9,0", "merged counts must be element-wise sums, got " + m.counts.join(","));
const fleet = m.quantile(0.99);
log("fleet p99 (merge then quantile): " + fleet.toFixed(0) + "ms");
const avg = (a.quantile(0.99) + b.quantile(0.99)) / 2;
assert(fleet > avg, "the merged p99 must expose the canary that the average dilutes");
assert(m !== a && m !== b && a.total === 10, "merge must not mutate its inputs");
let threw = false;
try { merge([a, makeHistogram([1, 2, 3])]); } catch (e) { threw = true; }
assert(threw, "mismatched bounds must throw, not silently corrupt");`,
    pass:"counts summed, inputs untouched, mismatched bounds refused — the fleet p99 tells the truth",
    takeaway:"Histograms are the mergeable representation of latency — counts add exactly, across hosts, regions, or time. That's why services export buckets instead of percentiles: the percentile is computed LAST, after all the honest addition is done.",
    hint:"Check every histogram's bounds match the first (join() compares cheaply). Make a fresh histogram, add each input's counts element-wise, sum the totals, return it." },

  { id:"w-tracetree", title:"Span-tree assembler — write it", why:"out-of-order spans, one deterministic tree", lesson:10,
    spec:"Write buildTrace(spans): spans are {id, parent, name, start, end} in arbitrary order (parent === null marks the root). Return the root node, each node extended with a children array sorted by start time. Spans whose parent never arrived are skipped, not fatal.",
    pre:`function buildTrace(spans) {`,
    post:`}`,
    lines:[
      "  const nodes = new Map(",
      "    spans.map(s => [s.id, { ...s, children: [] }]));",
      "  let root = null;",
      "  for (const s of nodes.values()) {",
      "    if (s.parent == null) root = s;",
      "    else if (nodes.has(s.parent))",
      "      nodes.get(s.parent).children.push(s);",
      "  }",
      "  for (const s of nodes.values())",
      "    s.children.sort((a, b) => a.start - b.start);",
      "  return root;",
    ],
    distractors:[
      { code:"  const root = nodes.get(spans[0].id);",
        why:"First-arrived is not root: exporters ship spans as they END, so children beat parents constantly under load. Half your production waterfalls crown the db span. The root is the span with no parent — structure, not order." },
      { code:"    else nodes.get(s.parent).children.push(s);",
        why:"No guard: one dropped parent span (exporters lose spans; it's Tuesday) and nodes.get() is undefined — the whole trace view throws. Orphans get skipped so the surviving tree still renders." },
      { code:"    s.children.sort((a, b) => a.end - b.end);",
        why:"Sorting children by END time scrambles the waterfall's reading order — a long first child renders after a quick second one, and 'sequential stairs' stop being visible as stairs. Waterfalls read by when work STARTED." },
    ],
    test:`const spans = [
  { id: "s4", parent: "s3", name: "stripe.post", start: 130, end: 400 },
  { id: "s2", parent: "s1", name: "cart.load", start: 40, end: 120 },
  { id: "s3", parent: "s1", name: "charge", start: 120, end: 410 },
  { id: "s1", parent: null, name: "GET /checkout", start: 0, end: 420 },
  { id: "s0", parent: "s1", name: "auth.check", start: 0, end: 40 },
];
const root = buildTrace(spans);
assert(root.name === "GET /checkout", "the root is the parentless span, got " + root.name);
assert(root.children.length === 3, "root must have 3 children, got " + root.children.length);
assert(root.children.map(c => c.name).join(",") === "auth.check,cart.load,charge",
  "children must sort by start time, got " + root.children.map(c => c.name).join(","));
assert(root.children[2].children[0].name === "stripe.post", "grandchildren must nest under their parent");
log("5 out-of-order spans -> " + root.name + " with " + root.children.length + " children, stripe nested under charge");
const withOrphan = buildTrace(spans.concat([{ id: "sX", parent: "GONE", name: "orphan", start: 1, end: 2 }]));
assert(withOrphan.name === "GET /checkout", "an orphan span (dropped parent) must not break assembly");
const flip = buildTrace([spans[3], spans[0], spans[2]]);
assert(flip.name === "GET /checkout" && flip.children[0].name === "charge",
  "any arrival order must produce the same tree");
const overlap = buildTrace([
  { id: "r", parent: null, name: "root", start: 0, end: 600 },
  { id: "B", parent: "r", name: "quick-second", start: 20, end: 30 },
  { id: "A", parent: "r", name: "slow-first", start: 10, end: 500 },
]);
assert(overlap.children.map(c => c.name).join(",") === "slow-first,quick-second",
  "overlapping siblings must sort by START time, got " + overlap.children.map(c => c.name).join(","));`,
    pass:"same tree from any arrival order, orphans survived, children read left-to-right by start",
    takeaway:"A trace is a tree serialized as a bag of spans — parent ids ARE the structure, and arrival order is noise you must be deaf to. Every trace UI you've used runs this exact assembly before it can draw a single waterfall.",
    hint:"Index all spans by id (cloning with an empty children array). One pass: parentless span → root; otherwise push onto the parent if it exists. Sort every children array by start. Return the root." },
];

/* ===========================================================
   LESSONS — arcs: foundations (0-3), metrics (4-9). Tracing,
   logging, SLOs, and debugging are appended by the lesson
   packs; see the LESSON PLAN at the top of this file.
   =========================================================== */
const LESSONS = [
  { eb:"lesson 01 · foundations", title:"The two axioms", html:`
    <p class="big">It's 3:07am and checkout is failing. You cannot attach a debugger, you cannot add a print statement, you cannot reproduce it on your laptop. <b class="hl">Axiom one: production can only be debugged through telemetry you emitted in advance.</b> Whatever question you'll need answered tonight, the answer had to be recorded before you knew the question.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">a request you'll never see again &middot; only its telemetry survives</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="30" width="80" height="34" rx="8" fill="#11131c" stroke="#2c3350"/>
        <text x="50" y="51" fill="#e7e9f3" font-size="9" text-anchor="middle">edge</text>
        <rect x="130" y="30" width="80" height="34" rx="8" fill="#11131c" stroke="#2c3350"/>
        <text x="170" y="51" fill="#e7e9f3" font-size="9" text-anchor="middle">api</text>
        <rect x="250" y="30" width="80" height="34" rx="8" fill="#11131c" stroke="#2c3350"/>
        <text x="290" y="51" fill="#e7e9f3" font-size="9" text-anchor="middle">db</text>
        <line x1="90" y1="47" x2="130" y2="47" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="210" y1="47" x2="250" y2="47" stroke="#2c3350" stroke-width="1.2"/>
        <rect x="60" y="108" width="220" height="30" rx="8" fill="#11131c" stroke="#8e86f0" stroke-width="1.3"/>
        <text x="170" y="127" fill="#8e86f0" font-size="8.5" text-anchor="middle">telemetry store — the only witness left</text>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.3;0.6;1" keyPoints="0;0.5;1;1" path="M 50 47 L 170 47 L 290 47"/>
          <animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.6;0.68;1" values="1;1;0;0"/>
        </circle>
        <circle r="3" fill="#8e86f0"><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.1;0.3;1" keyPoints="0;0;1;1" path="M 50 64 L 100 108"/><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.1;0.28;0.3;1" values="0;1;1;0;0"/></circle>
        <circle r="3" fill="#8e86f0"><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.36;0.56;1" keyPoints="0;0;1;1" path="M 170 64 L 170 108"/><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.36;0.54;0.56;1" values="0;1;1;0;0"/></circle>
        <circle r="3" fill="#8e86f0"><animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.62;0.82;1" keyPoints="0;0;1;1" path="M 290 64 L 240 108"/><animate attributeName="opacity" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.62;0.8;0.82;1" values="0;1;1;0;0"/></circle>
        <text x="170" y="16" fill="#ff9a6b" font-size="8.5" text-anchor="middle">✗ no debugger &middot; ✗ no breakpoint &middot; ✗ no reproducing it locally</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">axiom 1</div><div class="lstep seq" style="--i:0">you can only ask questions of telemetry you <b>emitted in advance</b></div>
        <div class="lanehead seq" style="--i:1">axiom 2</div><div class="lstep bad seq" style="--i:1">every signal is a <b>lossy compression</b> — aggregates lie unless you know what was thrown away</div>
        <div class="lanehead seq" style="--i:2">therefore</div><div class="lstep good seq pop" style="--i:2">observability = choosing the compressions <b>before</b> the incident chooses the questions</div>
      </div>
      <div class="dnote seq" style="--i:3">A metric threw away the individuals. A trace threw away 99% of requests. A log line threw away the request's structure. <b style="color:var(--ordered)">Knowing what each one discarded</b> is the skill this course drills.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Axiom two is the sharper one. The average latency is 228ms — and 1% of your users are timing out. The error rate is 0.4% — and it's 100% of one big customer. The gauge read 61% — and the process OOM-killed forty seconds later. None of these signals is broken; each is a <b class="hl">compression</b> doing exactly what compressions do. The failure is reading them as if they were the raw truth.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the mindset, as code</div>
      <pre class="code"><span class="cm">// debugging dev:  inspect state you can reach</span>
debugger; console.log(order);
<span class="cm">// debugging prod: query state you chose to record</span>
metrics.count("checkout.errors", { route, status });
trace.span("charge", () =&gt; stripe.post(order));
log.wide({ route, user_tier, cache: "miss", status });
<span class="ok">// the instrumentation IS the debugger — written in advance</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> everything ahead — histograms, sampling, burn rates, canonical lines — derives from these two axioms. Instrument before you need it; know what each signal discarded. Interviewers probe exactly this: not "what is a metric" but <i>what can this metric not tell you?</i></p>` },

  { eb:"lesson 02 · foundations", title:"The three signals", html:`
    <p class="big">Metrics, logs, traces — the industry's holy trinity, and most teams use all three to answer <i>none</i> of their questions well. Each signal is a different compression, tuned for a different question. <b class="hl">Metrics detect. Traces localize. Logs explain.</b></p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">one failing request &middot; three compressions of it</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">metric</div><div class="lstep seq" style="--i:0">errors{route="/checkout"} += 1 &middot; <b>is it broken? how much? for how long?</b> — cheap, unsampled, alertable</div>
        <div class="lanehead seq" style="--i:1">trace</div><div class="lstep seq" style="--i:1">edge &rarr; api &rarr; <span style="color:var(--race)">db 380ms ✗</span> &middot; <b>where in THIS request?</b> — structural, sampled, per-request</div>
        <div class="lanehead seq" style="--i:2">log</div><div class="lstep seq" style="--i:2">"pool exhausted, 42 waiters, timeout 300ms" &middot; <b>why did that hop fail?</b> — detailed, local, voluminous</div>
      </div>
      <div class="flowarrow seq" style="--i:3">&darr; triage moves DOWN the ladder &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:4">3:07am</div><div class="lstep good seq" style="--i:4">metric pages you &rarr; trace names the hop &rarr; the hop's logs name the cause</div>
        <div class="lanehead seq" style="--i:5">anti-flow</div><div class="lstep bad seq pop" style="--i:5">"grep the logs to find out if we're down" — answering a fleet question with the per-hop signal &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:6">Each signal answers the NEXT one's question badly: you can't alert on sampled traces, can't localize from a counter, can't see fleet health in one hop's logs. <b style="color:var(--ordered)">Match the grade of the question to the grade of the signal.</b></div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The costs differ as much as the questions. A metric is a few bytes per <i>series</i> regardless of traffic — that's why it can watch everything, always. A trace costs per <i>request</i>, which is why it's sampled. Logs cost per <i>line times verbosity</i>, which is why unmanaged logging is the biggest bill in most observability stacks. The discipline: emit all three <b class="hl">from the same request, joined by the same ids</b>, so each can hand off to the next.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; one request, three emissions, one identity</div>
      <pre class="code">const traceId = ctx.traceId;               <span class="cm">// the join key</span>
metrics.histogram("http.duration", ms, { route });
<span class="cm">//   -&gt; aggregate, with an EXEMPLAR pointing at traceId</span>
span.setStatus("error");                    <span class="cm">// -&gt; the structure</span>
log.wide({ trace_id: traceId, route, err }); <span class="cm">// -&gt; the detail</span>
<span class="ok">// detect on the metric, jump to the trace, read the event</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we have Datadog" is not observability. The 3am test is concrete: can you get from <i>page</i> to <i>failing hop</i> to <i>cause</i> without ssh, without grep-and-pray, without waking the person who wrote the service? That path is exactly one handoff per signal — if any handoff is missing, you'll feel it at the worst possible hour.</p>` },

  { eb:"lesson 03 · foundations", title:"Cardinality: the dimension that decides everything", html:`
    <p class="big">One number decides whether your metrics are cheap and instant or a five-figure bill with 40-second queries: <b class="hl">how many time series exist</b>. A series is one metric name plus one distinct combination of label values — and combinations <b class="hl">multiply</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">http_requests_total &middot; every label multiplies the series count</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">method</div><div class="lstep seq" style="--i:0">7 values &rarr; <b>7 series</b></div>
        <div class="lanehead seq" style="--i:1">&times; status</div><div class="lstep seq" style="--i:1">5 values &rarr; <b>35 series</b></div>
        <div class="lanehead seq" style="--i:2">&times; route</div><div class="lstep seq" style="--i:2">40 templates &rarr; <b>1,400 series</b> — fine, this is what metrics are for</div>
        <div class="lanehead seq" style="--i:3">&times; user_id</div><div class="lstep bad seq pop" style="--i:3">2,000,000 users &rarr; <b>2.8 billion series</b> — the TSDB is now on fire &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:4">Each series is a permanent index entry, an in-memory presence, and its own sample stream. The TSDB's cost model is <b style="color:var(--race)">the product of label cardinalities</b> — and one unbounded label multiplies everything else.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The test for a label is: <b class="hl">could you enumerate its values in a design review?</b> method, status class, route template, region, tier — yes; those are dimensions you'll group by on dashboards. user_id, request_id, session, email, raw URL, error message — no; those are <b class="hl">identities</b>, and identity belongs in traces and wide events, where a value is a field on a row instead of a series forever. Exemplars bridge the two worlds when you need to jump from an aggregate to an instance.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the series accountant</div>
      <pre class="code"><span class="cm">// series = product of distinct label values</span>
seriesProduct({ method: 7, status: 5, route: 40 })
<span class="ok">// -&gt; 1,400 · a dashboard's worth</span>
seriesProduct({ method: 7, status: 5, route: 40, user_id: 2e6 })
<span class="cm">// -&gt; 2,800,000,000 · a postmortem's worth</span>
<span class="cm">// identity goes on the EVENT: log.wide({ user_id, ... })</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> cardinality is where cost, performance, and queryability meet — the most senior-signal topic in the whole metrics conversation. "Why not put user_id on the metric?" is a top-three observability interview question, and the answer is a number: the product.</p>` },

  { eb:"lesson 04 · foundations", title:"Known unknowns vs unknown unknowns", html:`
    <p class="big">A dashboard is a <b class="hl">pre-computed answer to a question you predicted</b>. Incidents specialize in the other kind of question. The split — known unknowns vs unknown unknowns — decides which telemetry you need more of, and it's the cleanest definition of "monitoring vs observability" that isn't marketing.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">two kinds of question &middot; two kinds of telemetry</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">predicted</div><div class="lstep seq" style="--i:0">"is error rate high?" &middot; "is p99 over SLO?" &rarr; dashboards + alerts answer <b>instantly</b></div>
        <div class="lanehead seq" style="--i:1">not predicted</div><div class="lstep bad seq" style="--i:1">"is it only Android users in Brazil on the new app version hitting carts &gt; 50 items?" &rarr; no panel exists &#10007;</div>
      </div>
      <div class="flowarrow seq" style="--i:2">&darr; what answers the second kind &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:3">wide events</div><div class="lstep good seq" style="--i:3">one rich record per request — dozens of fields, high cardinality kept — <b>sliceable after the fact</b></div>
        <div class="lanehead seq" style="--i:4">the move</div><div class="lstep good seq pop" style="--i:4">GROUP BY every field, sort by error rate &rarr; the outlier dimension names itself</div>
      </div>
      <div class="dnote seq" style="--i:5">Metrics pre-aggregate at write time (cheap, rigid). Events aggregate at read time (costly, <b style="color:var(--ordered)">flexible</b>). Every observability vendor is a different point on that one trade.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The debugging move that wide events unlock is mechanical, and it's the single highest-leverage trick in this course: when something is wrong but nothing predicted it, <b class="hl">group the failing events by every dimension you have</b> — version, region, device, customer, shard, feature flag — and look for the dimension where failures concentrate. You're not hypothesizing; you're letting the data confess. Teams with only dashboards do this by guessing one hypothesis at a time, at 3am, in a war room.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the confession query</div>
      <pre class="code"><span class="cm">-- over the wide events of the last 30 min:</span>
SELECT app_version, region, device,
       count(*) AS n,
       avg(status &gt;= 500) AS err_rate
FROM   request_events
GROUP  BY 1, 2, 3 ORDER BY err_rate DESC;
<span class="ok">-- "v2.4.1 · Brazil · Android" floats to the top. done.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the postmortem line "we didn't have a dashboard for that" is a category error — you can never have a dashboard for <i>that</i>. You can have events rich enough to build the answer live. Budget accordingly: dashboards for the questions you must never stop watching, wide events for the questions you haven't met yet.</p>` },

  { eb:"lesson 05 · metrics", title:"Counters: monotonic on purpose", html:`
    <p class="big">A counter only goes up. That sounds like a limitation; it's the entire design. Because the value is <b class="hl">cumulative</b>, nothing that happens between scrapes is ever lost — and because it can only grow, <b class="hl">any observed decrease has exactly one meaning: the process restarted</b>, and the counter was reborn at zero.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">scrapes every 15s across a deploy &middot; what rate() sees</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">scrapes</div><div class="lstep seq" style="--i:0">1000 &rarr; 1300 &rarr; <span style="color:var(--race)">70</span> &rarr; 370 &nbsp;<span style="color:var(--faint)">(restart between scrape 2 and 3)</span></div>
        <div class="lanehead seq" style="--i:1">naive delta</div><div class="lstep bad seq" style="--i:1">370 − 1000 = <b>−630</b> &rarr; the dashboard reports negative traffic &#10007;</div>
        <div class="lanehead seq" style="--i:2">reset rule</div><div class="lstep good seq" style="--i:2">+300, then <b>+70</b> (a drop = reborn at zero: the new value IS the increase), then +300</div>
        <div class="lanehead seq" style="--i:3">rate()</div><div class="lstep good seq pop" style="--i:3">670 requests / 45s = <b>14.9/s</b> — smooth straight through the deploy &#10003;</div>
      </div>
      <div class="dnote seq" style="--i:4">This is why events are counters and not gauges, and why every panel says rate(x[5m]) instead of plotting x raw: the counter carries the truth <b style="color:var(--ordered)">between and across</b> scrapes; rate() decodes it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Three honesty notes about rate(). It's a <b class="hl">per-second average over the window</b> — a 5m window smooths any burst shorter than 5 minutes, so a 10-second spike becomes a gentle bump; shrink the window to sharpen, at the cost of noise. Prometheus's rate() <b class="hl">extrapolates</b> slightly to the window's edges (scrapes rarely align with them), so increase() can return non-integers on integer counters. And rate() needs <b class="hl">at least two samples inside the range</b> — a 5m range over a 4m scrape interval intermittently finds one, and the panel blinks empty; keep the range at least 2× (comfortably 4×) the scrape interval. None of the three is a bug; all are the compression being visible.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the reset rule</div>
      <pre class="code">function increase(samples) {
  let inc = 0;
  for (let i = 1; i &lt; samples.length; i++) {
    const d = samples[i].v - samples[i - 1].v;
    <span class="ok">inc += d &gt;= 0 ? d : samples[i].v;</span>  <span class="cm">// drop = restart-from-0</span>
  }
  return inc;
}
<span class="cm">// rate = increase / window-seconds — never negative</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the counter/rate contract is the load-bearing wall under every RPS and error-rate panel you have. When a dashboard shows negative traffic, or deploy days look mysteriously quiet, you're looking at hand-rolled counter math missing the reset rule — the first spot-the-bug in this course, because it's the first one in real life.</p>` },

  { eb:"lesson 06 · metrics", title:"Gauges: the truth, sampled", html:`
    <p class="big">A gauge is a <b class="hl">snapshot</b>: memory in use, queue depth, connections open — a value that goes up and down and is only ever true <i>at the instant it was scraped</i>. Between scrapes, the gauge knows nothing. That gap is not a corner case; it's where incidents live.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">60s scrape interval &middot; a 30s allocation burst &middot; an OOM kill</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">14:31:00</div><div class="lstep seq" style="--i:0">scrape: memory 61% — recorded &#10003;</div>
        <div class="lanehead seq" style="--i:1">14:31:15</div><div class="lstep bad seq" style="--i:1">burst begins: 61% &rarr; 97% in twenty seconds — <b>no scrape happens; never recorded</b></div>
        <div class="lanehead seq" style="--i:2">14:31:40</div><div class="lstep bad seq" style="--i:2">OOM kill — the pod is gone &#10007;</div>
        <div class="lanehead seq" style="--i:3">14:32:00</div><div class="lstep seq" style="--i:3">scrape: target missing &middot; panel shows 61% &rarr; <i>gap</i> &rarr; "memory looked fine"</div>
      </div>
      <div class="dnote seq" style="--i:4">Counters aggregate BETWEEN scrapes — nothing escapes them. Gauges are only the instants. Anything spiky that matters needs a counter, a histogram, or the kernel's own record (<b style="color:var(--ordered)">OOMKilled, restart counts</b>) — evidence that can't be missed.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The classification rule: <b class="hl">events get counters, states get gauges.</b> Requests, errors, bytes, retries — events; count them. Memory, queue depth, open connections, temperature — states; sample them. The classic sin is an event metric implemented as a gauge ("errors in the last minute, computed by the app") — it can't be rate()d, resets lie, restarts zero it, and bursts between scrapes evaporate. When a state's <i>extremes</i> matter more than its shape, export a high-water-mark gauge (max since last scrape) or a histogram of the state's observations.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; choosing the instrument</div>
      <pre class="code"><span class="cm">// events -&gt; counter (nothing between scrapes is lost)</span>
metrics.counter("http_requests_total").inc();
<span class="cm">// states -&gt; gauge (true only at scrape instants)</span>
metrics.gauge("pool_connections_active").set(pool.active);
<span class="ok">// spiky state you must not miss -&gt; record the extreme</span>
metrics.gauge("pool_waiters_max").set(pool.maxWaitersSinceScrape());</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "the graph looked fine right before the crash" is one of the most repeated sentences in postmortems, and it's almost always this lesson: a gauge testified about instants, and the incident happened between two of them. Knowing which signals <i>can't</i> miss things — counters, histograms, kernel events — is what lets you trust a quiet dashboard.</p>` },

  { eb:"lesson 07 · metrics", title:"Histograms: buckets, not values", html:`
    <p class="big">You cannot afford to store every latency. A histogram is the compromise the whole industry landed on: <b class="hl">predefine boundary edges, keep only a count per bucket</b> — plus a running sum and total. The values are gone forever; the <i>shape</i> survives, at a few dozen counters of cost, no matter the traffic.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">a request takes 342ms &middot; what the histogram actually stores</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">observe</div><div class="lstep seq" style="--i:0">342ms arrives &rarr; find the first bucket with 342 &le; bound</div>
        <div class="lanehead seq" style="--i:1">buckets</div><div class="lstep seq" style="--i:1">le=100: 4,022 &middot; le=250: 6,910 &middot; <b style="color:var(--ordered)">le=500: 8,241+1</b> &middot; le=1000: 8,410 &middot; le=+Inf: 8,433</div>
        <div class="lanehead seq" style="--i:2">also</div><div class="lstep seq" style="--i:2">sum += 342 &middot; count += 1 &nbsp;<span style="color:var(--faint)">(so mean = sum/count is exact)</span></div>
        <div class="lanehead seq" style="--i:3">forgotten</div><div class="lstep bad seq pop" style="--i:3">"342" itself — inside (250, 500] every value is now <b>indistinguishable</b></div>
      </div>
      <div class="dnote seq" style="--i:4">Prometheus exposes buckets cumulatively (le = "less or equal") — each bucket contains everything below it. Cumulative counts are still just counters: <b style="color:var(--ordered)">rate() them, sum them across hosts</b>, and the whole metrics algebra keeps working.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The design act is choosing the boundaries, and it happens <b class="hl">before the data exists</b>. Too few buckets and everything interesting hides inside one; too many and you've reinvented cardinality explosion (each bucket is a series — remember lesson 03). The two rules that survive contact with production: <b class="hl">put an edge at every number you've promised</b> (your SLO threshold — a promise inside a bucket can only be estimated), and cluster resolution where your traffic actually lives, sparse everywhere else.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; record</div>
      <pre class="code">record(v) {
  <span class="ok">let i = this.bounds.findIndex(b =&gt; v &lt;= b);</span>  <span class="cm">// le, not lt</span>
  if (i === -1) i = this.bounds.length;         <span class="cm">// +Inf bucket</span>
  this.counts[i]++; this.total++; this.sum += v;
}
<span class="cm">// bounds chosen for a 300ms SLO:</span>
<span class="cm">//   [50, 100, 200, 300, 600, 1200, 3000] — the promise is an edge</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every latency percentile you've ever read off a dashboard came out of this structure — which means every one of them inherited the boundary choices someone made in a code review months earlier. The next lesson is about exactly how that inheritance works, and when it lies.</p>` },

  { eb:"lesson 08 · metrics", title:"The p99 is an interpolation", html:`
    <p class="big">histogram_quantile(0.99, ...) does not know your p99. It knows which <b class="hl">bucket</b> the 99th-percentile rank falls into, and then it <b class="hl">draws a straight line through the bucket</b> and reads a point off it — assuming observations spread evenly between the edges. Your dashboard's p99 is that estimate.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">100 observations &middot; where's the p99? &middot; bounds [100, 250, 500, 1000]</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">counts</div><div class="lstep seq" style="--i:0">le=100: 40 &middot; le=250: 30 &middot; le=500: 20 &middot; le=1000: 10</div>
        <div class="lanehead seq" style="--i:1">rank</div><div class="lstep seq" style="--i:1">0.99 &times; 100 = rank 99 &rarr; cumulative crosses 99 in bucket <b>(500, 1000]</b></div>
        <div class="lanehead seq" style="--i:2">interpolate</div><div class="lstep seq" style="--i:2">9 of that bucket's 10 observations sit below the rank &rarr; 90% deep &rarr; 500 + 0.9 &times; 500 = <b>950ms</b></div>
        <div class="lanehead seq" style="--i:3">reality</div><div class="lstep bad seq pop" style="--i:3">every actual sample in that bucket was <b>800ms</b> — the panel reports a latency nobody experienced</div>
      </div>
      <div class="dnote seq" style="--i:4">Worst-case error = the width of the bucket the quantile lands in. Edge cases you must know: a rank in the <b style="color:var(--race)">+Inf bucket returns the largest finite bound</b> (your p99 "pins" at the top edge — a tell that your bounds are too low), and quantiles below the first bound interpolate from zero.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This is not a reason to distrust histograms — it's the price of merging. Percentile sketches with tighter error exist, but bucket histograms bought the property everything else in this course depends on: <b class="hl">counts add across hosts</b>. The operational skill is reading the estimate like an estimate: a p99 that plateaus exactly at a bucket edge, or "jumps" between edges with no traffic change, is the interpolation showing through — the distribution moved <i>within</i> a bucket, or crossed one.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; quantile</div>
      <pre class="code">quantile(q) {
  const rank = q * this.total;
  let cum = 0;
  for (let i = 0; i &lt; this.counts.length; i++) {
    const prev = cum; cum += this.counts[i];
    if (cum &gt;= rank &amp;&amp; this.counts[i] &gt; 0) {
      if (i &gt;= this.bounds.length)              <span class="cm">// +Inf rule</span>
        return this.bounds[this.bounds.length - 1];
      const lo = i === 0 ? 0 : this.bounds[i - 1];
      const hi = this.bounds[i];
      <span class="ok">return lo + (hi - lo) * ((rank - prev) / this.counts[i]);</span>
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> when someone asks "why does our p99 say 950 when the traces all show 800?", the senior answer names the mechanism — rank, bucket, straight line — and the fix — a boundary where the traffic is. Axiom two, in its purest form: the number on the dashboard is <i>made</i>, and you now know the recipe.</p>` },

  { eb:"lesson 09 · metrics", title:"The aggregation trap", html:`
    <p class="big">Forty hosts each report a p99. The fleet panel shows avg(p99) = 310ms, green against a 500ms SLO — while one canary serves 2,900ms to every request it touches. Nothing is misconfigured. The panel is simply computing <b class="hl">a statistic of statistics</b>, and that operation is not math, it's decoration.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">what composes, what doesn't</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">counters</div><div class="lstep good seq" style="--i:0">sum(rate(errors[5m])) across hosts &rarr; <b>exact</b> — counts add, always &#10003;</div>
        <div class="lanehead seq" style="--i:1">histograms</div><div class="lstep good seq" style="--i:1">sum bucket counts, THEN histogram_quantile &rarr; <b>the real fleet p99</b> &#10003;</div>
        <div class="lanehead seq" style="--i:2">percentiles</div><div class="lstep bad seq" style="--i:2">avg(p99) / max(p99) / p99-of-p99s &rarr; a number <b>no request experienced</b> &#10007;</div>
        <div class="lanehead seq" style="--i:3">averages</div><div class="lstep bad seq pop" style="--i:3">avg of per-host averages &rarr; weights <b>hosts</b>, not requests — the idle host votes equal to the loaded one &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:4">The rule that generates all the rows: <b style="color:var(--ordered)">aggregate raw quantities, compute results LAST</b>. A percentile, a ratio, an average — anything already divided or ranked — has thrown away the weights it would need to combine again.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Run the canary numbers once and the lesson sticks: 39 hosts at p99 240ms plus one at 2,900ms averages to 306ms — "compliant" — while ~2.5% of all requests (the canary's entire traffic) are 6× over the SLO. Merge the histograms instead and the fleet p99 lands where the pain is. Same trap, subtler costume: averaging <i>error ratios</i> across shards (divide first, weight lost) instead of sum(errors)/sum(requests). If it's already a ratio, a rank, or a mean — it doesn't add.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the honest fleet quantile</div>
      <pre class="code"><span class="cm">// per-host: export BUCKETS (counters), never percentiles</span>
histogram_quantile(0.99,
  <span class="ok">sum by (le) (rate(http_duration_bucket[5m]))</span>)
<span class="cm">// sum by (le): merge every host's buckets — exact —</span>
<span class="cm">// then compute the quantile ONCE, over the fleet</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the axiom-two flagship, and a genuine seniority marker — "you can't average percentiles" plus the <i>why</i> (results don't carry weights) plus the fix (merge distributions, compute last). It's also why histograms exist at all: they're the only latency representation that survives aggregation with the truth intact.</p>` },

  { eb:"lesson 10 · metrics", title:"RED, USE, and the golden signals", html:`
    <p class="big">At 3am you don't want creativity; you want a checklist that covers the search space. Three overlapping ones survived contact with the industry: <b class="hl">RED</b> for things that serve requests, <b class="hl">USE</b> for things requests consume, and Google's <b class="hl">four golden signals</b> bridging both.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the checklists &middot; and what each one covers</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">RED</div><div class="lstep seq" style="--i:0"><b>R</b>ate &middot; <b>E</b>rrors &middot; <b>D</b>uration — per service, per route &rarr; <i>is this SERVICE healthy?</i></div>
        <div class="lanehead seq" style="--i:1">USE</div><div class="lstep seq" style="--i:1"><b>U</b>tilization &middot; <b>S</b>aturation &middot; <b>E</b>rrors — per resource (CPU, pool, disk, queue) &rarr; <i>is this RESOURCE the bottleneck?</i></div>
        <div class="lanehead seq" style="--i:2">golden</div><div class="lstep seq" style="--i:2">latency &middot; traffic &middot; errors &middot; <b>saturation</b> — RED plus the early-warning fourth</div>
        <div class="lanehead seq" style="--i:3">the split</div><div class="lstep good seq pop" style="--i:3">RED sees the <b>symptom</b> (users hurting) &middot; USE finds the <b>suspect</b> (what ran out)</div>
      </div>
      <div class="dnote seq" style="--i:4">Saturation deserves its reputation: it's the leading indicator. Utilization at 80% is a fact; <b style="color:var(--ordered)">a queue forming</b> — waiters on the pool, depth climbing, load shedding — is the future arriving early.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The triage choreography: <b class="hl">RED first, on the service the users touch</b> — it confirms and scopes the symptom. Then USE, <b class="hl">walking the dependency chain</b> — for each resource the slow path consumes, check utilization, saturation, errors, and the bottleneck introduces itself. The discipline is instrumenting both <i>in advance</i> (axiom one): every service gets RED per route the day it ships; every finite resource — pools, queues, threads, disks — gets USE the day it's provisioned. Dashboards then write themselves, identically, for every service you own.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; RED per route, USE per pool — the minimum kit</div>
      <pre class="code"><span class="cm">// RED — emitted by middleware, free forever after:</span>
rate(http_requests_total{route="/checkout"}[5m])            <span class="cm">// R</span>
rate(http_requests_total{route="/checkout",code=~"5.."}[5m]) <span class="cm">// E</span>
histogram_quantile(0.99, sum by (le)                        <span class="cm">// D</span>
  (rate(http_duration_bucket{route="/checkout"}[5m])))
<span class="cm">// USE — for the connection pool:</span>
pool_in_use / pool_size                       <span class="cm">// utilization</span>
<span class="ok">pool_waiters                                  // saturation!</span>
pool_checkout_timeouts_total                  <span class="cm">// errors</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> checklists beat brilliance under adrenaline. "Walk RED on the service, then USE down its dependencies" is a complete, teachable triage algorithm — and in interviews, structuring your answer around RED/USE instantly signals you've actually held a pager.</p>` },
];

/* ---- lesson <-> skill cross-links ----
   Lessons teach a concept; the matching skill checks comprehension from a
   different angle. Indices reference the FINAL lesson order (see the LESSON
   PLAN at the top of this file) — packs 10/20 fill in lessons 10-28. */
// skill (drill) id -> the lesson whose concept it tests (0-based index)
const DRILL_LESSON = {
  counterrate:4, histquantile:7, histmerge:8, traceassemble:10, headtail:13,
  burnrate:20, canonlog:17, cardinality:2,
  picksignal:1, culprithop:12, bucketdesign:6, alertdesign:20, cardtriage:2,
  missingtelemetry:27, deploycorr:23,
};
// lesson index -> where to go practice it { mod, drill? }
const LESSON_PRACTICE = {
  0:{mod:"signals"}, 1:{mod:"bank",drill:"picksignal"}, 2:{mod:"primitives",drill:"cardinality"},
  3:{mod:"tradeoffs"}, 4:{mod:"primitives",drill:"counterrate"}, 5:{mod:"signals"},
  6:{mod:"bank",drill:"bucketdesign"}, 7:{mod:"primitives",drill:"histquantile"},
  8:{mod:"primitives",drill:"histmerge"}, 9:{mod:"tradeoffs"},
  10:{mod:"primitives",drill:"traceassemble"}, 11:{mod:"signals"},
  12:{mod:"bank",drill:"culprithop"}, 13:{mod:"primitives",drill:"headtail"},
  14:{mod:"signals"}, 15:{mod:"primitives",drill:"canonlog"}, 16:{mod:"signals"},
  17:{mod:"primitives",drill:"canonlog"}, 18:{mod:"bughunt"}, 19:{mod:"tradeoffs"},
  20:{mod:"primitives",drill:"burnrate"}, 21:{mod:"signals"},
  22:{mod:"tradeoffs"}, 23:{mod:"bank",drill:"deploycorr"}, 24:{mod:"incident"},
  25:{mod:"incident"}, 26:{mod:"incident"}, 27:{mod:"bank",drill:"missingtelemetry"},
  28:{mod:"incident"},
};
