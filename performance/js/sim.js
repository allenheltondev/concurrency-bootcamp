"use strict";
/* Performance & Queueing Bootcamp — course-owned module: the saturation
   simulator. One queue, one server, virtual time, a seeded PRNG — you set
   the arrival rate and the service time, then watch the queue and the p99
   do exactly what lesson 4's curve promised: nothing much until ρ ≈ 0.8,
   then vertical. A load-shedding toggle caps the queue and trades errors
   for a survivable tail.

   Deterministic on purpose: same sliders, same seed, same run — the PRNG is
   mulberry32 (js/core.js) and the clock is a number we advance. No wall
   time anywhere.

   The generic engine (../js/app.js) knows nothing about it: the MODULES
   entry in js/content.js points here with
   { type:"sim", renderFn:"renderQueueSimModule" } and the engine dispatches
   through globalThis. Loaded after content.js, before the engine — the
   engine helpers (el, main, esc, conceptLinkRow) are shared globals that
   exist by the time this renders. */

let qsim = { rate: 60, service: 10, shed: false };
const QSIM_N = 600;           // arrivals per run
const QSIM_CAP = 20;          // max queue depth when shedding is on
const QSIM_SEED = 1234;

/* one full run in virtual time: Poisson arrivals (exponential gaps),
   exponential service — a seeded M/M/1, with an optional queue cap */
function runQueueSim({ rate, service, shed }){
  const rng = mulberry32(QSIM_SEED);
  const meanGap = 1000 / rate;
  let t = 0, free = 0;
  const done = [];              // finish times of in-flight/queued work (FIFO)
  const latencies = [];
  let busy = 0, rejected = 0;
  const depthSamples = [];      // [t, depth] sparkline data
  for (let i = 0; i < QSIM_N; i++){
    t += expSample(rng, meanGap);
    while (done.length && done[0] <= t) done.shift();
    if (shed && done.length >= QSIM_CAP){ rejected++; depthSamples.push([t, done.length]); continue; }
    const s = expSample(rng, service);
    const start = Math.max(t, free);
    free = start + s;
    done.push(free);
    busy += s;
    latencies.push(free - t);
    depthSamples.push([t, done.length]);
  }
  const horizon = Math.max(t, free);
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  return {
    served: latencies.length, rejected,
    utilization: busy / horizon,
    mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50: pct(50), p99: pct(99),
    finalDepth: done.filter(d => d > t).length,
    depthSamples, horizon,
  };
}

/* the analytic overlay: exact M/M/1 mean, W = S/(1−ρ) */
function qsimAnalytic(rate, service){
  const rho = rate * service / 1000;
  return { rho, W: rho >= 1 ? Infinity : service / (1 - rho) };
}

/* sparkline of queue depth over virtual time */
function qsimSparkline(samples, horizon){
  const W = 320, H = 64, maxD = Math.max(4, ...samples.map(s => s[1]));
  const pts = samples.map(([t, d]) =>
    (10 + (t / horizon) * (W - 20)).toFixed(1) + "," + (H - 6 - (d / maxD) * (H - 16)).toFixed(1)
  ).join(" ");
  return `<svg class="estage" viewBox="0 0 ${W} ${H + 14}" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
    <line x1="10" y1="${H - 6}" x2="${W - 10}" y2="${H - 6}" stroke="#2c3350" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#8e86f0" stroke-width="1.5"/>
    <text x="10" y="${H + 8}" fill="#6a7090" font-size="8">queue depth over the run · peak ${maxD}</text>
  </svg>`;
}

