"use strict";
/* Performance & Queueing Bootcamp — authored content: course config, module
   registry, quiz, drills, flashcards, spot-the-bug cards, write-it exercises,
   lessons, cross-links.

   CONTENT PACKS: js/packs/*.js load AFTER this file and BEFORE the shared
   engine (../js/app.js). A pack appends content by pushing into these
   collections (LESSONS, QUIZ, DRILLS.<module>, CARDS, BUGHUNT, WRITE, MODULES)
   and registering cross-links in DRILL_LESSON / LESSON_PRACTICE.

   LESSON PLAN (final indices — the lesson packs MUST keep this order):
     content.js  0-3   foundations
     pack 10     4-9   the tail (distributions, percentiles, fan-out,
                       variability, coordinated omission, histograms)
     pack 20     10-15 load behavior (open vs closed, overload, shedding,
                       backpressure, discipline, adaptive limits)
     pack 30     16-20 measurement (benchmark lies, measuring the right
                       thing, USE/RED, profiling, the knee)
     pack 40     21-25 capacity (capacity math, autoscaling lag, retries,
                       caching, speed of light)
   Cross-links below reference these final indices. */

/* course config: the engine reads storage keys and defaults here */
const COURSE = {
  id: "performance",
  storagePrefix: "perf",
};

const MODULES = [
  { id:"learn", label:"lessons", type:"learn" },
  { id:"model", label:"the model", type:"lesson",
    eyebrow:"module 00", title:"The saturation model", conceptLesson:0,
    cardNote:"predict the behavior",
    poolTitle:"Predict the behavior", poolQuestion:"What actually happens under load?",
    lead:`Two axioms generate this whole field: <b style="color:var(--text)">every system is a queue</b> (or a network of them — arrivals, service times, servers) and <b style="color:var(--text)">latency explodes as utilization approaches saturation</b>. Everything else — percentiles, shedding, adaptive limits, capacity math — is engineering around those two facts.`,
    sub:`Small numbers, big consequences. Do the arithmetic in your head before you tap — answer, read why, then step on.` },
  { id:"primitives", label:"primitives", type:"drills",
    eyebrow:"module 01", title:"Build the performance toolkit",
    lead:`Little's law, streaming histograms, EWMA, the M/M/1 wait curve, fan-out tail math, open-loop load, deadline shedding, AIMD limits. Each is a small rule that stays honest while traffic misbehaves. Choose the correct line at each decision point, then run the reference to watch the invariant hold in a simulated system.` },
  { id:"queuesim", label:"saturation sim", type:"sim", renderFn:"renderQueueSimModule",
    eyebrow:"module 02", title:"The saturation simulator", conceptLesson:3 },
  { id:"tradeoffs", label:"trade-offs", type:"cards",
    eyebrow:"module 03", title:"Trade-offs", conceptLesson:4,
    lead:`No code here — just the judgment calls that separate reading dashboards from understanding load. Tap to flip, then advance. Rehearse until they're reflexive.` },
  { id:"bank", label:"problem bank", type:"drills",
    eyebrow:"module 04", title:"Problem bank",
    lead:`The diagnosis problems built on the primitives — reading the knee off a load test, retry-storm math, the percentile-merging trap, coordinated-omission correction, queue discipline under fire, autoscaling-lag sizing, cache hit-ratio capacity. State the invariant in your head before you choose.` },
  { id:"bughunt", label:"spot the bug", type:"bugs",
    eyebrow:"module 05", title:"Spot the bug",
    lead:`A full performance component — the histogram, the load generator, the shedder, the limiter, the benchmark harness — with one scenario describing how it misbehaves in production and one subtle fault hiding in the implementation. Read the whole thing, tap the buggy line(s), then check.`,
    sub:`Reading real code and finding the fault is the actual job. One implementation at a time — read the scenario, scan the code, pick the line(s), then check.` },
  { id:"write", label:"write it", type:"write",
    eyebrow:"module 06", title:"Write it",
    lead:`No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the implementation, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.`,
    sub:`This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. A runaway loop just times out — the sandbox can't freeze the page.` },
  { id:"test", label:"test yourself", type:"test",
    eyebrow:"test yourself", title:"Test mode",
    lead:`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`,
    sub:`Prep tip: once you can pass these cold, rebuild each pattern in a blank file while talking it through out loud — that's the skill the interview actually grades.` },
];

