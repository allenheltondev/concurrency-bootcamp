/* Performance & Queueing Bootcamp — core: tiny helpers, reference
   implementations, and the demo runners that power every "run reference"
   button. Loaded first.

   Everything here runs in VIRTUAL TIME: timestamps are numbers we pass
   around, arrivals come from arithmetic or a seeded PRNG, and no demo ever
   asserts on the wall clock. The physics are the point — queues, tails,
   saturation, and feedback loops behave exactly like the real thing, just
   deterministically enough that every demo's invariant check always holds.

   The queueing math states its assumptions: Little's law (L = λW) is
   distribution-free and needs only a stable system; the closed-form wait
   W = S/(1−ρ) is the exact M/M/1 result (Poisson arrivals, exponential
   service, one server, FIFO) — the SHAPE generalizes, the constants don't. */
"use strict";

/* ---------- tiny helpers available to demos ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const rnd = (n) => Math.floor(Math.random()*n);

/* seeded PRNG (mulberry32): deterministic randomness for the simulator */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* exponential sample with the given mean — the building block of Poisson traffic */
const expSample = (rng, mean) => -mean * Math.log(1 - rng());

/* exact percentile over a raw sample array (demos only — production uses histograms) */
function exactPercentile(values, p){
  const s = [...values].sort((a,b)=>a-b);
  const rank = Math.max(1, Math.ceil((p/100)*s.length));
  return s[rank-1];
}

/* ===========================================================
   REFERENCE IMPLEMENTATIONS  (these power the Run buttons)
   =========================================================== */

/* ---- Little's law: L = λW. Given any two, compute the third.
        Distribution-free; requires only long-run stability. ---- */
function littleSolve({ L, lambda, W }){
  const known = [L, lambda, W].filter(v => v != null).length;
  if (known !== 2) throw new Error("need exactly two of L, lambda, W");
  if (L == null)      return { L: lambda * W, lambda, W };
  if (lambda == null) return { L, lambda: L / W, W };
  return { L, lambda, W: L / lambda };
}

/* ---- the streaming histogram: bounded memory, mergeable, honest ----
   counts[i] holds samples in (bounds[i-1], bounds[i]]; the last slot is
   the overflow bucket. percentile() reports the bucket's UPPER bound —
   it may over-report by a bucket width, it can never under-report. */
class Histogram{
  constructor(bounds){                      // ascending bucket upper bounds
    this.bounds = bounds;
    this.counts = new Array(bounds.length + 1).fill(0);
    this.total = 0;
  }
  record(v){
    let i = 0;
    while (i < this.bounds.length && v > this.bounds[i]) i++;
    this.counts[i]++;
    this.total++;
  }
  percentile(p){
    const rank = Math.ceil((p / 100) * this.total);
    let cum = 0;
    for (let i = 0; i < this.counts.length; i++){
      cum += this.counts[i];
      if (cum >= rank) return i < this.bounds.length ? this.bounds[i] : Infinity;
    }
  }
  merge(other){                             // the ONLY valid percentile aggregation
    if (other.bounds.length !== this.bounds.length ||
        other.bounds.some((b, i) => b !== this.bounds[i]))
      throw new Error("bounds must match to merge");
    const h = new Histogram(this.bounds);
    h.counts = this.counts.map((c, i) => c + other.counts[i]);
    h.total = this.total + other.total;
    return h;
  }
}

/* ---- EWMA: exponentially weighted moving average. alpha = the weight of
        the NEW sample (small alpha = heavy smoothing, more lag). ---- */
class Ewma{
  constructor(alpha){ this.alpha = alpha; this.v = null; }
  update(sample){
    if (this.v === null) this.v = sample;   // seed with the first sample, never 0
    else this.v = this.alpha * sample + (1 - this.alpha) * this.v;
    return this.v;
  }
  value(){ return this.v; }
}

/* ---- M/M/1 closed forms (exact for Poisson arrivals + exponential service,
        one server, FIFO). λ in req/s, service time in ms. ---- */
function mm1Metrics(lambdaRps, serviceMs){
  const mu = 1000 / serviceMs;              // service rate, req/s
  const rho = lambdaRps / mu;               // utilization
  if (rho >= 1) return { rho, W: Infinity, Wq: Infinity, L: Infinity, Lq: Infinity };
  const W  = serviceMs / (1 - rho);         // total time in system (ms)
  const Wq = W - serviceMs;                 // time waiting in queue (ms)
  return { rho, W, Wq,
           L:  lambdaRps * (W  / 1000),     // Little's law: jobs in system
           Lq: lambdaRps * (Wq / 1000) };   // Little's law: jobs waiting
}