function renderQueueSimModule(mod){
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow || "module"}</div>
    <h1>The saturation simulator</h1>
    <p class="lead">One queue, one server, six hundred requests in virtual time. Slide the arrival rate toward the service rate and watch what the curve in lesson 4 promised: the queue barely exists at ρ&nbsp;=&nbsp;0.5, grumbles at 0.8, and <b style="color:var(--text)">detonates</b> as ρ&nbsp;&rarr;&nbsp;1.</p>
    <p class="sub">Then flip on <b style="color:var(--text)">load shedding</b> (queue capped at ${QSIM_CAP}): the same overload becomes fast rejections plus a bounded tail — errors traded for latency, deliberately. Same seed every run, so what you see is the physics, not the dice.</p>
  </div>`));
  if (mod.conceptLesson != null){ const row = conceptLinkRow(mod.conceptLesson); if (row){ row.style.margin = "0 0 16px"; main.appendChild(row); } }

  const card = el(`<div class="card"><h2>Push it toward the wall</h2><div class="why">// service rate μ = 1000/S req/s · utilization ρ = λ/μ · W = S/(1−ρ)</div></div>`);

  const ctrls = el(`<div class="ctrls"></div>`);
  const rEl = el(`<label class="ctrl">arrival rate λ <input type="range" min="10" max="140" step="5" value="${qsim.rate}"> <b style="color:var(--text)" data-rv>${qsim.rate}</b>/s</label>`);
  const sEl = el(`<label class="ctrl">service time S <input type="range" min="4" max="16" step="2" value="${qsim.service}"> <b style="color:var(--text)" data-sv>${qsim.service}</b>ms</label>`);
  const shedEl = el(`<div class="toggle ${qsim.shed ? "on" : ""}"><div class="switch"></div> load shedding</div>`);
  const gauge = el(`<div class="dnote" style="margin:0 0 6px"></div>`);
  const updateGauge = () => {
    const { rho, W } = qsimAnalytic(qsim.rate, qsim.service);
    gauge.innerHTML = rho >= 1
      ? `ρ = <b style="color:var(--race)">${rho.toFixed(2)}</b> · analytic mean wait: <b style="color:var(--race)">∞ — no steady state</b>`
      : `ρ = <b style="color:var(--text)">${rho.toFixed(2)}</b> · analytic mean latency: <b style="color:var(--text)">${W.toFixed(0)}ms</b> (${(W / qsim.service).toFixed(1)}× the service time)`;
  };
  rEl.querySelector("input").oninput = e => { qsim.rate = +e.target.value; rEl.querySelector("[data-rv]").textContent = qsim.rate; updateGauge(); };
  sEl.querySelector("input").oninput = e => { qsim.service = +e.target.value; sEl.querySelector("[data-sv]").textContent = qsim.service; updateGauge(); };
  shedEl.onclick = () => { qsim.shed = !qsim.shed; shedEl.classList.toggle("on", qsim.shed); };
  ctrls.append(rEl, sEl, shedEl);
  card.appendChild(ctrls);
  card.appendChild(gauge);
  updateGauge();

  const runBtn = el(`<button class="btn go">▶ run 600 requests</button>`);
  const tape = el(`<div class="tape"></div>`);
  const spark = el(`<div style="display:none"></div>`);
  const result = el(`<div class="result" style="display:none"></div>`);

  runBtn.onclick = async () => {
    runBtn.disabled = true; const old = runBtn.textContent; runBtn.textContent = "queueing…";
    tape.innerHTML = ""; result.style.display = "none"; spark.style.display = "none";
    const out = runQueueSim({ ...qsim });
    const { rho } = qsimAnalytic(qsim.rate, qsim.service);
    // stream a sampled tape of queue depths so the growth is visible
    const stride = Math.ceil(out.depthSamples.length / 24);
    for (let i = 0; i < out.depthSamples.length; i += stride){
      const [t, d] = out.depthSamples[i];
      const chip = el(`<span class="step">t${(t / 1000).toFixed(1)}s · q=${d}</span>`);
      const color = d >= QSIM_CAP ? "var(--race)" : d > 4 ? "var(--accent)" : "var(--ordered)";
      chip.style.borderColor = color; chip.style.color = color;
      tape.appendChild(chip);
      await sleep(90);
    }
    spark.innerHTML = qsimSparkline(out.depthSamples, out.horizon);
    spark.style.display = "block";
    const overloaded = rho >= 1;
    const verdictBits = [
      `ρ ${out.utilization.toFixed(2)} measured`,
      `mean ${out.mean.toFixed(0)}ms`, `p50 ${out.p50.toFixed(0)}ms`, `p99 ${out.p99.toFixed(0)}ms`,
      qsim.shed ? `${out.rejected} shed` : `${out.finalDepth} still queued at the end`,
    ];
    let story;
    if (qsim.shed && overloaded)
      story = "over capacity, but the cap held: rejections are instant, and everyone admitted saw a bounded queue — errors bought back the tail";
    else if (overloaded)
      story = "ρ ≥ 1: the queue never stopped growing — every latency here would keep climbing if the run were longer. This is not a slow system; it's an unstable one";
    else if (rho >= 0.85)
      story = "the wall: still 'under capacity', and the tail is already many multiples of the service time — this is where 'we have headroom' goes to die";
    else if (rho >= 0.6)
      story = "the knee: waits are a few multiples of service time and climbing fast — the cheap region is behind you";
    else
      story = "comfortable: the queue barely forms and latency ≈ service time — this is what real headroom looks like";
    result.style.display = "block";
    result.className = "result " + ((overloaded && !qsim.shed) ? "lost" : "exact");
    result.textContent = verdictBits.join(" · ") + " — " + story;
    runBtn.disabled = false; runBtn.textContent = old;
  };
  card.appendChild(el(`<div class="row"></div>`)).appendChild(runBtn);
  card.appendChild(tape);
  card.appendChild(spark);
  card.appendChild(result);
  main.appendChild(card);

  main.appendChild(el(`<div class="card">
    <div class="why">// what to try, in order</div>
    <pre class="code"><span class="cm">// 1. λ=60, S=10  (ρ=0.6): latency ≈ service. boring. good.</span>
<span class="cm">// 2. λ=85, S=10  (ρ=0.85): same code, 6-7× the latency — pure queueing</span>
<span class="cm">// 3. λ=110, S=10 (ρ=1.1): the queue only grows. there is no steady state</span>
<span class="cm">// 4. same, shedding ON: instant errors, bounded tail — overload with a floor</span>
<span class="ok">// the code never changed. only λ did. that's the hockey stick.</span></pre>
    <p class="sub" style="margin-bottom:0">Below the knee the measured numbers hug the analytic line. Near saturation they sit <b style="color:var(--text)">below</b> it — a 600-request run systematically under-measures a steady state that takes thousands of requests to reach, so the real queue is <b style="color:var(--text)">worse</b> than the sample shows. What never wobbles: below the knee the queue forgives, above it the queue compounds, and past ρ&nbsp;=&nbsp;1 the only question is which resource dies first. Shedding doesn't make overload cheap — it makes it <b style="color:var(--text)">bounded</b>.</p>
  </div>`));
}