/* ---- model module: predict-the-behavior quiz ---- */
const QUIZ = [
  { code:`// checkout service: one worker, 10ms mean service time
// (capacity μ = 100 req/s). steady traffic: 50 req/s,
// mean latency ≈ 20ms.  a promo doubles traffic:
offeredLoad = 100 req/s   // exactly μ. what happens?`,
    options:["the queue never stops growing — at ρ = 1.0 there is no steady state; latency climbs until timeouts or memory put a stop to it",
             "latency doubles to about 40ms — twice the traffic, twice the wait",
             "latency stays ~20ms — 100 req/s is exactly what the worker can process"],
    answer:0,
    whys:[
      "Right. W = S/(1−ρ) has a pole at ρ = 1. At exactly capacity there is zero headroom to burn down bursts, and real arrivals ARE bursty — every burst adds backlog and nothing ever removes it. The queue does a drift-free random walk upward until something breaks.",
      "Latency isn't linear in load — it's hyperbolic in HEADROOM. Going from ρ = 0.5 to 0.75 roughly doubles the wait; going to 1.0 doesn't double anything, it removes the steady state entirely.",
      "'Exactly at capacity' works only if requests arrive perfectly evenly spaced and each takes exactly 10ms. Variability is the whole story: bursts queue, and at ρ = 1 the queue has no draining force left. Average capacity is not burst capacity."] },

  { code:`// the API gateway, mid-incident. latency panel is broken:
//   in-flight requests (gauge):  1,200
//   completion rate:             100 req/s
// how long are users actually waiting?`,
    options:["about 12 seconds — Little's law: W = L/λ = 1200/100; no latency metric needed",
             "can't be known without a latency histogram",
             "about 12 milliseconds — 1200/100"],
    answer:0,
    whys:[
      "Right. L = λW holds for any stable system — no assumptions about distributions, scheduling, or independence. Two boring observables (a gauge and a rate) hand you the number the broken panel was for: 12 full seconds. (Little's law proper speaks of long-run averages; with the gauge roughly steady, this is the honest instantaneous estimate.)",
      "That's the magic of Little's law: it's distribution-free. You don't need the histogram to know the AVERAGE wait — occupancy divided by throughput is the average wait. The histogram tells you how the pain is shared; the law tells you how much pain there is.",
      "Units: requests divided by requests-per-SECOND gives seconds. 12ms would require a completion rate of 100 requests per millisecond — a hundred thousand per second. Dimensional analysis is the five-second sanity check."] },

  { code:`// capacity review. the slide says:
// "we run at 80% utilization — 20% headroom,
//  so we can safely absorb 20% more traffic."
// mean service time: 10ms. what does the queue say?`,
    options:["at ρ=0.8 the mean wait is already ~5× service time; +20% traffic lands at ρ≈0.96 — ~25× — one deploy or one slow host from the wall",
             "the slide is right: 20% more traffic, 20% more latency, still fine",
             "as long as utilization stays under 100%, latency stays near the 10ms service time"],
    answer:0,
    whys:[
      "Right. W = S/(1−ρ): at 0.8 the mean is ~50ms, at 0.96 it's ~250ms, and the p99 is far worse. The last 20% of utilization contains almost all of the latency — 'headroom' measured in utilization points is not linear in pain.",
      "The linear intuition is exactly what the hockey stick breaks: halving your remaining headroom DOUBLES the wait. From 0.8 to 0.96 you halve it more than twice over — that's a 5× jump in mean wait, not 20%.",
      "At 80% busy the mean latency is already ~5× the service time — queueing dominates service long before 100%. 'Under 100% = fine' is the misread that turns a healthy-looking fleet into an incident at the first burst."] },

  { code:`// a search request fans out to 100 leaf shards
// and waits for ALL of them.
// each shard: p50 = 5ms, p99 = 200ms
// what does the USER's latency look like?`,
    options:["~63% of searches wait ≥200ms — the per-shard p99 is now below the request-level MEDIAN",
             "1% of searches wait ~200ms — the p99 passes through unchanged",
             "the request median stays ~5ms — percentiles don't compose across calls"],
    answer:0,
    whys:[
      "Right. The request is fast only if every leg is fast: 0.99¹⁰⁰ ≈ 0.37. So 63% of requests hit at least one shard's tail — what was a 1-in-100 event per shard is the TYPICAL experience at fan-out 100. Tail latency is a fan-out multiplier, not a constant.",
      "That would require shard slowness to be perfectly correlated (all slow together). Independent legs multiply: each of the 100 shards gets its own 1% dice roll, and the request loses if ANY of them comes up slow.",
      "Percentiles compose exactly the wrong way for you: the request waits for the max of 100 draws, and the max's median lives deep in the single-draw tail. This is why tail latency, not median latency, governs fan-out architectures."] },

  { code:`// 10 hosts each report their own p99 to the dashboard,
// which shows:  avg(p99₁ … p99₁₀) = 48ms
// the SLO is p99 ≤ 100ms. are you inside it?`,
    options:["unknowable from these numbers — percentiles of subpopulations don't average; one hot host's tail can put the fleet p99 far above 100ms",
             "yes — 48ms is comfortably under 100ms",
             "use max(host p99s) instead — that IS the fleet p99"],
    answer:0,
    whys:[
      "Right. avg(p99s) is a made-up statistic: no request experienced it, and it weights each HOST equally regardless of traffic. The only valid aggregation is merging the underlying histograms — sum the bucket counts, then recompute the quantile over the merged population.",
      "If the host serving 30% of traffic has p99 400ms and nine near-idle hosts report 9ms, the average reads ~48 — but the worst 1% of ALL requests live entirely on the sick host, so the fleet p99 is that host's ~p96.7: plausibly hundreds of ms, while the dashboard stays green.",
      "max(host p99s) is an upper BOUND on the fleet p99 — it never under-reports, but one sick canary taking 0.1% of traffic pages you for a healthy fleet, and it can't answer p50 or p95 at all. A bound is not the value."] },

  { code:`// load test: 50 virtual users in a loop —
//   send → await response → send next
// deploy A reported: 5,000 rps @ p99 40ms
// production, same deploy: falls over at 3,000 rps. why?`,
    options:["closed loop: 50 users can never have more than 50 requests outstanding — as the server slows, the TEST slows with it, so overload physics never appear",
             "the production hardware must be slower than the load-test rig",
             "50 users can't generate 5,000 rps, so the reported number was invented"],
    answer:0,
    whys:[
      "Right. In a closed loop, arrival rate = concurrency ÷ latency: it self-throttles at the exact moment the server hurts. Production users are open-loop — they arrive on the world's schedule, keep arriving while you're slow, and pile into a queue the benchmark structurally could not create.",
      "Maybe — but it doesn't explain the SHAPE. The test tool couldn't have shown the cliff on any hardware: with at most 50 in flight, the queue can never exceed 50. Interrogate the loop model before the machines.",
      "50 users × ~10ms per round trip ≈ 5,000 rps — the throughput was real. What was missing is what happens when request 51 arrives while the server is busy: in the closed-loop world, request 51 politely doesn't exist."] },

  { code:`// the payment service browns out: 50% of calls time out.
// every caller retries twice (3 attempts max).
// pre-incident offered load: 1,000 rps. now?`,
    options:["~1,750 rps offered against a service already failing at 1,000 — the retries deepen the exact brownout they respond to",
             "still 1,000 rps — retries replace failed requests, they don't add to them",
             "retries smooth the load out over time, easing the brownout"],
    answer:0,
    whys:[
      "Right. Expected attempts per request = 1 + 0.5 + 0.25 = 1.75. And it feeds back: more load → higher failure rate → more retries → more load. This is how a 30-second blip becomes a 2-hour metastable outage that persists after the original cause is gone.",
      "A retry is a brand-new request on the wire, and the failed attempt wasn't free — it consumed a timeout's worth of server work before dying. The service pays for the failure AND the replacement.",
      "Only backoff, jitter, and budgets spread anything. Naive retries fire immediately and synchronized — all the clients that timed out together retry together, arriving as a wave at the worst possible moment."] },

  { code:`// single-threaded latency probe, one request at a time:
//   loop { t = now(); call(); record(now() - t); sleep(100ms) }
// the server freezes for 10 seconds during the run.
// what does the probe's histogram show?`,
    options:["one ~10s sample — the ~100 requests that WOULD have been sent during the freeze (and waited up to 10s each) were never sent, so never recorded",
             "about 100 samples near 10s — every scheduled probe observed the freeze",
             "latency is unaffected; a freeze shows up in the error-rate panel instead"],
    answer:0,
    whys:[
      "Right — coordinated omission: the probe coordinates with the server's worst moment and stops sampling precisely then. One bad sample out of thousands barely moves the p99.9, so the histogram reads ~100× better than what users lived through.",
      "That's what an honest open-loop harness records — one that schedules sends from the intended timeline and measures from the intended send time (wrk2, HdrHistogram's correction). The single-threaded wait-then-send probe structurally cannot produce those samples.",
      "Nothing errored — the requests eventually succeeded, slowly, and the suppressed ones were never sent at all. The freeze converts into MISSING latency samples: invisible in the latency panel, invisible in the error panel. That's what makes it insidious."] },

  { code:`// CDN in front of the origin: 50,000 rps at the edge,
// hit ratio 99%. origin serves the misses: 500 rps.
// a deploy invalidates a hot key family → hit ratio 97%.
// origin traffic now?`,
    options:["1,500 rps — a 2-point hit-ratio dip TRIPLED origin load; misses scale with (1−h), not with h",
             "~510 rps — a 2% dip means about 2% more origin traffic",
             "the origin is insulated — the CDN absorbs misses too"],
    answer:0,
    whys:[
      "Right. Origin load = λ(1−h): (1−h) went from 0.01 to 0.03 — a 3× multiplier on everything the origin does. At high hit ratios the origin's whole world is a small difference between two big numbers, and small dips in h move it violently.",
      "The 2 points came off the HIT ratio, but origin load tracks the MISS ratio — which tripled. This is the arithmetic that catches teams who sized the origin off average cache behavior.",
      "A miss, by definition, goes through to the origin. The CDN absorbs hits; the origin owns every miss, plus the stampede when a popular key expires and a thousand concurrent misses for the same key arrive at once."] },

  { code:`// traffic steps 100 → 250 rps. fleet capacity: 150 rps.
// autoscaler: 60s metric delay + 60s instance boot.
// what exists by the time new capacity serves traffic?`,
    options:["a backlog of (250−150) × 120 = 12,000 requests — users in it wait tens of seconds; the scale-out fixed the future, not the queue",
             "not much: the fleet was only 100 rps short, and the gap closes within two minutes",
             "no backlog — the autoscaler reacts to the first elevated sample"],
    answer:0,
    whys:[
      "Right. During the lag, excess arrivals queue at (λ−μ) = 100/s for 120s. And the new capacity must then DRAIN 12,000 requests while 250 rps keeps arriving — only μ−λ = 50 rps chips at the backlog, so it takes another FOUR minutes: a 2-minute lag buys a 6-minute incident, with peak waits around 40s (12,000/300, by Little).",
      "'Only 100 rps short' × 120 seconds IS the incident: twelve thousand queued users, every one of them experiencing multi-second waits. 'Fixed within two minutes' describes the capacity graph — the users lived in the queue.",
      "The scaler cannot react to one sample: metrics aggregate over a window, evaluation runs on a period, instances take time to boot and warm. Minutes of lag is structural. Spikes measured in seconds must be absorbed by headroom, a bounded queue, or shedding — the scaler arrives afterward."] },

  { code:`// worker pulls from an UNBOUNDED in-memory queue.
// producer: 120 jobs/s.  worker: 100 jobs/s.
// error rate: 0%. "no errors, no drops — healthy!"`,
    options:["the queue grows 20 jobs/s forever — after an hour, 72,000 queued ≈ 12-minute waits (Little), then the process OOMs",
             "healthy is right: throughput is positive and nothing is failing",
             "the queue finds an equilibrium depth once it gets large enough"],
    answer:0,
    whys:[
      "Right. An unbounded queue converts overload into latency and memory instead of errors. Every job accepted joins an ever-longer line: 72,000 backlog ÷ 100/s = 720 seconds of wait. Zero errors while λ > μ is the most dangerous graph in the building.",
      "'No errors' only means nobody has been told no. The work is being accepted into a line that grows without bound — the system is converting every future user's patience and every megabyte of RAM into the appearance of health.",
      "Queues above capacity have no restoring force: arrival rate and service rate don't depend on depth, so nothing pushes it back down. Equilibrium requires λ < μ, or a bound that turns excess into backpressure or rejections."] },

  { code:`// overloaded API, FIFO queue, clients time out at 30s.
// mid-incident, ops flips to LIFO + shed-expired.
// what changes for users?`,
    options:["new requests start succeeding immediately — the old queued ones are dropped, but their callers had already timed out and left",
             "nothing: the same number of requests get served either way",
             "LIFO worsens the tail, so the p50 gets worse too"],
    answer:0,
    whys:[
      "Right. Under overload, FIFO spends the server on requests whose callers hung up seconds ago — completions nobody receives. LIFO hands capacity to requests with a live listener and a full deadline budget; goodput and the p50 come back while the doomed backlog drains to the shedder.",
      "Same THROUGHPUT, wildly different GOODPUT. A response delivered after its caller's timeout counts for exactly nothing — worse than nothing, since the caller already retried, adding load.",
      "LIFO does brutalize the unlucky old requests — who were already past saving under FIFO too. Trading a dead tail for a living median is the entire point; it's why 'adaptive LIFO' is a documented overload pattern, not a hack."] },
];