/* ---- fan-out tail amplification: a request that touches n backends is as
        slow as its slowest leg. pSlow = per-leg P(latency > threshold). ---- */
function pTouchesTail(pSlow, n){
  return 1 - Math.pow(1 - pSlow, n);
}

/* ---- open vs closed loop, in virtual time. One saturable server;
        serviceTimes[i] = how long request i takes once started. ---- */
function openLoopRun(intervalMs, serviceTimes){
  // arrivals come from the WORLD's clock: i * interval, no matter what
  let free = 0; const lat = [];
  for (let i = 0; i < serviceTimes.length; i++){
    const scheduled = i * intervalMs;
    const start = Math.max(scheduled, free); // queue behind the backlog
    free = start + serviceTimes[i];
    lat.push(free - scheduled);              // measured from the SCHEDULED time
  }
  return lat;
}
function closedLoopRun(serviceTimes){
  // one virtual user: the next request departs only after the previous returns —
  // the generator slows down exactly when the server does
  return serviceTimes.slice();               // each request waits only its own service
}

/* ---- deadline-aware load shedding: reject at the door what cannot finish
        inside its deadline. A shed costs ~0 service time. ---- */
class DeadlineShedder{
  constructor(estServiceMs){ this.est = estServiceMs; this.queued = 0; }
  offer(now, deadline){
    const finishBy = now + (this.queued + 1) * this.est;  // queue wait + own service
    if (finishBy > deadline) return "shed";
    this.queued++;
    return "admitted";
  }
  done(){ this.queued--; }
}

/* ---- AIMD concurrency limiter: discover capacity instead of configuring it.
        +1 after a full window of successes; halve on an overload signal. ---- */
class AimdLimiter{
  constructor(start = 10, min = 1, max = 1000){
    this.limit = start; this.min = min; this.max = max;
    this.inflight = 0; this.streak = 0;
  }
  acquire(){
    if (this.inflight >= this.limit) return false;
    this.inflight++;
    return true;
  }
  release(ok){
    this.inflight--;
    if (!ok){
      this.streak = 0;
      this.limit = Math.max(this.min, Math.floor(this.limit / 2));  // MD: fast
      return;
    }
    this.streak++;
    if (this.streak >= this.limit){          // one full window of successes
      this.streak = 0;
      this.limit = Math.min(this.max, this.limit + 1);              // AI: gentle
    }
  }
}

/* ---- knee finder: read capacity off a step-load test ---- */
function findKnee(points, slo){
  // points: [{rps, p99}] ascending by rps, from an OPEN-LOOP step test
  let capacity = 0, knee = null;
  for (const pt of points){
    if (pt.p99 <= slo) capacity = pt.rps;
    else { knee = pt; break; }               // stop: post-collapse points lie
  }
  return { capacity, knee };
}

/* ---- retry amplification: expected attempts per request when every attempt
        fails independently with probability f and clients retry up to r times.
        Geometric sum: 1 + f + f² + … + f^r = (1 − f^(r+1)) / (1 − f). ---- */
function retryAmplification(failRate, maxRetries){
  if (failRate >= 1) return maxRetries + 1;  // hard outage: every retry is spent
  return (1 - Math.pow(failRate, maxRetries + 1)) / (1 - failRate);
}

/* ---- retry budget: retries may spend at most `ratio` of first-try traffic ---- */
class RetryBudget{
  constructor(ratio = 0.1){ this.ratio = ratio; this.firstTries = 0; this.retries = 0; }
  onFirstTry(){ this.firstTries++; }
  canRetry(){ return this.retries < this.firstTries * this.ratio; }
  onRetry(){ this.retries++; }
}

/* ---- coordinated-omission correction (the HdrHistogram move): a recorded
        stall longer than the intended send interval implies the samples the
        generator FAILED to send during it — reconstruct them, ramping down. ---- */
function correctOmission(samples, intervalMs){
  const out = [];
  for (const v of samples){
    out.push(v);
    for (let m = v - intervalMs; m >= intervalMs; m -= intervalMs) out.push(m);
  }
  return out;
}

