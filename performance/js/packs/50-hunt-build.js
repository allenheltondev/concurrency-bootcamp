"use strict";
/* Performance & Queueing Bootcamp — content pack: the rest of spot-the-bug
   and write-it. Appends 5 bug hunts and 6 write-it exercises; every id is
   globally unique and every lesson index references the FINAL lesson order
   (see the LESSON PLAN in js/content.js). Loaded after the lesson packs,
   before the engine. */
(function () {

  /* =========================================================
     SPOT THE BUG
     ========================================================= */
  BUGHUNT.push(
  { id:"bug_bench", title:"Benchmark harness", why:"the clock must start after the warmup ends", lesson:16,
    scenario:"Two teams benchmark the same function with the same harness and get numbers 40% apart — and either team can 'improve' its result just by raising the iteration count, without touching the code. A per-op cost that depends on how long you watch it isn't a cost. Which line poisons the clock?",
    lines:[
      "// per-op cost of fn, with a warmup phase to skip",
      "// JIT tiers and cold caches",
      "function bench(fn, iters) {",
      "  let sink = 0;",
      "  const start = now();",
      "  for (let i = 0; i < 10000; i++) sink += fn(i);  // warmup",
      "  for (let i = 0; i < iters; i++) sink += fn(i);",
      "  const total = now() - start;",
      "  consume(sink);   // the optimizer can't delete the work",
      "  return total / iters;",
      "}",
    ],
    bug:[4],
    explain:"Line 5 starts the clock BEFORE the warmup loop, so ten thousand cold, interpreter-tier, cache-missing iterations are billed to the measured ones. The reported per-op cost = (warmup + steady×iters)/iters — it shrinks as iters grows, which is exactly the observed 'raise the count, improve the number.' Move `const start = now();` to after the warmup loop: the warmup exists precisely so the clock never sees it. (The harness got the other two classics right: the result feeds a sink, so dead-code elimination can't hollow out the loop.)" },

  { id:"bug_rollrate", title:"Utilization meter", why:"'right now' needs a window, not a lifetime", lesson:17,
    scenario:"Mid-incident, the capacity dashboard shows 45% utilization — 'we have headroom!' — while every request is queueing and the run queue is pinned. The service has been mostly idle since its 3am deploy and the incident started ten minutes ago. Which line makes the meter incapable of describing the present?",
    lines:[
      "// \"how busy are we RIGHT NOW?\" — feeds the capacity",
      "// dashboard and the scale-out decision",
      "class UtilizationMeter {",
      "  constructor() {",
      "    this.startMs = now();",
      "    this.busyMs = 0;",
      "  }",
      "",
      "  onRequestDone(serviceMs) {",
      "    this.busyMs += serviceMs;",
      "  }",
      "",
      "  utilization() {",
      "    return this.busyMs / (now() - this.startMs);",
      "  }",
      "}",
    ],
    bug:[13],
    explain:"Line 14 divides accumulated busy time by the time since the PROCESS STARTED — a lifetime average. Six quiet hours since the 3am deploy sit in the denominator forever, so ten minutes of full saturation reads as '45%', and every number the meter ever reports drifts toward the historical mean of the whole uptime. Utilization for operational decisions must be windowed: busy time within the last window divided by the window (rotate buckets, or decay the accumulator). A meter that includes last night's idle time cannot describe this minute's emergency." },

  { id:"bug_ewmascaler", title:"Autoscaler signal smoother", why:"alpha is the new sample's share — keep the convention straight", lesson:22,
    scenario:"The autoscaler was given a smoothed signal precisely so it would stop flapping — yet the fleet size sawtooths on every traffic wobble: two instances out on a quiet minute, three back in on a burst, caches re-colded by the churn every time. The smoothing constant is configured at 0.1, 'react slowly, trust history.' Which line ignores the configuration?",
    lines:[
      "// smooths the concurrency signal the autoscaler acts on.",
      "// alpha = weight of the NEW sample; 0.1 = react slowly,",
      "// trust history.",
      "class ScalerSignal {",
      "  constructor(alpha) {      // constructed with alpha = 0.1",
      "    this.alpha = alpha;",
      "    this.v = null;",
      "  }",
      "",
      "  update(sample) {",
      "    if (this.v === null) { this.v = sample; return this.v; }",
      "    this.v = (1 - this.alpha) * sample + this.alpha * this.v;",
      "    return this.v;",
      "  }",
      "}",
    ],
    bug:[11],
    explain:"Line 12 transposes the weights: the NEW sample gets (1 − α) = 0.9 of the say and history keeps 0.1 — the configured 'react slowly' became 'react to everything.' The smoothed line is 90% raw noise, so every burst and lull punches straight through to the scaler, which dutifully churns the fleet. The update must be `this.alpha * sample + (1 - this.alpha) * this.v`. Both orderings look equally plausible in review — which is why the convention (α = new sample's weight) belongs in the doc comment AND the code, agreeing." },

  { id:"bug_retrybudget", title:"Retry budget", why:"the cap is only a cap if the comparison says so", lesson:23,
    scenario:"The retry budget was shipped specifically to cap retries at 10% of live traffic. In the next outage's post-mortem, the traffic graph shows retries running at TEN TIMES first-try volume — the budget never once said no. The counters are correct; the arithmetic isn't. Which line?",
    lines:[
      "// retries may spend at most `ratio` of live first-try",
      "// traffic — the storm-proof cap",
      "class RetryBudget {",
      "  constructor(ratio = 0.1) {",
      "    this.ratio = ratio;",
      "    this.firstTries = 0;",
      "    this.retries = 0;",
      "  }",
      "",
      "  onFirstTry() {",
      "    this.firstTries++;",
      "  }",
      "",
      "  canRetry() {",
      "    return this.retries * this.ratio < this.firstTries;",
      "  }",
      "",
      "  onRetry() {",
      "    this.retries++;",
      "  }",
      "}",
    ],
    bug:[14],
    explain:"Line 15 multiplies the ratio onto the WRONG side: `retries × 0.1 < firstTries` authorizes retries until they reach TEN TIMES first-try traffic — the cap inverted into a 1000% allowance. It reads plausibly ('retries, scaled by the ratio, must stay under the traffic'), which is what makes it survive review. The guard must scale the base: `this.retries < this.firstTries * this.ratio`. One transposition turns the storm-proof cap into a storm permit — and nothing fails until the exact day the budget existed for." },

  { id:"bug_batcher", title:"Batch coalescer", why:"the deadline belongs to the FIRST item", lesson:25,
    scenario:"Daytime is fine — batches fill and flush constantly. But overnight, single writes sit in the coalescer for MINUTES: the 3am p99 for write-visibility is off the chart while every daytime graph is healthy. The size cap works; something about the time cap only works when traffic is heavy. Which line?",
    lines:[
      "// coalesces writes: flush when FULL (maxSize) or when",
      "// the oldest item has waited maxDelayMs",
      "class Coalescer {",
      "  constructor(maxSize, maxDelayMs) {",
      "    this.maxSize = maxSize;",
      "    this.maxDelay = maxDelayMs;",
      "    this.batch = [];",
      "    this.deadline = Infinity;",
      "  }",
      "",
      "  add(item, now) {",
      "    this.deadline = now + this.maxDelay;",
      "    this.batch.push(item);",
      "    if (this.batch.length >= this.maxSize) return this.flush();",
      "    return null;",
      "  }",
      "",
      "  poll(now) {",
      "    if (this.batch.length && now >= this.deadline) return this.flush();",
      "    return null;",
      "  }",
      "",
      "  flush() {",
      "    const out = this.batch;",
      "    this.batch = [];",
      "    this.deadline = Infinity;",
      "    return out;",
      "  }",
      "}",
    ],
    bug:[11],
    explain:"Line 12 re-arms the deadline on EVERY add — that's a debounce, not a coalescer. Under a steady trickle that never reaches maxSize, each new item pushes the flush deadline back before it can fire, so the oldest write waits unboundedly: exactly the overnight symptom, invisible in daytime when the size cap flushes first. The deadline must be set only when the batch is empty — `if (this.batch.length === 0) this.deadline = now + this.maxDelay;` — so it belongs to the FIRST item and caps every item's added latency at maxDelay." },
  );

  /* =========================================================
     WRITE IT
     ========================================================= */
  WRITE.push(
  { id:"w-merge", title:"Mergeable histograms — write it", why:"the only valid way to aggregate percentiles", lesson:5,
    spec:"Write mergeHistograms(a, b): both are {bounds, counts, total} with IDENTICAL bounds (throw if not). Return a merged histogram: counts summed index-wise, totals added, same bounds. percentileOf() is provided — the fleet percentile is then just percentileOf(merged, p).",
    pre:`function percentileOf(h, p) {
  const rank = Math.ceil((p / 100) * h.total);
  let cum = 0;
  for (let i = 0; i < h.counts.length; i++) {
    cum += h.counts[i];
    if (cum >= rank) return i < h.bounds.length ? h.bounds[i] : Infinity;
  }
}
function mergeHistograms(a, b) {`,
    post:`}`,
    lines:[
      "  if (a.bounds.length !== b.bounds.length ||",
      "      a.bounds.some((x, i) => x !== b.bounds[i]))",
      "    throw new Error(\"bounds must match to merge\");",
      "  const counts = a.counts.map((c, i) => c + b.counts[i]);",
      "  const total = a.total + b.total;",
      "  return { bounds: a.bounds, counts, total };",
    ],
    distractors:[
      { code:"  const counts = a.counts.map((c, i) => Math.max(c, b.counts[i]));",
        why:"max() is not a merge — samples don't disappear because another host had more in that bucket. The merged total no longer equals the counts' sum, and every rank walk lands in the wrong bucket." },
      { code:"  return { bounds: a.bounds, counts: a.counts, total: a.total + b.total };",
        why:"Totals both hosts but keeps only A's counts: half the fleet's samples vanish while the rank still counts them — high percentiles walk past every bucket and return undefined, and the rest read from a histogram claiming twice the data it holds." },
      { code:"  const total = Math.max(a.total, b.total);",
        why:"The total must equal the sum of the counts or every rank is computed against the wrong population — percentiles silently shift low. total = a.total + b.total, always." },
    ],
    test:`const A = { bounds: [10, 1000], counts: [900, 100, 0], total: 1000 };  // sick host
const B = { bounds: [10, 1000], counts: [1000, 0, 0], total: 1000 };   // healthy host
assert(percentileOf(A, 99) === 1000, "host A's p99 is 1000, got " + percentileOf(A, 99));
assert(percentileOf(B, 99) === 10, "host B's p99 is 10, got " + percentileOf(B, 99));
const avg = (percentileOf(A, 99) + percentileOf(B, 99)) / 2;
log("average of host p99s: " + avg + "ms — a number no request experienced");
const m = mergeHistograms(A, B);
assert(m.total === 2000, "merged population is 2000 samples, got " + m.total);
assert(m.counts.join(",") === "1900,100,0", "counts sum index-wise, got " + m.counts.join(","));
const fleet = percentileOf(m, 99);
log("fleet p99 from the merged histogram: " + fleet + "ms");
assert(fleet === 1000, "the true fleet p99 is 1000 (5% of all traffic is slow), got " + fleet);
assert(percentileOf(m, 50) === 10, "fleet p50 stays 10, got " + percentileOf(m, 50));
let threw = false;
try { mergeHistograms(A, { bounds: [10, 500], counts: [1, 0, 0], total: 1 }); }
catch (e) { threw = true; }
assert(threw, "mismatched bounds must throw - counts from different rulers cannot add");`,
    pass:"populations merged, percentile recomputed — 1000ms, not the averaged fiction of 505",
    takeaway:"Percentiles are facts about a population, so the aggregation must merge the populations — and histograms make that one array-add. This is why every serious metrics pipeline ships buckets, not quantiles.",
    hint:"Verify the bounds arrays match (throw otherwise). counts[i] = a.counts[i] + b.counts[i]; total = a.total + b.total; return with the shared bounds." },

  { id:"w-openloop", title:"Open-loop generator — write it", why:"send on schedule, measure from the schedule", lesson:10,
    spec:"Write openLoopRun(intervalMs, serviceTimes): requests are SCHEDULED at i × intervalMs regardless of the server. One server processes FIFO (a request starts at max(its scheduled time, when the server frees up)). Return the latency of each request measured from its SCHEDULED time.",
    pre:`function openLoopRun(intervalMs, serviceTimes) {`,
    post:`}`,
    lines:[
      "  let free = 0;",
      "  const lat = [];",
      "  for (let i = 0; i < serviceTimes.length; i++) {",
      "    const scheduled = i * intervalMs;",
      "    const start = Math.max(scheduled, free);",
      "    free = start + serviceTimes[i];",
      "    lat.push(free - scheduled);",
      "  }",
      "  return lat;",
    ],
    distractors:[
      { code:"    const scheduled = Math.max(i * intervalMs, free);",
        why:"The generator now waits for the server before 'scheduling' — a closed loop in disguise. During a stall it stops sending, the backlog never forms, and the benchmark reports a healthy system under an overload it refused to deliver." },
      { code:"    lat.push(free - start);",
        why:"Measures from the actual service start: the time spent queued behind the stall vanishes from every sample. That's coordinated omission, hand-rolled — one bad sample instead of a backlog of them." },
      { code:"    free = scheduled + serviceTimes[i];",
        why:"Resets the server's busy-until from the schedule instead of the actual start — backlog can't accumulate, so the simulation is incapable of saturating. The server is busy from when it STARTS the work." },
    ],
    test:`const calm = openLoopRun(10, [5, 5, 5]);
assert(calm.join(",") === "5,5,5", "an unloaded server: latency = service time, got " + calm.join(","));
const stall = openLoopRun(10, [50, 5, 5]);
log("request 0 stalls 50ms; later requests queue: " + stall.join(", "));
assert(stall[0] === 50, "the stalled request itself takes 50, got " + stall[0]);
assert(stall[1] === 45, "request 1 (scheduled t=10) waits for the stall: 50+5-10 = 45, got " + stall[1]);
assert(stall[2] === 40, "request 2 (scheduled t=20) still pays: 55+5-20 = 40, got " + stall[2]);
const over = openLoopRun(10, [20, 20, 20, 20]);
assert(over.join(",") === "20,30,40,50", "sustained overload: each request queues deeper, got " + over.join(","));`,
    pass:"the stall showed up in EVERY affected sample — the backlog is in the data, where it belongs",
    takeaway:"Two decisions define an honest load test: arrivals come from the world's clock, and latency is measured from the intended send. Everything wrk2 and k6's arrival-rate executors do is this loop at scale.",
    hint:"scheduled = i*interval. start = max(scheduled, free). free = start + service. Record free − scheduled (NOT free − start)." },

  { id:"w-shedder", title:"Deadline shedder — write it", why:"admit only what can still succeed", lesson:12,
    spec:"Write offer(now, deadline) and done(). offer: project the request's finish time as now + (queued + 1) × estServiceMs (everything ahead of it, plus itself). If that lands past the deadline, return \"shed\" without touching the queue; otherwise increment queued and return \"admitted\". done: a request finished — decrement queued.",
    pre:`class DeadlineShedder {
  constructor(estServiceMs) {
    this.est = estServiceMs;
    this.queued = 0;
  }`,
    post:`}`,
    lines:[
      "  offer(now, deadline) {",
      "    const finishBy = now + (this.queued + 1) * this.est;",
      "    if (finishBy > deadline) return \"shed\";",
      "    this.queued++;",
      "    return \"admitted\";",
      "  }",
      "  done() { this.queued--; }",
    ],
    distractors:[
      { code:"    const finishBy = now + this.est;",
        why:"Ignores the queue: a request with 40ms of budget gets admitted into a 400ms line and dies there — having consumed a service slot. Under overload the whole queue becomes the walking dead, which is the failure shedding exists to prevent." },
      { code:"    if (finishBy < deadline) return \"shed\";",
        why:"Inverted: sheds every request that HAS time and admits only the doomed. The service rejects almost everything while the work it accepts times out anyway — rejections and timeouts, nobody served." },
      { code:"    if (finishBy > deadline) { this.queued++; return \"shed\"; }",
        why:"Counts shed requests into the queue estimate: each rejection inflates estWait, causing more rejections — the shedder spirals into rejecting everything while the server drains idle. Only admitted work occupies the queue." },
    ],
    test:`const s = new DeadlineShedder(10);
assert(s.offer(0, 100) === "admitted", "an empty queue and a 100ms budget: admit");
s.done();
for (let i = 0; i < 5; i++)
  assert(s.offer(0, 50) === "admitted", "request " + i + " still fits the 50ms budget");
assert(s.queued === 5, "five admitted requests occupy the queue, got " + s.queued);
assert(s.offer(0, 50) === "shed", "the 6th would finish at 60ms > 50ms deadline: shed");
assert(s.queued === 5, "a shed request must NOT occupy the queue, got " + s.queued);
log("5 admitted (each can finish by 50ms), 6th shed instantly");
s.done();
assert(s.offer(0, 50) === "admitted", "a completion frees a slot the next request can use");
const s2 = new DeadlineShedder(10);
assert(s2.offer(100, 90) === "shed", "already past its deadline: shed even with an empty queue");
log("verdict is computed from projected finish vs deadline - never from queue length alone");`,
    pass:"everything admitted could still finish in time; everything else got its no instantly and free",
    takeaway:"The shedder's invariant: projected finish (queue wait + own service) fits the deadline, or the request never enters. Overload becomes fast honest errors plus full-quality service — never universal slowness.",
    hint:"finishBy = now + (queued+1)*est. Past the deadline → \"shed\" (don't touch queued). Otherwise queued++ and \"admitted\". done() decrements." },

  { id:"w-aimd", title:"AIMD limiter — write it", why:"gentle up, violent down — that asymmetry is the algorithm", lesson:15,
    spec:"Write acquire() and release(ok). acquire: refuse (return false) when inflight ≥ limit, else count it in flight and return true. release(ok): decrement inflight. On failure: reset the success streak and HALVE the limit (floor, clamped to min). On success: bump the streak; after a full window (streak ≥ limit) reset the streak and raise the limit by 1 (clamped to max).",
    pre:`class AimdLimiter {
  constructor(start = 10, min = 1, max = 1000) {
    this.limit = start; this.min = min; this.max = max;
    this.inflight = 0; this.streak = 0;
  }`,
    post:`}`,
    lines:[
      "  acquire() {",
      "    if (this.inflight >= this.limit) return false;",
      "    this.inflight++;",
      "    return true;",
      "  }",
      "  release(ok) {",
      "    this.inflight--;",
      "    if (!ok) {",
      "      this.streak = 0;",
      "      this.limit = Math.max(this.min, Math.floor(this.limit / 2));",
      "      return;",
      "    }",
      "    this.streak++;",
      "    if (this.streak >= this.limit) {",
      "      this.streak = 0;",
      "      this.limit = Math.min(this.max, this.limit + 1);",
      "    }",
      "  }",
    ],
    distractors:[
      { code:"      this.limit = Math.max(this.min, this.limit - 1);",
        why:"Additive decrease: from a high limit it takes dozens of consecutive failures — each a full timed-out request — to shed meaningful load, while the downstream's queue compounds. The decrease must outrun the overload: halve it." },
      { code:"    this.limit = Math.min(this.max, this.limit + 1);",
        why:"+1 on EVERY success (no window) is exponential growth in disguise: one round of in-flight successes raises the limit by the whole limit. The limiter blasts past the capacity it just discovered, and the system oscillates between overload and half-speed." },
      { code:"    if (this.inflight > this.limit) return false;",
        why:"Off-by-one: admits limit+1 concurrent requests forever. The limiter's entire contract is AT MOST limit in flight — 'one extra' is how downstreams get tipped over at exactly the configured safe point." },
    ],
    test:`const l = new AimdLimiter(4, 1, 100);
for (let i = 0; i < 4; i++) assert(l.acquire() === true, "under the limit: admit #" + i);
assert(l.acquire() === false, "at the limit: refuse the 5th");
for (let i = 0; i < 4; i++) l.release(true);
assert(l.limit === 5, "a full window of successes raises the limit to 5, got " + l.limit);
log("probe up: 4 clean releases -> limit " + l.limit);
for (let i = 0; i < 5; i++) assert(l.acquire(), "the raised limit admits 5");
l.release(false);
assert(l.limit === 2, "one overload signal HALVES: floor(5/2) = 2, got " + l.limit);
log("overload signal -> limit " + l.limit + " (halved, not decremented)");
assert(l.acquire() === false, "in-flight (4) still exceeds the new limit: refuse");
for (let i = 0; i < 4; i++) l.release(true);
assert(l.inflight === 0, "all released, got " + l.inflight);
const c = new AimdLimiter(2, 1, 10);
c.acquire(); c.release(false);
c.acquire(); c.release(false);
assert(c.limit === 1, "repeated failures clamp at min=1, never 0 - got " + c.limit);
assert(c.acquire() === true, "even at the floor, one request may probe");`,
    pass:"gentle +1 per clean window, halved on the first bad signal, floored at min — capacity discovered, not configured",
    takeaway:"AIMD is TCP's gift to application engineers: probe additively so you don't recreate the incident, back off multiplicatively so you escape it. A limiter that can't reach zero keeps probing — the floor of 1 is the recovery path.",
    hint:"acquire: inflight >= limit → false; else inflight++ and true. release: inflight--; failure → streak=0, limit=max(min, floor(limit/2)); success → streak++, and at streak >= limit: streak=0, limit=min(max, limit+1)." },

  { id:"w-retrybudget", title:"Retry budget — write it", why:"cap the storm before it exists", lesson:23,
    spec:"Write onFirstTry(), canRetry(), onRetry(). The invariant: retries may never exceed ratio × firstTries. onFirstTry counts a fresh request. canRetry answers whether the budget allows one more retry RIGHT NOW. onRetry spends one unit of budget. Retries must never count into the base.",
    pre:`class RetryBudget {
  constructor(ratio = 0.1) {
    this.ratio = ratio;
    this.firstTries = 0;
    this.retries = 0;
  }`,
    post:`}`,
    lines:[
      "  onFirstTry() { this.firstTries++; }",
      "  canRetry() {",
      "    return this.retries < this.firstTries * this.ratio;",
      "  }",
      "  onRetry() { this.retries++; }",
    ],
    distractors:[
      { code:"  onRetry() { this.retries++; this.firstTries++; }",
        why:"Counting retries into the base makes the budget self-funding: every retry raises the ceiling for the next one. The 10% cap quietly becomes 11%, then the assumption underneath every capacity number is wrong in the direction that hurts." },
      { code:"    return this.retries * this.ratio < this.firstTries;",
        why:"The ratio multiplied onto the wrong side authorizes retries until they reach TEN TIMES first-try traffic — the cap inverted into a permit. It reads plausibly, which is exactly how it survives review until the outage audits it." },
      { code:"    return this.firstTries > 0;",
        why:"'Any traffic at all authorizes unlimited retries' — the budget in name only. During a hard outage every failed request retries at full amplification, which is the storm the class was written to prevent." },
    ],
    test:`const b = new RetryBudget(0.1);
assert(b.canRetry() === false, "no traffic -> no retry budget exists yet");
for (let i = 0; i < 100; i++) b.onFirstTry();
assert(b.canRetry() === true, "100 first tries at 10% -> retries available");
let spent = 0;
while (b.canRetry() && spent < 1000) { b.onRetry(); spent++; }
log("outage: retries demanded without limit -> budget granted exactly " + spent);
assert(spent === 10, "the budget must cut off at 10% of 100 = 10 retries, got " + spent);
assert(b.canRetry() === false, "budget exhausted - the storm stops here");
for (let i = 0; i < 50; i++) b.onFirstTry();
assert(b.canRetry() === true, "fresh first-try traffic replenishes the budget");
b.onRetry();
assert(b.retries === 11 && b.firstTries === 150, "retries never count into the base");`,
    pass:"10 retries per 100 first tries, then a hard no — amplification capped at 1.1× by construction",
    takeaway:"A retry budget converts 'retries are fine, usually' into an enforced invariant: the amplification factor can never exceed 1 + ratio, no matter how bad the outage. The denominator is FIRST TRIES only — that detail is the whole mechanism.",
    hint:"Three one-liners: firstTries++; retries < firstTries*ratio; retries++. The subtle part is what NOT to write — nothing in onRetry touches firstTries." },

  { id:"w-coalesce", title:"Batch coalescer — write it", why:"amortize the round trip without holding items hostage", lesson:25,
    spec:"Write add(item, now) and poll(now). Flush (return the batch and reset) when the batch reaches maxSize on add, or when poll finds the deadline passed. The deadline is set by the FIRST item into an empty batch (now + maxDelay) — later adds must NOT push it back. Empty batch: deadline is Infinity; poll returns null when there's nothing to flush.",
    pre:`class Coalescer {
  constructor(maxSize, maxDelayMs) {
    this.maxSize = maxSize; this.maxDelay = maxDelayMs;
    this.batch = []; this.deadline = Infinity;
  }
  flush() {
    const out = this.batch;
    this.batch = [];
    this.deadline = Infinity;
    return out;
  }`,
    post:`}`,
    lines:[
      "  add(item, now) {",
      "    if (this.batch.length === 0)",
      "      this.deadline = now + this.maxDelay;",
      "    this.batch.push(item);",
      "    if (this.batch.length >= this.maxSize) return this.flush();",
      "    return null;",
      "  }",
      "  poll(now) {",
      "    if (this.batch.length && now >= this.deadline)",
      "      return this.flush();",
      "    return null;",
      "  }",
    ],
    distractors:[
      { code:"    this.deadline = now + this.maxDelay;",
        why:"Unconditional: every add pushes the deadline back — a debounce, not a coalescer. A steady trickle below maxSize never flushes, and the overnight p99 for write-visibility explodes while daytime looks perfect." },
      { code:"    if (this.batch.length === 1)",
        why:"Arms the deadline on the SECOND item (the check runs before the push): a lone item that never gets company waits forever. The 3am single write is exactly the case the time cap exists for." },
      { code:"    if (this.batch.length > this.maxSize) return this.flush();",
        why:"Off-by-one: flushes at maxSize+1 — every 'full' batch carries one extra item, and a downstream with a hard batch-size limit rejects each one. Full means AT maxSize, not past it." },
    ],
    test:`const c = new Coalescer(3, 100);
assert(c.add("a", 0) === null, "first item waits for company");
assert(c.add("b", 10) === null, "second item still under maxSize");
const full = c.add("c", 20);
assert(full && full.join(",") === "a,b,c", "the 3rd item fills the batch: flush on add");
log("size flush: a,b,c at t=20");
assert(c.add("d", 200) === null, "a fresh batch starts; deadline armed at 300");
assert(c.poll(250) === null, "not due yet - the deadline is first-item + 100");
const timed = c.poll(300);
assert(timed && timed.join(",") === "d", "poll at the deadline flushes the lone item");
log("time flush: d at t=300 (waited exactly maxDelay)");
c.add("e", 400);
c.add("f", 470);
assert(c.poll(495) === null, "the deadline is 500 (from e) - f must NOT have pushed it back");
const two = c.poll(500);
assert(two && two.join(",") === "e,f", "flush at e's deadline even though f arrived late");
assert(c.poll(999) === null, "an empty coalescer polls to null, never an empty flush");`,
    pass:"full batches flush instantly, lonely items flush at maxDelay, and nobody's deadline moved",
    takeaway:"Batching's contract is two caps racing: size (throughput's friend) and the first item's deadline (latency's guardian). The whole difference between a coalescer and a debounce is WHO owns the timer — the first item, or the last.",
    hint:"add: empty batch → deadline = now + maxDelay (only then!); push; at maxSize → flush. poll: non-empty and now >= deadline → flush; else null." },
  );

})();