/* ---- drill definitions (fill the blank) ---- */
const DRILLS = {
  primitives:[
    { id:"littlelaw", title:"Little's Law Solver", why:"three observables, one law — measure two, derive the third", demo:demoLittleLaw,
      pre:`// L = avg in-flight · λ = throughput · W = avg time in system
// holds for ANY stable system — no distribution assumptions
function littleSolve({ L, lambda, W }) {
  const known = [L, lambda, W].filter(v => v != null).length;
  if (known !== 2) throw new Error("need exactly two");`,
      blank:{ q:"The gateway gauge shows 120 in flight at 60 req/s and the latency panel is down. Which body derives the missing number — with units that survive the incident review?",
        options:[
`  if (L == null)      return { L: lambda * W, lambda, W };
  if (lambda == null) return { L, lambda: L / W, W };
  return { L, lambda, W: L / lambda };`,
`  if (L == null)      return { L: lambda / W, lambda, W };
  if (lambda == null) return { L, lambda: L * W, W };
  return { L, lambda, W: lambda / L };`,
`  if (L == null)      return { L: lambda * W, lambda, W };
  if (lambda == null) return { L, lambda: L / W, W };
  return { L, lambda, W: lambda / L };`],
        answer:0,
        whys:["Right. L = λW rearranges three ways: occupancy = rate × time, rate = occupancy ÷ time, time = occupancy ÷ rate. 120 in flight at 60/s means users are waiting 2 full seconds — no histogram required.",
              "Every branch is inverted: rate divided by time, occupancy multiplied into rate. The units come out as nonsense (req/s² is not a latency), and the '2 seconds' answer becomes 0.5. Dimensional analysis is the five-second check that catches this before the incident review does.",
              "Two branches right, the one you need wrong: W = λ/L says 60/120 = 0.5s instead of 2s — a 4× lie exactly when you're diagnosing from the gauge. Time in system is what's IN the system divided by how fast it drains: L/λ."] },
      post:`}` },

    { id:"histogram", title:"Streaming Histogram", why:"the honest latency primitive: bounded memory, mergeable, never under-reports", demo:demoHistogram,
      pre:`class Histogram {
  // counts[i] = samples in (bounds[i-1], bounds[i]];
  // the final slot catches everything past the top bound
  record(v) {
    let i = 0;
    while (i < this.bounds.length && v > this.bounds[i]) i++;
    this.counts[i]++;
    this.total++;
  }
  percentile(p) {
    if (this.total === 0) return undefined;  // no data, no answer`,
      blank:{ q:"The SLO dashboard reads p99 off this histogram. Which body reports a number no real sample beats — instead of one the tail quietly exceeds?",
        options:[
`    const rank = Math.ceil((p / 100) * this.total);
    let cum = 0;
    for (let i = 0; i < this.counts.length; i++) {
      cum += this.counts[i];
      if (cum >= rank)
        return i < this.bounds.length ? this.bounds[i] : Infinity;
    }`,
`    const rank = Math.ceil((p / 100) * this.total);
    let cum = 0;
    for (let i = 0; i < this.counts.length; i++) {
      cum += this.counts[i];
      if (cum >= rank)
        return i === 0 ? 0 : this.bounds[i - 1];
    }`,
`    const rank = Math.floor((p / 100) * this.total);
    let cum = 0;
    for (let i = 0; i < this.counts.length; i++) {
      cum += this.counts[i];
      if (cum >= rank)
        return i < this.bounds.length ? this.bounds[i] : Infinity;
    }`],
        answer:0,
        whys:["Right. Round the rank UP, walk the cumulative counts, and report the bucket's UPPER bound. The answer may over-report by one bucket width; it can never under-report — conservative in exactly the direction an SLO needs.",
              "Reports the bucket's LOWER edge — a value every sample in that bucket is allowed to exceed. With doubling bucket widths the dashboard under-reports the tail by up to 2×, and you learn about SLO breaches from customers instead of graphs.",
              "floor() can produce rank 0 (any small p × total), and the very first cumulative sum satisfies rank 0 before a single sample is counted — low percentiles pin to the first bucket and boundary percentiles land one bucket low. Ranks count samples: they start at 1, so round up."] },
      post:`  }
}` },

    { id:"ewma", title:"EWMA Smoother", why:"see the trend without paging on every spike", demo:demoEwma,
      pre:`// alpha = weight of the NEW sample
// (0.2 = calm and laggy, 0.9 = jumpy and current)
class Ewma {
  constructor(alpha) { this.alpha = alpha; this.v = null; }
  update(sample) {`,
      blank:{ q:"This EWMA feeds the latency alert. Which body registers a real regression within a few samples — without paging on every one-off spike?",
        options:[
`    if (this.v === null) this.v = sample;
    else this.v = this.alpha * sample
               + (1 - this.alpha) * this.v;
    return this.v;`,
`    if (this.v === null) this.v = sample;
    else this.v = (1 - this.alpha) * sample
               + this.alpha * this.v;
    return this.v;`,
`    if (this.v === null) this.v = 0;
    this.v = this.alpha * sample
           + (1 - this.alpha) * this.v;
    return this.v;`],
        answer:0,
        whys:["Right. The new sample gets α of the say, history keeps the rest, and the first sample seeds the average. One 600ms spike against a 100ms baseline moves the signal to 200 — visible, not hysterical — and a sustained shift converges in a handful of samples.",
              "Weights transposed: with α = 0.2 every new sample now gets 80% of the say. The 'smoothed' line IS the noise, and the alert flaps on every GC pause. The naming convention is arbitrary; agreeing with it everywhere is not.",
              "Seeded at 0, the average spends its first ~1/α samples climbing out of a hole that never existed — a bad deploy hides inside the warm-up ramp, and dashboards show a soothing upward glide instead of a step. Seed with the first observation."] },
      post:`  }
  value() { return this.v; }
}` },

    { id:"mm1wait", title:"M/M/1 Wait Estimator", why:"the hockey stick, as one line of math", demo:demoMM1,
      pre:`// exact for M/M/1 (Poisson arrivals, exponential service,
// one server, FIFO). the SHAPE — a pole at ρ = 1 — is what
// generalizes to every real system.
function mm1Wait(lambdaRps, serviceMs) {
  const rho = lambdaRps * serviceMs / 1000;  // utilization`,
      blank:{ q:"Capacity planning asks: what happens to latency as utilization climbs? Which body tells the truth near saturation?",
        options:[
`  if (rho >= 1) return Infinity;  // no steady state
  return serviceMs / (1 - rho);`,
`  return serviceMs * (1 + rho);`,
`  return serviceMs / (1 - rho);`],
        answer:0,
        whys:["Right. W = S/(1−ρ), with the pole guarded: 50% busy → 2× service time, 90% → 10×, 99% → 100×, and at ρ ≥ 1 the honest answer is 'there is no steady state' — Infinity — not a number someone will put on a slide.",
              "A linear model tops out at 2× service time at full utilization — it cannot represent the hockey stick at all. Every capacity decision made with it drives the fleet into a wall the model says isn't there.",
              "Without the guard, ρ = 1.25 returns NEGATIVE 40ms — and the dashboard that plots it, or the autoscaler that compares it, now treats saturation as spectacular latency. Formulas with poles need guards on the pole."] },
      post:`}` },

    { id:"fanout", title:"Fan-out Tail Amplifier", why:"the wider you scatter, the more p99 you gather", demo:demoFanout,
      pre:`// a request fans out to n backends and waits for ALL of
// them. pSlow = P(a single leg exceeds the threshold).
function pTouchesTail(pSlow, n) {`,
      blank:{ q:"Search fans out to 100 shards, each slow 1% of the time. Which body predicts how often a USER waits on the tail?",
        options:[
`  return 1 - Math.pow(1 - pSlow, n);`,
`  return Math.min(1, pSlow * n);`,
`  return Math.pow(pSlow, n);`],
        answer:0,
        whys:["Right. The request is fast only if EVERY leg is fast: P = 1 − 0.99¹⁰⁰ ≈ 63%. The per-shard p99 just became the request's p37 — a 1-in-100 event per shard is the typical experience at fan-out 100.",
              "The linear approximation is only honest while pSlow·n is tiny: at n = 100 it says 100%, at n = 200 it says 200%. Worse, engineers learn it in the safe regime, then scale n and keep trusting it exactly where it breaks.",
              "That's the probability that ALL 100 legs are slow simultaneously — about 10⁻²⁰⁰. It reports that fan-out is perfectly safe, which is precisely backwards: waiting on all legs means ANY slow one hurts you."] },
      post:`}` },

    { id:"openloop", title:"Open-Loop Load Generator", why:"arrivals come from the world's clock, not the server's mood", demo:demoOpenLoop,
      pre:`// virtual-time load generator, one saturable server.
// serviceTimes[i] = how long request i takes once started
function openLoopRun(intervalMs, serviceTimes) {
  let free = 0;
  const lat = [];
  for (let i = 0; i < serviceTimes.length; i++) {`,
      blank:{ q:"The server stalls mid-test. Which body keeps sending on schedule and keeps the backlog IN the recorded latencies?",
        options:[
`    const scheduled = i * intervalMs;
    const start = Math.max(scheduled, free);
    free = start + serviceTimes[i];
    lat.push(free - scheduled);`,
`    const scheduled = Math.max(i * intervalMs, free);
    const start = scheduled;
    free = start + serviceTimes[i];
    lat.push(free - scheduled);`,
`    const scheduled = i * intervalMs;
    const start = Math.max(scheduled, free);
    free = start + serviceTimes[i];
    lat.push(free - start);`],
        answer:0,
        whys:["Right. Arrivals come from the world's clock — i × interval, no matter what the server is doing — and latency is measured from the SCHEDULED time, so every millisecond spent queued behind the stall lands in the data.",
              "Scheduling from max(schedule, server-free) makes the generator wait for the server: a closed loop wearing open-loop clothes. During the stall it stops sending, and the overload it exists to measure never appears in the report.",
              "Sends on schedule but measures from the actual START of service — the queueing delay vanishes from every sample. That's coordinated omission implemented by hand: the stall produces one bad sample instead of a backlog of them."] },
      post:`  }
  return lat;
}` },

    { id:"shedder", title:"Deadline Shedder", why:"a fast no beats a slow nothing", demo:demoShedder,
      pre:`// the front door under overload.
// estWait ≈ queued × estServiceMs; a shed costs ~0,
// a timeout costs a full service slot.
class DeadlineShedder {
  constructor(estServiceMs) { this.est = estServiceMs; this.queued = 0; }
  offer(now, deadline) {`,
      blank:{ q:"Traffic is at 2× capacity and every request carries a deadline. Which body spends the server only on requests that can still make it?",
        options:[
`    const finishBy = now + (this.queued + 1) * this.est;
    if (finishBy > deadline) return "shed";
    this.queued++;
    return "admitted";`,
`    if (deadline > now) {
      this.queued++;
      return "admitted";
    }
    return "shed";`,
`    const finishBy = now + (this.queued + 1) * this.est;
    if (finishBy > deadline) {
      this.queued++;
      return "shed";
    }
    this.queued++;
    return "admitted";`],
        answer:0,
        whys:["Right. Project the finish time through the current queue — wait plus own service — and if it lands past the deadline, say no NOW, for free. Everything admitted can still succeed: overload becomes fast errors plus served requests, instead of universally slow errors.",
              "'Not expired yet' admits requests that will die in line: 40ms of budget joining a 400ms queue is a guaranteed timeout that still consumes a service slot. Under overload that's the entire failure mode — a queue full of the walking dead.",
              "Counts SHED requests into the queue estimate: every rejection inflates estWait, which causes more rejections — the shedder spirals into rejecting everything while the server drains idle. Only admitted work occupies the queue."] },
      post:`  }
  done() { this.queued--; }
}` },

    { id:"aimd", title:"AIMD Concurrency Limiter", why:"discover capacity — don't configure it", demo:demoAimd,
      pre:`// nobody knows the real limit: deploys, host mixes, and
// payload shifts keep moving it. release(ok) is the
// discovery loop.
release(ok) {
  this.inflight--;`,
      blank:{ q:"The downstream just browned out. Which body backs off fast enough to matter — and probes back up gently enough to stay?",
        options:[
`  if (!ok) {
    this.streak = 0;
    this.limit = Math.max(this.min,
      Math.floor(this.limit / 2));
    return;
  }
  this.streak++;
  if (this.streak >= this.limit) {
    this.streak = 0;
    this.limit = Math.min(this.max, this.limit + 1);
  }`,
`  if (!ok) {
    this.streak = 0;
    this.limit = Math.max(this.min, this.limit - 1);
    return;
  }
  this.streak++;
  if (this.streak >= this.limit) {
    this.streak = 0;
    this.limit = Math.min(this.max, this.limit + 1);
  }`,
`  if (!ok) {
    this.streak = 0;
    this.limit = Math.max(this.min,
      Math.floor(this.limit / 2));
    return;
  }
  this.limit = Math.min(this.max, this.limit + 1);`],
        answer:0,
        whys:["Right. Multiplicative decrease sheds load faster than overload grows; additive increase (+1 per full window of successes) probes for freed capacity without re-creating the incident. The asymmetry IS the algorithm — it's why TCP survived the internet.",
              "Additive decrease walks down one at a time: from limit 200 it takes forty consecutive failures to shed 20%, while the downstream's queue explodes underneath. Backoff must outrun the thing it's backing off from — that's why the decrease is a halving.",
              "+1 on EVERY success is exponential growth in disguise: at limit 50, one round of in-flight successes raises the limit by 50. The limiter blows straight through the capacity it just discovered, and the system oscillates between overload and half-speed forever."] },
      post:`}` },
  ],

  bank:[
    { id:"knee", title:"Diagnose the Knee", why:"capacity is a curve, and it has a cliff", demo:demoKnee,
      pre:`// step-load results (open loop, each step held to steady
// state):
//   { rps: 100, p99: 40 }, { rps: 200, p99: 44 },
//   { rps: 300, p99: 58 }, { rps: 400, p99: 130 },
//   { rps: 500, p99: 70 }   // errors return FAST at 500
function findKnee(points, slo) {
  let capacity = 0, knee = null;
  for (const pt of points) {`,
      blank:{ q:"The SLO is p99 ≤ 100ms. Which body reads the table the way capacity planning needs — and refuses the trap at 500 rps?",
        options:[
`    if (pt.p99 <= slo) capacity = pt.rps;
    else { knee = pt; break; }
  }
  return { capacity, knee };`,
`    if (pt.p99 <= slo) capacity = pt.rps;
    else knee = pt;
  }
  return { capacity, knee };`,
`    capacity = pt.rps;
    if (pt.p99 > slo && !knee) knee = pt;
  }
  return { capacity, knee };`],
        answer:0,
        whys:["Right. Capacity is the last step that met the SLO (300), the knee is the first that didn't (400) — and you STOP reading there. Past the knee the server is failing, and its numbers describe the failure, not the service.",
              "Without the break, the 500-rps step — where overload turned into quick errors and 'p99' improved to 70ms — re-credits capacity at 500. The report now recommends running 66% past the wall, certified by the collapse itself.",
              "Capacity tracks the OFFERED rate unconditionally — the report says 500 rps because that's what you threw at it, not what it served within SLO. Offered ≠ served is the entire lesson of overload testing."] },
      post:`}` },

    { id:"retrystorm", title:"Retry-Storm Math", why:"retries multiply load exactly when capacity is gone", demo:demoRetryStorm,
      pre:`// every attempt fails independently with probability f;
// clients retry up to r times (r+1 attempts max).
// expected attempts per request = 1 + f + f² + … + f^r
function retryAmplification(f, r) {`,
      blank:{ q:"The incident review asks: how much load did our retry policy add during the brownout? Which body answers for ANY failure rate — including a hard outage?",
        options:[
`  if (f >= 1) return r + 1;
  return (1 - Math.pow(f, r + 1)) / (1 - f);`,
`  return 1 + f * r;`,
`  return 1 / (1 - f);`],
        answer:0,
        whys:["Right — the geometric sum in closed form, with the hard-outage case explicit: at f = 1 every request spends its full budget of r+1 attempts. Brownout at f = 0.5, r = 2: 1.75×. Stack three services each retrying 3× and the bottom layer sees 4³ = 64×.",
              "Linear overcounts: the second retry only exists if BOTH earlier attempts failed — each level is discounted by another factor of f, which is what the geometric sum encodes. Worse, the linear form teaches that retries scale gently, when the danger lives at f → 1 where every request maxes out its budget.",
              "1/(1−f) is the amplification for UNLIMITED retries — it predicts infinite load at f = 1, which no bounded policy produces, and it can't tell you what your actual r buys. Right formula, wrong (and terrifying) policy: retry forever."] },
      post:`}` },

    { id:"pctmerge", title:"Percentile Aggregation", why:"percentiles don't average — populations merge", demo:demoPctMerge,
      pre:`// 10 hosts, one histogram each — identical bucket bounds.
// the dashboard needs the FLEET p99.
function fleetP99(hosts) {  // hosts: [Histogram, ...]`,
      blank:{ q:"Host A is sick (p99 1,000ms); the other nine sit at 10ms. Which body reports a fleet p99 a user could actually have experienced?",
        options:[
`  const merged = hosts.reduce((m, h) => m.merge(h));
  return merged.percentile(99);`,
`  const sum = hosts.reduce(
    (s, h) => s + h.percentile(99), 0);
  return sum / hosts.length;`,
`  return Math.max(...hosts.map(h => h.percentile(99)));`],
        answer:0,
        whys:["Right. Bucket counts add: merge the histograms (sum counts index-wise), then take the percentile of the merged population. It's the only aggregation that answers 'what did the 99th-percentile REQUEST see?' — and it works for any quantile and any traffic split.",
              "Averaging p99s manufactures a number no request experienced, weighted by host COUNT instead of traffic. If the sick host serves most of the traffic the average barely moves; if it serves almost none, the average panics. Wrong in both directions, quietly.",
              "max(host p99s) is an upper bound — it never under-reports, but one canary at 1,000ms pages you while 99.9% of traffic is fine, and it cannot produce p50, p95, or any other quantile. A bound is not a distribution."] },
      post:`}` },

    { id:"coordomission", title:"Omission Correction", why:"the worst samples are the ones never taken", demo:demoCoordOmission,
      pre:`// the generator intended one send every intervalMs. a
// recorded sample LONGER than the interval means sends were
// skipped while the generator sat waiting — reconstruct them.
function correctOmission(samples, intervalMs) {
  const out = [];
  for (const v of samples) {
    out.push(v);`,
      blank:{ q:"One 1,000ms stall was recorded at a 100ms send interval. Which body reconstructs what the suppressed requests would have seen?",
        options:[
`    for (let m = v - intervalMs; m >= intervalMs;
         m -= intervalMs)
      out.push(m);
  }
  return out;`,
`  }
  return out;`,
`    for (let k = 1; k < Math.floor(v / intervalMs); k++)
      out.push(v);
  }
  return out;`],
        answer:0,
        whys:["Right. The send that should have left one interval later would have waited about v − interval; the next, v − 2·interval; and so on, ramping down. That's HdrHistogram's expected-interval correction — it restores the ~9 samples the stall silently deleted.",
              "Recording only what was sent IS the omission: the histogram says 'one slow request' when roughly ten users' worth of sends were suppressed. The p99.9 reads ~100× better than reality, and the SLO conversation happens on fantasy numbers.",
              "Backfilling every missing send at the FULL stall value over-corrects: a request that would have left 900ms into the stall had ~100ms of it left to feel, not 1,000. Over-correction discredits the exercise the first time someone cross-checks a client trace."] },
      post:`}` },

    { id:"qdiscipline", title:"Queue Discipline Under Fire", why:"FIFO is fair to requests and brutal to users", demo:demoDiscipline,
      pre:`// overload: the queue is long and every request carries a
// deadline. the server just came free — pick the next job.
// queue[0] is the OLDEST waiting request.
function next(queue, now) {`,
      blank:{ q:"Clients time out at 30s and the oldest queued requests are near it. Which body spends the freed-up server on work someone is still waiting for?",
        options:[
`  while (queue.length && now > queue[0].deadline)
    queue.shift();               // sweep the expired
  return queue.pop() || null;    // serve the FRESHEST`,
`  while (queue.length && now > queue[0].deadline)
    queue.shift();
  return queue.shift() || null;  // serve the oldest`,
`  return queue.pop() || null;    // freshest first`],
        answer:0,
        whys:["Right. Sweep expired requests off the old end — their callers are gone — then serve newest-first. Fresh requests still hold nearly their whole deadline, so LIFO-under-overload keeps the p50 alive by sacrificing requests that were already lost.",
              "FIFO-with-sweep still hands the server to the oldest SURVIVOR — a request that burned most of its deadline in line and will likely expire mid-service or the moment it returns. Throughput looks fine; goodput stays near zero; the callers already hung up.",
              "LIFO without the sweep leaves a growing fossil layer of expired requests at the old end: memory grows without bound, and queue depth — the input to your shedding and scaling decisions — reads garbage forever."] },
      post:`}` },

    { id:"scalelag", title:"Autoscaling-Lag Sizing", why:"the scaler answers in minutes; spikes ask in seconds", demo:demoScaleLag,
      pre:`// traffic steps to lambdaRps; the fleet serves muRps; new
// capacity lands after lagSec. size the damage first:
function backlogDuringLag(lambdaRps, muRps, lagSec) {`,
      blank:{ q:"λ jumps to 250 rps against 150 rps of capacity, and scale-out takes 120s. Which body sizes the queue you'll owe — without inventing one when you're fine?",
        options:[
`  return Math.max(0, lambdaRps - muRps) * lagSec;`,
`  return lambdaRps * lagSec;`,
`  return (lambdaRps - muRps) * lagSec;`],
        answer:0,
        whys:["Right — only the EXCESS queues: (250 − 150) × 120 = 12,000 requests. That number IS your incident: even at 300 rps of post-scale capacity, only μ−λ = 50 rps chips at the backlog — another FOUR minutes to drain (a 2-minute lag buys a 6-minute incident), with peak waits near 40s. Headroom, a bounded queue, or shedding must cover it.",
              "Counts every arrival as backlog — 30,000 instead of 12,000 — as if the fleet served nothing during the lag. The 2.5× overestimate becomes permanent 2.5× overprovisioning the first time someone 'fixes' capacity with it.",
              "Without the clamp, normal operation (λ < μ) produces NEGATIVE backlog — and any alert or scaler fed by it learns that quiet hours cancel out future overload. Queues drain to zero; they do not go below it."] },
      post:`}` },

    { id:"cachecap", title:"Cache Hit-Ratio Capacity", why:"the origin lives on (1 − h), and h moves", demo:demoCacheCap,
      pre:`// the origin only sees the misses. size it for the worst
// CREDIBLE hit ratio — not the average one.
function survivesDip(edgeRps, hitRatio, originCapacityRps) {`,
      blank:{ q:"50,000 rps at the edge, origin rated 1,500 rps. Which body answers 'do we survive a hit-ratio dip?' the way the hockey stick demands?",
        options:[
`  const missRps = edgeRps * (1 - hitRatio);
  return missRps <= originCapacityRps * 0.8;`,
`  const missRps = edgeRps * (1 - hitRatio);
  return missRps <= originCapacityRps;`,
`  const missRps = edgeRps * hitRatio;
  return missRps <= originCapacityRps * 0.8;`],
        answer:0,
        whys:["Right. Origin load = λ(1 − h), and 'fits' means fits at ≤80% utilization — above that, waits are already 5× service time and climbing the vertical part of the curve. At h = 0.97 the origin sees exactly its 1,500-rps rating, and the honest answer is NO.",
              "Sized to exactly 100%: the arithmetic says 'fits' while the queue says goodbye. At full utilization there is no steady state — the first burst, slow disk, or GC pause tips the origin into collapse. Capacity with no headroom isn't capacity.",
              "That's the HIT traffic — the requests the origin never sees. It reports a 49,500-rps 'origin load' at a 99% hit ratio: inverted by 100×, and every plan built on it is sized for the wrong universe."] },
      post:`}` },
  ],
};