/* ---- queue discipline under overload: FIFO vs LIFO with deadlines ---- */
function runDiscipline({ interArrival, service, deadline, count, policy }){
  const arrivals = Array.from({ length: count }, (_, i) => i * interArrival);
  let now = 0, i = 0, ok = 0, late = 0;
  const queue = [];
  while (i < arrivals.length || queue.length){
    while (i < arrivals.length && arrivals[i] <= now) queue.push(arrivals[i++]);
    if (!queue.length){ now = arrivals[i]; continue; }
    const arr = policy === "lifo" ? queue.pop() : queue.shift();
    now += service;
    if (now - arr <= deadline) ok++; else late++;
  }
  return { ok, late };
}

/* ---- autoscaling lag: what accumulates while you wait for capacity ---- */
function backlogDuringLag(lambdaRps, muRps, lagSec){
  return Math.max(0, lambdaRps - muRps) * lagSec;   // only the excess queues
}
function drainSeconds(backlog, muNewRps, lambdaRps){
  if (muNewRps <= lambdaRps) return Infinity;       // still under water: never drains
  return backlog / (muNewRps - lambdaRps);
}

/* ---- caching as capacity: the origin only sees the misses ---- */
function originRps(edgeRps, hitRatio){
  return edgeRps * (1 - hitRatio);
}
function originFits(edgeRps, hitRatio, originCapacityRps){
  // keep the origin at or under 80% — the hockey stick lives above that
  return originRps(edgeRps, hitRatio) <= originCapacityRps * 0.8;
}

/* ===========================================================
   DEMOS  -> return {lines:[{t}], pass:boolean, verdict}
   =========================================================== */
async function demoLittleLaw(){
  const w = littleSolve({ L: 120, lambda: 60 });          // gateway gauge + rate
  const l = littleSolve({ lambda: 50, W: 0.2 });          // rate + latency
  const r = littleSolve({ L: 10, W: 0.05 });              // pool size + latency
  const roundtrip = littleSolve({ lambda: w.lambda, W: w.W });
  const pass = w.W === 2 && l.L === 10 && r.lambda === 200 && roundtrip.L === 120;
  return { lines: [
    { t: `120 in flight at 60 req/s -> users wait W = 120/60 = ${w.W}s (no latency metric consulted)` },
    { t: `50 req/s x 0.2s -> L = ${l.L} requests in the system at any instant` },
    { t: `a 10-connection pool at 50ms per query -> supports at most λ = ${r.lambda} req/s` },
  ], pass, verdict: pass
    ? "L = λW: measure any two observables and the third is arithmetic — on any stable system, no distribution assumptions"
    : `W=${w.W} L=${l.L} λ=${r.lambda}` };
}

async function demoHistogram(){
  const h = new Histogram([10, 20, 50, 100, 200, 500, 1000]);
  for (let i = 0; i < 960; i++) h.record(8);              // fast path
  for (let i = 0; i < 30; i++) h.record(45);              // cache misses
  for (let i = 0; i < 10; i++) h.record(400);             // the tail
  const p50 = h.percentile(50), p99 = h.percentile(99), p999 = h.percentile(99.9);
  const mean = (960*8 + 30*45 + 10*400) / 1000;
  const pass = h.total === 1000 && p50 === 10 && p99 === 50 && p999 === 500
    && h.counts.reduce((a,b)=>a+b,0) === 1000;
  return { lines: [
    { t: `1,000 samples in ${h.counts.length} counters — bounded memory, mergeable across hosts` },
    { t: `p50 ≤ ${p50}ms · p99 ≤ ${p99}ms · p99.9 ≤ ${p999}ms (bucket upper bounds: never under-reported)` },
    { t: `the mean says ${mean.toFixed(1)}ms — and 10 users just waited 400ms` },
  ], pass, verdict: pass
    ? "counts per bucket answer any percentile, merge across hosts, and cost a few integers — the honest primitive"
    : `p50=${p50} p99=${p99} p999=${p999}` };
}

async function demoEwma(){
  const e = new Ewma(0.2);
  for (let i = 0; i < 10; i++) e.update(100);
  const before = e.value();
  const atSpike = e.update(600);                          // one 6x latency spike
  for (let i = 0; i < 5; i++) e.update(100);
  const after = e.value();                                // 200 -> 180 -> ... -> ~132.8
  const pass = before === 100 && atSpike === 200 && Math.abs(after - 132.768) < 1e-9;
  return { lines: [
    { t: `steady 100ms -> EWMA ${before} (seeded with the first sample, not 0)` },
    { t: `one 600ms spike -> EWMA moves to ${atSpike}, not 600 — the alert doesn't flap` },
    { t: `5 healthy samples later -> ${after.toFixed(1)}, decaying home` },
  ], pass, verdict: pass
    ? "α = 0.2: each new sample gets 20% of the say — spikes register without owning the signal, at the price of lag"
    : `before=${before} spike=${atSpike} after=${after}` };
}

async function demoMM1(){
  const w50 = mm1Metrics(50, 10).W, w80 = mm1Metrics(80, 10).W,
        w90 = mm1Metrics(90, 10).W, w99 = mm1Metrics(99, 10).W,
        sat = mm1Metrics(100, 10).W;
  const pass = w50 === 20 && Math.abs(w80 - 50) < 1e-9 && Math.abs(w90 - 100) < 1e-9
    && Math.abs(w99 - 1000) < 1e-6 && sat === Infinity;
  return { lines: [
    { t: `10ms service, one server (M/M/1): W = S/(1−ρ)` },
    { t: `ρ .50 -> ${w50}ms · ρ .80 -> ${w80}ms · ρ .90 -> ${w90}ms · ρ .99 -> ${w99}ms` },
    { t: `ρ 1.0 -> ∞: the queue never drains — "we can handle it, CPU isn't at 100 yet" is not a plan` },
  ], pass, verdict: pass
    ? "the hockey stick: halving your headroom DOUBLES the wait — 80% busy already means 5x the bare service time"
    : `w=${[w50,w80,w90,w99,sat]}` };
}

async function demoFanout(){
  const p10 = pTouchesTail(0.01, 10), p69 = pTouchesTail(0.01, 69), p100 = pTouchesTail(0.01, 100);
  const pass = Math.abs(p10 - 0.0956) < 0.001 && Math.abs(p69 - 0.5) < 0.005
    && Math.abs(p100 - 0.634) < 0.001;
  return { lines: [
    { t: `each backend is slow 1% of the time; the request waits for its SLOWEST leg` },
    { t: `fan-out 10 -> ${(p10*100).toFixed(1)}% of requests hit the tail · 69 -> ${(p69*100).toFixed(1)}% · 100 -> ${(p100*100).toFixed(1)}%` },
    { t: `at n = 69 the per-server p99 latency is the MEDIAN user experience` },
  ], pass, verdict: pass
    ? "1 − 0.99ⁿ: fan-out manufactures tail traffic out of healthy servers — the wider you scatter, the more p99 you gather"
    : `p10=${p10} p69=${p69} p100=${p100}` };
}

async function demoOpenLoop(){
  const services = [5,5,5, 500, 5,5,5,5,5,5];             // one 500ms stall mid-run
  const open = openLoopRun(10, services);
  const closed = closedLoopRun(services);
  const openBad = open.filter(v => v >= 100).length;
  const closedBad = closed.filter(v => v >= 100).length;
  const pass = openBad === 7 && closedBad === 1
    && open[3] === 470 && Math.max(...closed) === 500;
  return { lines: [
    { t: `10 requests scheduled every 10ms; request #4 stalls the server for 500ms` },
    { t: `open loop (world's clock): ${openBad} samples ≥ 100ms — the backlog is IN the data` },
    { t: `closed loop (wait-then-send): ${closedBad} bad sample — the generator politely stopped measuring` },
  ], pass, verdict: pass
    ? "a closed-loop generator self-throttles exactly when the server hurts — open loop is how you see what users see"
    : `open=${openBad} closed=${closedBad}` };
}

/* shared timed sim for the shedder demo */
function shedderSim({ interMs, serviceMs, deadlineMs, n, shed }){
  const shedder = new DeadlineShedder(serviceMs);
  let free = 0, ok = 0, expired = 0, shedCount = 0;
  const doneAt = [];
  for (let i = 0; i < n; i++){
    const now = i * interMs;
    while (doneAt.length && doneAt[0] <= now){ doneAt.shift(); shedder.done(); }
    if (shed && shedder.offer(now, now + deadlineMs) === "shed"){ shedCount++; continue; }
    const start = Math.max(now, free);
    free = start + serviceMs;
    if (shed) doneAt.push(free);
    if (free - now <= deadlineMs) ok++; else expired++;
  }
  return { ok, expired, shedCount };
}
async function demoShedder(){
  const cfg = { interMs: 5, serviceMs: 10, deadlineMs: 40, n: 30 };
  const raw = shedderSim({ ...cfg, shed: false });
  const shed = shedderSim({ ...cfg, shed: true });
  const pass = shed.ok > raw.ok && shed.expired === 0 && shed.shedCount > 0
    && raw.expired > raw.ok;
  return { lines: [
    { t: `2x overload: arrivals every 5ms, service 10ms, 40ms deadline` },
    { t: `queue-and-pray: ${raw.ok} served in time, ${raw.expired} timed out AFTER consuming the server` },
    { t: `deadline shedding: ${shed.ok} served in time, ${shed.shedCount} rejected instantly, ${shed.expired} timeouts` },
  ], pass, verdict: pass
    ? "reject early and cheap: everything admitted finished inside its deadline — the overload became fast errors, not slow ones"
    : `raw=${raw.ok}/${raw.expired} shed=${shed.ok}/${shed.expired}/${shed.shedCount}` };
}