/* ---- flashcards: the judgment calls ---- */
const CARDS = [
  ["Batching triples throughput but adds 50ms to every request. Take the trade?",
   "Depends which side of the knee you live on. If you're capacity-bound, batching may be the only way to stay under ρ ≈ 0.8 — and the queueing delay it prevents can dwarf the 50ms it adds. If you're latency-bound with headroom to spare, you just taxed every user to solve a problem you don't have. Throughput buys survival; latency buys experience."],
  ["The fleet runs at 30% utilization. Is that waste?",
   "It's insurance with a price tag. 30% means you can absorb a 2× spike, an AZ loss, or a deploy taking a third of capacity offline — maybe two at once. The question isn't 'why so low' but 'what's the largest correlated event we must survive without shedding' — work backward from that. Waste is headroom you can't name a reason for."],
  ["One fast server or four slow ones with the same total throughput?",
   "For latency, the fast one: service time is 4× lower, and at equal ρ a single fast queue beats four slow ones. For availability, the four. And however many servers you run, feed them ONE shared queue — with private queues, one hot queue can back up while its neighbors idle. Pool the queue even when you can't pool the servers."],
  ["When is the MEAN the right statistic?",
   "Capacity and cost — because means add: total work = λ × mean service time, and the bill is the mean times the volume. User experience — never: use percentiles. The classic failure is using each tool in the other's job: percentile-based capacity math double-counts the tail; mean-based SLOs hide it."],
  ["Queue it or shed it?",
   "The deadline decides. Work with a live caller (interactive) should be shed the moment its deadline can't be met — a fast no beats a slow nothing. Work without a deadline (batch, async) should queue — durably, bounded, with a backpressure signal. The unforgivable option is the unbounded in-memory queue: it converts overload into OOM plus maximal latency for everyone."],
  ["When is retrying the wrong call?",
   "When the failure is overload: retrying a saturated service is a DDoS with good intentions. Retry when failures are rare and random (packet loss, one bad host) — budgeted (≤10% of traffic), jittered, and never on a signal that means 'I'm drowning' (429, overload errors, queue-full). The failure mode you're retrying against determines whether retries help or feed it."],
  ["Autoscaling or overprovisioning?",
   "Match the spike shape to the reaction time. Diurnal waves (hours) autoscale beautifully. Spikes (seconds) outrun any autoscaler — its lag is minutes — so you pre-provision the headroom for the largest step you must absorb, and let autoscaling handle the slow curve underneath. Scale up fast, down slow; never react faster than your metrics settle."],
  ["p50 is 20ms, p99 is 900ms. Ship it?",
   "Ask who lives in the p99. Under fan-out, heavy accounts touch more shards and more rows — your biggest customers are OVERREPRESENTED in the tail, not randomly sampled into it. And any page composed of 20 calls hits a per-call p99 about 18% of the time. The tail is your best users' typical experience, priced as an edge case."],
  ["Where should the latency SLO be measured?",
   "Where the user is: client-observed or at the edge — including queueing, retries, and connection setup. Server-side handler timings are diagnostics, not SLOs: they omit the queue IN FRONT of the handler (listen backlog, thread pool, LB), which is exactly the part that grows under load. Measure the SLO outside; decompose inward only to locate the fix."],
  ["Add a cache or add capacity?",
   "A cache is capacity with a failure mode. Real origin load is λ(1−h), and h is a dynamic property that deploys, key churn, TTL expiry, and attackers all move. If you can't survive the worst credible h, the cache is borrowed capacity at hit-ratio interest — fine for latency, dangerous as your only survival plan."],
  ["Bigger machine or more machines for a latency problem?",
   "Decompose first: wait or service? High SERVICE time → faster cores or less work per request; more machines don't make one request faster. High WAIT time → more capacity or concurrency; a faster machine helps only indirectly by shortening service. The decomposition is one histogram away — guessing is optional and expensive."],
  ["When do you trust a benchmark?",
   "When it states its arrival model (open vs closed loop), warmup, duration, and percentile methodology — and shows the whole latency-vs-throughput CURVE, not a point. 'Handles 1M QPS' alone is marketing: at what latency, measured where, after what warmup? If the p99 was averaged across workers or the load was closed-loop, the number is fiction."],
  ["The upstream team asks for your service's 'max QPS'. What do you give them?",
   "Three numbers, not one: capacity at SLO (the knee), the degraded ceiling (with shedding on — at what error rate), and the cost drivers that move both (payload size, fan-out, cache state). A single 'max QPS' invites them to run you at ρ = 1.0 and call it contract compliance. Capacity is a curve with a contract attached."],
  ["When does Little's law NOT apply?",
   "When there's no steady state or no long-run average: a growing backlog (λ > μ) breaks it, and short windows during bursts violate it locally. It also speaks only of AVERAGES — it says nothing about percentiles. Everywhere else it's bulletproof: no distribution, discipline, or independence assumptions. If someone's numbers violate L = λW, the numbers are wrong."],
];

/* ---- spot-the-bug: real code, one broken scenario, tap the faulty line(s) ---- */
const BUGHUNT = [
  { id:"bug_hist", title:"Histogram percentile", why:"never under-report the tail", lesson:9,
    scenario:"Customers keep reporting 2-second checkouts, but the latency dashboard swears the p99 is under a second — every week, the client-measured tail runs about double what the service reports. The histogram buckets double in width as they go up. Which line lies?",
    lines:[
      "class Histogram {",
      "  constructor(bounds) {           // ascending upper bounds",
      "    this.bounds = bounds;",
      "    this.counts = new Array(bounds.length + 1).fill(0);",
      "    this.total = 0;",
      "  }",
      "",
      "  record(v) {",
      "    let i = 0;",
      "    while (i < this.bounds.length && v > this.bounds[i]) i++;",
      "    this.counts[i]++;",
      "    this.total++;",
      "  }",
      "",
      "  percentile(p) {",
      "    if (this.total === 0) return undefined;",
      "    const rank = Math.ceil((p / 100) * this.total);",
      "    let cum = 0;",
      "    for (let i = 0; i < this.counts.length; i++) {",
      "      cum += this.counts[i];",
      "      if (cum >= rank)",
      "        return i === 0 ? 0 : this.bounds[i - 1];",
      "    }",
      "  }",
      "}",
    ],
    bug:[20],
    explain:"Line 21 returns the bucket's LOWER edge. A sample counted in counts[i] lies in (bounds[i-1], bounds[i]] — every sample in that bucket is allowed to EXCEED the reported value, by up to a full bucket width. With doubling buckets that's a 2× under-report of the tail, which is exactly the gap between the dashboard and the customers. Report the upper bound — `this.bounds[i]`, and Infinity for the overflow slot — so the histogram over-reports by at most a bucket width and never under-reports an SLO breach." },

  { id:"bug_loadgen", title:"Load generator", why:"an open loop must not wait for the server", lesson:10,
    scenario:"The stress test certifies 500 rps at p99 40ms. Production falls over at 300 rps with 30-second latencies. The generator was configured for a fixed request rate — but under any real stall its reported latencies stay mysteriously polite. At most one request is ever in flight — which line makes that true?",
    lines:[
      "// drives the target at a configured request rate and",
      "// reports the latency distribution it observed",
      "class LoadGen {",
      "  constructor(rateRps, client) {",
      "    this.interval = 1000 / rateRps;",
      "    this.client = client;",
      "  }",
      "",
      "  async run(seconds) {",
      "    const n = Math.floor(seconds * 1000 / this.interval);",
      "    const t0 = now();",
      "    const latencies = [];",
      "    for (let i = 0; i < n; i++) {",
      "      await sleepUntil(t0 + i * this.interval);",
      "      const sent = now();",
      "      const reply = await this.client.send();",
      "      latencies.push(now() - sent);",
      "    }",
      "    return latencies;",
      "  }",
      "}",
    ],
    bug:[15],
    explain:"Line 16 awaits the response inside the send loop — at most one request is ever in flight, which makes this a CLOSED loop no matter what the interval math says. When the server stalls, the generator stalls with it: sends stop, the queue the stall would have created never forms, and one bad sample gets recorded instead of a hundred. Afterwards the catch-up sends are measured from their late actual send times, hiding the delay again (coordinated omission). Fire without awaiting — track completions via callbacks — and measure each request from its SCHEDULED send time." },

  { id:"bug_shedder", title:"Deadline shedder", why:"shed the doomed, serve the viable", lesson:12,
    scenario:"Under load, the service rejects nearly every incoming request — yet the few it does accept still time out. Rejections AND timeouts, nobody served, while the CPU sits half idle. The shedder was supposed to trade errors for a healthy p50. Which line runs the door backwards?",
    lines:[
      "// admission control: reject requests that cannot finish",
      "// inside their deadline, before they cost anything",
      "class DeadlineShedder {",
      "  constructor(estServiceMs) {",
      "    this.est = estServiceMs;",
      "    this.queued = 0;",
      "  }",
      "",
      "  offer(now, deadline) {",
      "    const finishBy = now + (this.queued + 1) * this.est;",
      "    if (finishBy < deadline) return \"shed\";",
      "    this.queued++;",
      "    return \"admitted\";",
      "  }",
      "",
      "  done() {",
      "    this.queued--;",
      "  }",
      "}",
    ],
    bug:[10],
    explain:"Line 11 has the comparison inverted: `finishBy < deadline` sheds exactly the requests that HAVE enough time — and admits only the ones whose projected finish is already past their deadline. The server spends its capacity exclusively on guaranteed timeouts while shedding everything viable, which is precisely the observed 'rejects and timeouts, nobody served.' The guard must be `finishBy > deadline → shed`: reject what can't make it, admit what can." },

  { id:"bug_aimd", title:"AIMD limiter", why:"backoff must outrun the overload", lesson:15,
    scenario:"A downstream dependency browns out while the limiter sits at 180. Latency stays pegged for six full minutes as the limit crawls downward, the retry queue explodes, and the incident channel fills — recovery from a signal like this should take seconds. Which line is too polite?",
    lines:[
      "// adaptive concurrency: discover downstream capacity",
      "class AimdLimiter {",
      "  constructor(start, min, max) {",
      "    this.limit = start;",
      "    this.min = min; this.max = max;",
      "    this.inflight = 0;",
      "    this.streak = 0;",
      "  }",
      "",
      "  acquire() {",
      "    if (this.inflight >= this.limit) return false;",
      "    this.inflight++;",
      "    return true;",
      "  }",
      "",
      "  release(ok) {",
      "    this.inflight--;",
      "    if (!ok) {",
      "      this.streak = 0;",
      "      this.limit = Math.max(this.min, this.limit - 1);",
      "      return;",
      "    }",
      "    this.streak++;",
      "    if (this.streak >= this.limit) {",
      "      this.streak = 0;",
      "      this.limit = Math.min(this.max, this.limit + 1);",
      "    }",
      "  }",
      "}",
    ],
    bug:[19],
    explain:"Line 20 decreases additively — limit − 1 per failure signal. From 180, shedding even 20% of the pressure takes dozens of consecutive failures, each one a full timed-out request, while the downstream's queue compounds underneath. The decrease must be MULTIPLICATIVE — `Math.floor(this.limit / 2)` — so the limiter sheds load faster than the overload grows. Additive-increase gives the gentle probing; multiplicative-decrease gives the fast escape. AIAD converges to nothing; AIMD is the whole algorithm." },
];