async function demoAimd(){
  const capacity = 8;                                      // the truth nobody configured
  const lim = new AimdLimiter(4, 1, 100);
  const trace = [];
  for (let round = 0; round < 14; round++){
    let admitted = 0;
    while (lim.acquire()) admitted++;
    const overloaded = admitted > capacity;
    if (overloaded) lim.release(false);
    for (let i = overloaded ? 1 : 0; i < admitted; i++) lim.release(true);
    trace.push(lim.limit);
  }
  const peak = Math.max(...trace), trough = Math.min(...trace.slice(3));
  const pass = peak === 9 && trough === 5 && trace.includes(8) && trace[0] === 5;
  return { lines: [
    { t: `real capacity 8 — the limiter starts at 4 and is never told` },
    { t: `limit per round: ${trace.join(" ")}` },
    { t: `sawtooth: probe +1 to ${peak}, one overload signal, halve, re-climb — hugging capacity from below` },
  ], pass, verdict: pass
    ? "AIMD discovers the limit and keeps re-discovering it as it moves — decrease must be multiplicative to outrun the overload"
    : `trace=${trace.join(",")}` };
}

async function demoKnee(){
  const points = [
    { rps: 100, p99: 40 }, { rps: 200, p99: 44 }, { rps: 300, p99: 58 },
    { rps: 400, p99: 130 }, { rps: 500, p99: 70 },        // 500: fast-failing errors
  ];
  const { capacity, knee } = findKnee(points, 100);
  const pass = capacity === 300 && knee && knee.rps === 400;
  return { lines: [
    { t: `step-load table: p99 = 40, 44, 58 … then 130 at 400 rps, then "70" at 500` },
    { t: `capacity = ${capacity} rps (last step meeting the 100ms SLO); the knee is at ${knee.rps}` },
    { t: `the 500-rps point is goodput collapse — errors return fast; it does NOT count as recovery` },
  ], pass, verdict: pass
    ? "capacity is the last rung that met the SLO, and you stop reading at the knee — past it the numbers measure failure, not service"
    : `capacity=${capacity} knee=${knee && knee.rps}` };
}

async function demoRetryStorm(){
  const brown = retryAmplification(0.5, 2);                // brownout: half fail, 2 retries
  const outage = retryAmplification(1, 3);                 // hard down, 3 retries
  const layered = Math.pow(outage, 3);                     // 3 layers each retrying 3x
  const pass = Math.abs(brown - 1.75) < 1e-9 && outage === 4 && layered === 64;
  return { lines: [
    { t: `brownout (50% failing, 2 retries): offered load x${brown} — while capacity is DOWN` },
    { t: `hard outage (3 retries): x${outage} the traffic arrives at the worst possible moment` },
    { t: `3 layers each retrying 3x: x${layered} at the bottom of the stack` },
  ], pass, verdict: pass
    ? "retries multiply offered load exactly when capacity is least available — that's the storm, and budgets are the cap"
    : `brown=${brown} outage=${outage} layered=${layered}` };
}

async function demoPctMerge(){
  const bounds = [10, 1000];
  const a = new Histogram(bounds);                         // sick host
  for (let i = 0; i < 900; i++) a.record(8);
  for (let i = 0; i < 100; i++) a.record(700);
  const b = new Histogram(bounds);                         // healthy host
  for (let i = 0; i < 1000; i++) b.record(8);
  const avg = (a.percentile(99) + b.percentile(99)) / 2;
  const fleet = a.merge(b).percentile(99);
  const pass = a.percentile(99) === 1000 && b.percentile(99) === 10
    && avg === 505 && fleet === 1000;
  return { lines: [
    { t: `host A p99 ≤ 1000ms (10% slow) · host B p99 ≤ 10ms` },
    { t: `"average the p99s": ${avg}ms — a latency NO request experienced` },
    { t: `merge the histograms, recompute: fleet p99 ≤ ${fleet}ms — the truth` },
  ], pass, verdict: pass
    ? "percentiles don't average — not even weighted. Merge the bucket counts, then take the percentile of the merged population"
    : `avg=${avg} fleet=${fleet}` };
}