/* ===========================================================
   WRITE IT — assemble the implementation from a shuffled line
   bank. Grading is honest: the assembled code actually RUNS
   against assertions in a sandboxed worker.
   =========================================================== */
const WRITE = [
  { id:"w-little", title:"Little's law calculator — write it", why:"measure two, derive the third", lesson:2,
    spec:"Write littleSolve({L, lambda, W}): exactly two of the three are provided (the third is null/undefined). Return a completed {L, lambda, W} using L = λW. If fewer or more than two are provided, throw.",
    pre:`function littleSolve({ L, lambda, W }) {`,
    post:`}`,
    lines:[
      "  const known = [L, lambda, W]",
      "    .filter(v => v != null).length;",
      "  if (known !== 2)",
      "    throw new Error(\"need exactly two of L, lambda, W\");",
      "  if (L == null)      return { L: lambda * W, lambda, W };",
      "  if (lambda == null) return { L, lambda: L / W, W };",
      "  return { L, lambda, W: L / lambda };",
    ],
    distractors:[
      { code:"  return { L, lambda, W: lambda / L };",
        why:"Inverted: 60 req/s over 120 in flight gives 0.5s instead of the true 2s — a 4× lie in the direction that makes an incident look mild. Time in system = what's IN the system ÷ how fast it drains: L/λ." },
      { code:"  if (L == null)      return { L: lambda / W, lambda, W };",
        why:"Rate DIVIDED by time gives req/s² — not an occupancy. Occupancy = rate × time: 100 req/s each spending 0.2s means 20 in flight at any instant. When the units don't survive, neither does the answer." },
      { code:"  if (known !== 2) return { L, lambda, W };",
        why:"Silently returning the incomplete input turns a caller bug into a NaN that surfaces three dashboards later. A solver that can't solve must say so loudly — the throw is the feature." },
    ],
    test:`const w = littleSolve({ L: 120, lambda: 60 });
assert(w.W === 2, "120 in flight at 60 req/s means users wait 2s, got " + w.W);
log("L=120, λ=60  ->  W = " + w.W + "s");
const l = littleSolve({ lambda: 100, W: 0.2 });
assert(l.L === 20, "100 req/s x 0.2s means 20 in flight, got " + l.L);
const lam = littleSolve({ L: 10, W: 0.05 });
assert(lam.lambda === 200, "a 10-connection pool at 50ms per op supports 200 req/s, got " + lam.lambda);
log("pool of 10 @ 50ms  ->  λmax = " + lam.lambda + " req/s");
const round = littleSolve({ lambda: w.lambda, W: w.W });
assert(round.L === 120, "solving back must return the original L, got " + round.L);
let threw = false;
try { littleSolve({ L: 5 }); } catch (e) { threw = true; }
assert(threw, "one known value must throw - there is nothing to solve");
let threw2 = false;
try { littleSolve({ L: 5, lambda: 1, W: 5 }); } catch (e) { threw2 = true; }
assert(threw2, "three known values must throw - nothing is missing");`,
    pass:"L = λW in all three directions, loud when unsolvable — the law that works on any stable system",
    takeaway:"Little's law is the free instrument: any two of occupancy, throughput, and time hand you the third, with no distribution assumptions. Half of capacity math is this one identity, rearranged.",
    hint:"Count non-null inputs; anything but exactly 2 throws. Then three branches: L = lambda*W, lambda = L/W, W = L/lambda." },

  { id:"w-mm1", title:"Virtual-time queue sim — write it", why:"one server, arrivals, and the truth about waiting", lesson:3,
    spec:"Write simulateQueue(jobs): jobs is [{arrival, service}] sorted by arrival time, served FIFO by ONE server. Return {waits, latencies} where waits[i] = time job i spends queued before service starts, latencies[i] = waits[i] + service. A job starts at max(its arrival, when the server frees up).",
    pre:`function simulateQueue(jobs) {`,
    post:`}`,
    lines:[
      "  let free = 0;",
      "  const waits = [], latencies = [];",
      "  for (const j of jobs) {",
      "    const start = Math.max(j.arrival, free);",
      "    free = start + j.service;",
      "    waits.push(start - j.arrival);",
      "    latencies.push(free - j.arrival);",
      "  }",
      "  return { waits, latencies };",
    ],
    distractors:[
      { code:"    const start = j.arrival;",
        why:"Every job starts the instant it arrives — you've simulated infinite servers. Waits are always zero, the queue never exists, and the hockey stick the sim exists to show is flat forever." },
      { code:"    free = j.arrival + j.service;",
        why:"Resets the server's busy-until from the ARRIVAL instead of the actual start: backlog evaporates between jobs, so queueing never accumulates and overload looks free. The server is busy from when it STARTS, not from when the work appeared." },
      { code:"    latencies.push(free - start);",
        why:"That's the service time alone — the queue wait vanishes from the report. This is precisely the lie a handler-side timer tells in production: it starts measuring after the queueing already happened." },
    ],
    test:`const r = simulateQueue([
  { arrival: 0, service: 2 },
  { arrival: 1, service: 2 },
  { arrival: 2, service: 2 },
  { arrival: 3, service: 2 },
]);
log("waits: " + r.waits.join(", "));
assert(r.waits.join(",") === "0,1,2,3", "each arrival queues behind the growing backlog: 0,1,2,3 - got " + r.waits.join(","));
assert(r.latencies.join(",") === "2,3,4,5", "latency = wait + service: 2,3,4,5 - got " + r.latencies.join(","));
const idle = simulateQueue([
  { arrival: 0, service: 2 },
  { arrival: 100, service: 2 },
]);
assert(idle.waits[1] === 0, "after an idle gap the server is free - wait must be 0, got " + idle.waits[1]);
assert(idle.latencies[1] === 2, "an unqueued job's latency is its service time, got " + idle.latencies[1]);
const burst = simulateQueue([
  { arrival: 0, service: 10 },
  { arrival: 0, service: 10 },
  { arrival: 0, service: 10 },
]);
log("burst of 3 @ t=0, 10ms each -> waits " + burst.waits.join(", "));
assert(burst.waits.join(",") === "0,10,20", "a burst serializes: 0,10,20 - got " + burst.waits.join(","));`,
    pass:"arrivals queued, backlog carried, latency measured arrival-to-done — the whole course in nine lines",
    takeaway:"One running variable — when the server frees up — is the entire simulation. start = max(arrival, free) is where queueing comes from; latency measured from ARRIVAL is what keeps it honest.",
    hint:"Track `free` (when the server next idles). Per job: start = max(arrival, free); free = start + service; wait = start − arrival; latency = free − arrival." },

  { id:"w-histogram", title:"Streaming histogram — write it", why:"answer any percentile from a handful of counters", lesson:9,
    spec:"Write record(v) and percentile(p). record: find the first bucket whose upper bound holds v (counts[i] covers values ≤ bounds[i]; the extra last slot catches overflow) and count it. percentile: an EMPTY histogram returns undefined (no data, no answer); otherwise rank = ceil(p/100 × total), walk cumulative counts, and return the UPPER bound of the bucket containing that rank (Infinity for the overflow slot) — never under-report.",
    pre:`class Histogram {
  constructor(bounds) {            // ascending upper bounds
    this.bounds = bounds;
    this.counts = new Array(bounds.length + 1).fill(0);
    this.total = 0;
  }`,
    post:`}`,
    lines:[
      "  record(v) {",
      "    let i = 0;",
      "    while (i < this.bounds.length && v > this.bounds[i]) i++;",
      "    this.counts[i]++;",
      "    this.total++;",
      "  }",
      "  percentile(p) {",
      "    if (this.total === 0) return undefined;",
      "    const rank = Math.ceil((p / 100) * this.total);",
      "    let cum = 0;",
      "    for (let i = 0; i < this.counts.length; i++) {",
      "      cum += this.counts[i];",
      "      if (cum >= rank)",
      "        return i < this.bounds.length ? this.bounds[i] : Infinity;",
      "    }",
      "  }",
    ],
    distractors:[
      { code:"    const rank = Math.floor((p / 100) * this.total);",
        why:"floor() can produce rank 0, which the first cumulative sum satisfies before counting a single sample — low percentiles pin to the first bucket, boundary percentiles land one bucket low. Ranks count samples: they start at 1, so round UP." },
      { code:"        return i < this.bounds.length ? this.bounds[i - 1] : Infinity;",
        why:"The bucket's LOWER edge — a value every sample in the bucket may exceed, by up to a bucket width. With doubling buckets the dashboard under-reports the tail 2×, and the SLO breach arrives via support tickets." },
      { code:"      if (cum > rank)",
        why:"Walks one bucket past the rank: every percentile reports a bucket high, and p100 — where cum can only ever EQUAL total — falls off the end and returns undefined. The rank is reached the moment cum >= rank." },
    ],
    test:`const h = new Histogram([10, 20, 50, 100, 200]);
assert(h.percentile(99) === undefined, "an EMPTY histogram has no p99 - never report the first bound on no data");
for (let i = 0; i < 96; i++) h.record(8);
h.record(60); h.record(60); h.record(150); h.record(180);
assert(h.total === 100, "100 samples recorded, got " + h.total);
assert(h.counts[0] === 96, "96 fast samples belong in the first bucket, got " + h.counts[0]);
assert(h.counts[3] === 2 && h.counts[4] === 2, "60s in the <=100 bucket, 150/180 in <=200");
log("p50=" + h.percentile(50) + " p97=" + h.percentile(97) + " p99=" + h.percentile(99));
assert(h.percentile(50) === 10, "p50 must be the first bucket's bound (10), got " + h.percentile(50));
assert(h.percentile(96) === 10, "rank 96 still lands in the fast bucket, got " + h.percentile(96));
assert(h.percentile(97) === 100, "rank 97 lands where the 60ms samples are: bound 100, got " + h.percentile(97));
assert(h.percentile(99) === 200, "rank 99 lands in the <=200 bucket, got " + h.percentile(99));
assert(h.percentile(100) === 200, "p100 is the last non-empty bucket's bound, got " + h.percentile(100));
h.record(9999);
assert(h.percentile(100) === Infinity, "overflow samples must report Infinity, never a finite lie");`,
    pass:"six counters answered every percentile — conservatively, mergeably, in constant memory",
    takeaway:"A histogram is the honest latency primitive: bounded memory, mergeable across hosts by summing counts, and — reporting bucket UPPER bounds — incapable of under-stating your tail.",
    hint:"record: scan bounds until v fits (v > bound → keep going), count that slot. percentile: rank = ceil(p/100 × total); accumulate counts; first bucket where cum >= rank wins; report bounds[i], or Infinity for the overflow slot." },

  { id:"w-knee", title:"Knee finder — write it", why:"read capacity off the curve, stop at the cliff", lesson:20,
    spec:"Write findKnee(points, slo): points is [{rps, p99}] from a step-load test, ascending by rps. Return {capacity, knee}: capacity = the highest rps whose p99 met the slo, knee = the FIRST point that violated it (null if none did). Stop scanning at the first violation — post-collapse points (fast errors) must not count.",
    pre:`function findKnee(points, slo) {`,
    post:`}`,
    lines:[
      "  let capacity = 0, knee = null;",
      "  for (const pt of points) {",
      "    if (pt.p99 <= slo) capacity = pt.rps;",
      "    else { knee = pt; break; }",
      "  }",
      "  return { capacity, knee };",
    ],
    distractors:[
      { code:"    else { knee = pt; }",
        why:"Without the break, a post-collapse step where errors return fast (p99 'improves' while goodput is zero) re-credits capacity beyond the knee — the report certifies running past the wall, signed by the collapse itself." },
      { code:"    capacity = pt.rps;",
        why:"Tracks the OFFERED rate unconditionally: the report says 500 rps because that's what you threw, not what was served within SLO. Offered ≠ served is the entire lesson of overload testing." },
      { code:"    if (pt.p99 <= slo * 2) capacity = pt.rps;",
        why:"Doubling the SLO inside the tool produces capacity numbers nobody's error budget can cash. The SLO is an input contract — the analyzer doesn't get to renegotiate it." },
    ],
    test:`const table = [
  { rps: 100, p99: 40 }, { rps: 200, p99: 44 },
  { rps: 300, p99: 58 }, { rps: 400, p99: 130 },
  { rps: 500, p99: 70 },
];
const r = findKnee(table, 100);
log("capacity " + r.capacity + " rps · knee at " + (r.knee && r.knee.rps) + " rps");
assert(r.capacity === 300, "capacity is the last step meeting the SLO (300), got " + r.capacity);
assert(r.knee && r.knee.rps === 400, "the knee is the FIRST violation (400), got " + (r.knee && r.knee.rps));
const healthy = findKnee([{ rps: 100, p99: 40 }, { rps: 200, p99: 50 }], 100);
assert(healthy.capacity === 200 && healthy.knee === null, "no violation: capacity = last step, knee = null");
const sick = findKnee([{ rps: 100, p99: 400 }], 100);
assert(sick.capacity === 0 && sick.knee.rps === 100, "first step already violating: capacity 0");`,
    pass:"capacity = last rung inside the SLO; the fast-failing 500-rps mirage stayed out of the report",
    takeaway:"A load test is a curve, and capacity is where the curve crosses your SLO — everything past the knee measures failure, not service. The break is what keeps collapse from grading itself.",
    hint:"Walk ascending points: within SLO → capacity = that rps; first violation → record it as the knee and BREAK. Return both." },

  { id:"w-ewma", title:"EWMA smoother — write it", why:"the trend without the noise", lesson:22,
    spec:"Write update(sample) and value(). alpha is the weight of the NEW sample: v ← α·sample + (1−α)·v. The FIRST sample seeds v directly (never blend with a fake 0). value() returns the current average (null before any sample).",
    pre:`class Ewma {
  constructor(alpha) { this.alpha = alpha; this.v = null; }`,
    post:`}`,
    lines:[
      "  update(sample) {",
      "    if (this.v === null) this.v = sample;",
      "    else this.v = this.alpha * sample",
      "               + (1 - this.alpha) * this.v;",
      "    return this.v;",
      "  }",
      "  value() { return this.v; }",
    ],
    distractors:[
      { code:"    if (this.v === null) this.v = 0;",
        why:"Seeded at zero, the average spends ~1/α samples climbing out of a hole that never existed — a bad deploy hides inside the warm-up ramp. The first observation IS the best estimate; seed with it." },
      { code:"    else this.v = (1 - this.alpha) * sample",
        why:"Weights transposed: with α = 0.2 each new sample now gets 80% of the say — the smoothed line IS the noise and the alert flaps on every GC pause. α is the new sample's share; keep the convention straight everywhere." },
      { code:"    else this.v = (sample + this.v) / 2;",
        why:"A fixed 50/50 blend ignores α entirely — the effective window is stuck at ~2 samples no matter what you configure, too jumpy to trust and impossible to tune." },
    ],
    test:`const e = new Ewma(0.5);
assert(e.value() === null, "no samples yet - value() must be null");
assert(e.update(100) === 100, "the first sample seeds the average, got " + e.value());
assert(e.update(200) === 150, "0.5*200 + 0.5*100 = 150, got " + e.value());
assert(e.update(200) === 175, "0.5*200 + 0.5*150 = 175, got " + e.value());
log("seed 100 -> 150 -> 175: converging on the new level");
const calm = new Ewma(0.2);
calm.update(100);
const spike = calm.update(600);
assert(spike === 200, "one 6x spike moves a 0.2-EWMA to 200, not 600 - got " + spike);
for (let i = 0; i < 5; i++) calm.update(100);
assert(Math.abs(calm.value() - 132.768) < 1e-9, "5 healthy samples decay it to ~132.8, got " + calm.value());
log("spike absorbed: 200 -> " + calm.value().toFixed(1) + " and falling");`,
    pass:"seeded honestly, weighted as configured — spikes register without owning the signal",
    takeaway:"One multiply-add per sample buys a tunable memory: α sets how fast the past fades. The two classic bugs — zero seed and transposed weights — both produce charts that look plausible and lie.",
    hint:"First sample: v = sample. After: v = alpha*sample + (1-alpha)*v. Return v from update; value() just reads it." },
];

/* ===========================================================
   LESSONS — foundations (0-3). The tail, load behavior,
   measurement, and capacity arcs are appended by the lesson
   packs; see the LESSON PLAN at the top of this file.
   =========================================================== */
const LESSONS = [
  { eb:"lesson 01 · foundations", title:"Latency and throughput are different products", html:`
    <p class="big">Two numbers describe every system under load: <b class="hl">latency</b> — how long ONE request takes — and <b class="hl">throughput</b> — how many complete per second. They feel like one "performance" number. They are not: past the smallest scale they <b class="hl">trade against each other</b>, and optimizing the one you don't need wrecks the one you do.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the same service, tuned two ways</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">tuned for latency</div>
          <div class="lstep good">every request handled solo, immediately</div>
          <div class="lstep">10ms per request &middot; fleet kept half idle</div>
          <div class="lstep">headroom is the product: nobody queues</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">tuned for throughput</div>
          <div class="lstep good">requests batched 100 at a time</div>
          <div class="lstep">10&times; the work per second, per dollar</div>
          <div class="lstep bad">every request waits for its batch: +50ms each</div>
        </div>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:2">the trade</div><div class="lstep seq" style="--i:2">batching, buffering, and high utilization buy throughput <b>by adding waiting</b> &mdash; waiting is latency</div>
        <div class="lanehead seq" style="--i:3">the bridge</div><div class="lstep good seq pop" style="--i:3">the thing connecting them is <b>the queue</b> &mdash; and the queue is the entire subject of this course</div>
      </div>
      <div class="dnote seq" style="--i:4">You can buy throughput &mdash; more machines, bigger batches. Latency is harder currency: past a point it's physics (a later lesson) and <b style="color:var(--race)">queueing</b> (every lesson).</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; measure them separately, always</div>
      <pre class="code"><span class="cm">// throughput: completions per second — a rate. means ADD.</span>
throughput = completed / seconds;
<span class="cm">// latency: per-request time — a DISTRIBUTION. means lie.</span>
latency = histogram of (t_done - t_arrived);
<span class="ok">// one number cannot summarize both; a system report has two.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "how will this behave at 10&times; traffic?" is the senior-engineer question, and it has two answers — what happens to throughput (does it fit?) and what happens to latency (what does waiting cost?). Most engineers answer with vibes. The next three lessons replace the vibes with three numbers and one law.</p>` },

  { eb:"lesson 02 · foundations", title:"Every system is a queue", html:`
    <p class="big">Strip any service to its skeleton and three numbers remain: <b class="hl">arrivals</b> (rate λ), <b class="hl">service time</b> (S per request), and <b class="hl">servers</b> (c workers). Work arrives, waits if all servers are busy, gets served, leaves. That's a queue — and once you see it, you see it <b class="hl">everywhere</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">the universal shape &middot; arrivals &rarr; queue &rarr; server(s)</div>
      <svg class="estage" viewBox="0 0 340 120" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="30" y="20" fill="#8ca6b8" font-size="8" text-anchor="middle">arrivals λ</text>
        <rect x="110" y="40" width="110" height="34" rx="8" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="165" y="30" fill="#8ca6b8" font-size="8" text-anchor="middle">queue (the waiting room)</text>
        <rect x="256" y="34" width="66" height="46" rx="10" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="289" y="53" fill="#4eaeff" font-size="9" text-anchor="middle">SERVER</text>
        <text x="289" y="67" fill="#8ca6b8" font-size="7.5" text-anchor="middle">S ms each</text>
        <line x1="40" y1="57" x2="110" y2="57" stroke="#244155" stroke-width="1.2"/>
        <line x1="220" y1="57" x2="256" y2="57" stroke="#244155" stroke-width="1.2"/>
        <rect x="196" y="49" width="14" height="14" rx="3" fill="#34d3bf" opacity=".9"/>
        <rect x="176" y="49" width="14" height="14" rx="3" fill="#34d3bf" opacity=".65"/>
        <rect x="156" y="49" width="14" height="14" rx="3" fill="#34d3bf" opacity=".4"/>
        <circle r="6" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.35;0.6;1" keyPoints="0;0.45;0.45;1" path="M 30 57 L 340 57"/>
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.92;0.97;1" values="1;1;0;0"/>
        </circle>
        <text x="170" y="104" fill="#647c8f" font-size="8" text-anchor="middle">the orange request WAITS behind the green backlog — that wait is most of your latency</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">cpu</div><div class="lstep seq" style="--i:0">run queue &rarr; cores &middot; λ = runnable threads, S = time slice</div>
        <div class="lanehead seq" style="--i:1">db pool</div><div class="lstep seq" style="--i:1">waiting callers &rarr; 10 connections &middot; S = query time</div>
        <div class="lanehead seq" style="--i:2">http server</div><div class="lstep seq" style="--i:2">listen backlog &rarr; worker threads &middot; the queue exists even if you never made one</div>
        <div class="lanehead seq" style="--i:3">kafka / sqs</div><div class="lstep seq" style="--i:3">partition lag &rarr; consumers &middot; the queue is just visible for once</div>
        <div class="lanehead seq" style="--i:4">disk / network</div><div class="lstep seq" style="--i:4">io scheduler, NIC ring buffer &mdash; queues all the way down</div>
      </div>
      <div class="dnote seq" style="--i:5">A real service is a <b style="color:var(--ordered)">network</b> of these, and total latency is the sum of waits along the path. Diagnosis is finding <b style="color:var(--race)">which queue</b> the time pooled in.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; name the three numbers, always</div>
      <pre class="code"><span class="cm">// every "why is it slow?" starts with the same census:</span>
const system = {
  lambda: 80,      <span class="cm">// arrivals/sec — offered load</span>
  service: 10,     <span class="cm">// ms of work per request</span>
  servers: 1,      <span class="cm">// how many in parallel</span>
};
<span class="ok">// utilization ρ = λ·S/c — the number lesson 4 turns into a curve</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> once "everything is a queue" clicks, vendor dashboards, thread dumps, and kafka lag graphs all become the same picture. And it sets up the two tools that do most of this course's work: <b class="hl">Little's law</b> (next lesson) relates the queue's averages; <b class="hl">utilization</b> (the one after) predicts when it explodes.</p>` },

  { eb:"lesson 03 · foundations", title:"Little's law: L = λW", html:`
    <p class="big">One equation relates the three averages every queue has: <b class="hl">L = λW</b>. Occupancy = arrival rate &times; time in system. It requires <b class="hl">no assumptions</b> about arrival patterns, service distributions, or scheduling — only that the system is stable (long-run in = out). Measure any two, and the third is arithmetic.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">three rearrangements &middot; three superpowers</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">W = L/λ</div><div class="lstep seq" style="--i:0">1,200 in flight at 100 req/s &rarr; users wait <b>12s</b> &mdash; the latency panel was optional</div>
        <div class="lanehead seq" style="--i:1">L = λW</div><div class="lstep seq" style="--i:1">100 req/s &times; 0.2s each &rarr; <b>20</b> concurrent &mdash; how many workers you must hold open</div>
        <div class="lanehead seq" style="--i:2">λ = L/W</div><div class="lstep seq" style="--i:2">10-connection pool, 50ms queries &rarr; at most <b>200 req/s</b> &mdash; a hard ceiling nobody configured</div>
      </div>
      <div class="qbox micro seq" style="--i:3">
        <div class="dlabel">the pool-sizing move, in one line</div>
        <p style="margin:4px 0 0">Concurrency-limited throughput: <b class="hl">λ<sub>max</sub> = N / W</b>. Ten connections at 50ms each can NEVER exceed 200 req/s — no matter the CPU, the caching, or the quarter's roadmap. When throughput plateaus exactly at N/W, the pool is your bottleneck, found from your desk.</p>
      </div>
      <div class="dnote seq" style="--i:4">Caveats, honestly: it's about <b style="color:var(--race)">averages</b> (nothing about p99), and it needs <b style="color:var(--race)">stability</b> — during a growing backlog there's no steady state to average. Everywhere else: bulletproof.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the solver</div>
      <pre class="code">function littleSolve({ L, lambda, W }) {   <span class="cm">// two in, three out</span>
  if (L == null)      return { L: <span class="ok">lambda * W</span>, lambda, W };
  if (lambda == null) return { L, lambda: <span class="ok">L / W</span>, W };
  return { L, lambda, W: <span class="ok">L / lambda</span> };
}
<span class="cm">// units check everything: req = req/s × s. if the units die,</span>
<span class="cm">// the answer was already dead.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> Little's law is the interview's favorite hidden test — "the gauge shows 1,200 in flight at 100/s, what's the user experience?" — and production's most underused instrument. It sizes pools, spots bottlenecks, converts queue depths into wait times during incidents, and underpins every capacity calculation in the final arc.</p>` },

  { eb:"lesson 04 · foundations", title:"Utilization and the hockey stick", html:`
    <p class="big">Utilization ρ = λS/c: the fraction of time your servers are busy. It feels linear — 80% busy sounds like 20% left. But wait time is <b class="hl">hyperbolic in headroom</b>: for an M/M/1 queue, <b class="hl">W = S/(1&minus;ρ)</b>. The denominator is what's LEFT, and as it approaches zero, latency goes <b class="hl">vertical</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">mean latency vs utilization &middot; W = S/(1&minus;ρ)</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="20" y1="130" x2="320" y2="130" stroke="#244155" stroke-width="1"/>
        <line x1="20" y1="130" x2="20" y2="10" stroke="#244155" stroke-width="1"/>
        <text x="170" y="145" fill="#647c8f" font-size="8" text-anchor="middle">utilization ρ &rarr; 1</text>
        <text x="14" y="70" fill="#647c8f" font-size="8" text-anchor="middle" transform="rotate(-90 14 70)">wait &times; S</text>
        <polyline points="20,130 80,128 140,126 170,124 200,120 230,115 260,105 275,94 290,73 299,46 305,10"
          fill="none" stroke="#4eaeff" stroke-width="2"/>
        <line x1="260" y1="130" x2="260" y2="105" stroke="#fb923c" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="260" y="100" fill="#fb923c" font-size="8" text-anchor="middle">ρ=.8 &rarr; 5&times;</text>
        <line x1="290" y1="130" x2="290" y2="73" stroke="#fb923c" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="292" y="66" fill="#fb923c" font-size="8" text-anchor="middle">.9 &rarr; 10&times;</text>
        <circle r="5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            path="M 20 130 L 80 128 L 140 126 L 170 124 L 200 120 L 230 115 L 260 105 L 275 94 L 290 73 L 299 46 L 305 10"/>
        </circle>
        <text x="120" y="60" fill="#8ca6b8" font-size="8">ρ .50 &rarr; 2&times;S &middot; .80 &rarr; 5&times; &middot; .90 &rarr; 10&times;</text>
        <text x="120" y="74" fill="#8ca6b8" font-size="8">.95 &rarr; 20&times; &middot; .99 &rarr; 100&times; &middot; 1.0 &rarr; &infin;</text>
      </svg>
      <div class="qbox macro seq" style="--i:0">
        <div class="dlabel">"we're only at 80% CPU" is not headroom</div>
        <p style="margin:4px 0 0">At ρ = 0.8 the mean wait is already <b class="hl">5&times; the service time</b> — and the p99 is far past that. Adding "just 20% more" traffic lands at ρ = 0.96: <b class="hl">25&times;</b>. The last fifth of utilization contains almost all of the latency. Worse: that 80% is a <b class="hl">one-minute average</b> — inside it are one-second bursts already touching 100.</p>
      </div>
      <div class="dnote seq" style="--i:1">Assumptions, stated: the exact formula is M/M/1 (Poisson arrivals, exponential service, one server, FIFO). Different systems bend the constants; <b style="color:var(--ordered)">the pole at ρ = 1 is universal</b>. Why the pole exists — variability — is lesson 8.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; guard the pole</div>
      <pre class="code">function mm1Wait(lambdaRps, serviceMs) {
  const rho = lambdaRps * serviceMs / 1000;
  <span class="ok">if (rho &gt;= 1) return Infinity;</span>   <span class="cm">// no steady state — say so</span>
  return serviceMs / (1 - rho);
}
<span class="cm">// ρ ≥ 1 isn't "very slow" — it's a queue that grows forever.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this curve is the second axiom of the whole course, and the answer to half of all capacity questions. Run fleets at ρ &le; 0.7&ndash;0.8 not because idle CPU is nice, but because the region above it is where latency lives. Watch it happen live in the <b class="hl">saturation simulator</b> — then never trust a utilization average again.</p>` },
];