async function demoCoordOmission(){
  const interval = 100;                                    // intended: one request / 100ms
  const recorded = [10,10,10,10,10,10,10,10,10, 1000];     // one 1s stall
  const corrected = correctOmission(recorded, interval);
  const rawP50 = exactPercentile(recorded, 50);
  const fixP50 = exactPercentile(corrected, 50);
  const added = corrected.length - recorded.length;
  const pass = rawP50 === 10 && fixP50 === 100 && added === 9
    && corrected.includes(900) && corrected.includes(100);
  return { lines: [
    { t: `the generator froze with the server for 1s — 9 sends never happened, so 9 bad samples were never taken` },
    { t: `uncorrected p50: ${rawP50}ms ("looks great!") · corrected p50: ${fixP50}ms` },
    { t: `correction re-adds the missing samples at 900, 800 … 100ms — each would-be send waited a bit less` },
  ], pass, verdict: pass
    ? "coordinated omission drops exactly the worst samples — the ramp-down backfill is how HdrHistogram and wrk2 undo the lie"
    : `raw=${rawP50} fix=${fixP50} added=${added}` };
}

async function demoDiscipline(){
  const cfg = { interArrival: 8, service: 10, deadline: 50, count: 60 };
  const fifo = runDiscipline({ ...cfg, policy: "fifo" });
  const lifo = runDiscipline({ ...cfg, policy: "lifo" });
  const pass = lifo.ok > fifo.ok && fifo.ok + fifo.late === 60 && lifo.ok + lifo.late === 60;
  return { lines: [
    { t: `sustained 1.25x overload, 50ms deadlines, 60 arrivals` },
    { t: `FIFO: ${fifo.ok} in deadline — every request queues behind the WHOLE backlog, then the backlog wins` },
    { t: `LIFO: ${lifo.ok} in deadline — the freshest request jumps the line; the old ones were already doomed` },
  ], pass, verdict: pass
    ? "under overload FIFO is fair to requests and brutal to users — LIFO trades already-expired work for a living p50"
    : `fifo=${fifo.ok} lifo=${lifo.ok}` };
}

async function demoScaleLag(){
  const backlog = backlogDuringLag(200, 100, 120);         // spike vs 2-min scale-out
  const drain = drainSeconds(backlog, 300, 200);
  const peakWait = backlog / 300;
  const pass = backlog === 12000 && drain === 120 && peakWait === 40;
  return { lines: [
    { t: `traffic steps 100 -> 200 rps; capacity 100 rps; new instances take 120s` },
    { t: `backlog while waiting: (200−100) × 120 = ${backlog} requests` },
    { t: `even at 300 rps the drain takes ${drain}s more — and the deepest-queued user waited ~${peakWait}s` },
  ], pass, verdict: pass
    ? "autoscaling answers in minutes; spikes ask in seconds — the gap is a queue, and you must budget its wait (or shed it)"
    : `backlog=${backlog} drain=${drain}` };
}

async function demoCacheCap(){
  const healthy = originRps(20000, 0.99);
  const degraded = originRps(20000, 0.97);
  const fits = originFits(20000, 0.99, 500), breaks = originFits(20000, 0.97, 500);
  const pass = healthy === 200 && Math.abs(degraded - 600) < 1e-9 && fits && !breaks;
  return { lines: [
    { t: `20,000 rps at the edge, 99% hit ratio -> origin sees ${healthy} rps (fits a 500-rps origin with headroom)` },
    { t: `hit ratio slips 2 points to 97% -> origin sees ${Math.round(degraded)} rps — 3x, over capacity` },
    { t: `the origin must be sized for the worst CREDIBLE hit ratio, not the average one` },
  ], pass, verdict: pass
    ? "origin load = λ(1−h): at high hit ratios each lost point of h multiplies the origin's world — the cache IS capacity, and it can evaporate"
    : `healthy=${healthy} degraded=${degraded}` };
}

/* ===========================================================
   CONTENT (js/content.js) loads next
   =========================================================== */