/* ---- lesson <-> skill cross-links ----
   Lessons teach a concept; the matching skill checks comprehension from a
   different angle. Indices reference the FINAL lesson order (see the LESSON
   PLAN at the top of this file) — packs 10-40 fill in lessons 4-25. */
// skill (drill) id -> the lesson whose concept it tests (0-based index)
const DRILL_LESSON = {
  littlelaw:2, histogram:9, ewma:22, mm1wait:3, fanout:6, openloop:10,
  shedder:12, aimd:15,
  knee:20, retrystorm:23, pctmerge:5, coordomission:8, qdiscipline:14,
  scalelag:22, cachecap:24,
};
// lesson index -> where to go practice it { mod, drill? }
const LESSON_PRACTICE = {
  0:{mod:"model"}, 1:{mod:"queuesim"}, 2:{mod:"primitives",drill:"littlelaw"}, 3:{mod:"primitives",drill:"mm1wait"},
  4:{mod:"model"}, 5:{mod:"bank",drill:"pctmerge"}, 6:{mod:"primitives",drill:"fanout"}, 7:{mod:"queuesim"},
  8:{mod:"bank",drill:"coordomission"}, 9:{mod:"primitives",drill:"histogram"}, 10:{mod:"primitives",drill:"openloop"},
  11:{mod:"model"}, 12:{mod:"primitives",drill:"shedder"}, 13:{mod:"tradeoffs"}, 14:{mod:"bank",drill:"qdiscipline"},
  15:{mod:"primitives",drill:"aimd"}, 16:{mod:"model"}, 17:{mod:"tradeoffs"}, 18:{mod:"tradeoffs"}, 19:{mod:"tradeoffs"},
  20:{mod:"bank",drill:"knee"}, 21:{mod:"primitives",drill:"littlelaw"}, 22:{mod:"bank",drill:"scalelag"},
  23:{mod:"bank",drill:"retrystorm"}, 24:{mod:"bank",drill:"cachecap"}, 25:{mod:"tradeoffs"},
};
