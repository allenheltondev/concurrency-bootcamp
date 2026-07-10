"use strict";
/* Observability Bootcamp — course-owned module: the incident simulator.
   A small service graph (edge -> api x4 hosts -> db + cache) runs in virtual
   time, emitting per-minute metrics. Each run injects ONE hidden fault at
   minute 20 — db latency, cache hit-ratio collapse, one bad host, a retry
   storm, or a bad deploy — and your job is the on-call's job: read the
   dashboards, watch which alerts fire (symptom-based vs cause-based — the
   toggle), and name the culprit from the shapes alone.

   Deterministic on purpose: a seeded PRNG (mulberry32 from core.js) and
   virtual minutes, so incident #N looks identical on every device — the
   sleep() calls only pace the reveal. The generic engine (../js/app.js)
   knows nothing about this module: the MODULES entry in js/content.js points
   here with { type:"sim", renderFn:"renderIncidentSim" } and the engine
   dispatches through globalThis. Engine helpers (el, main, esc,
   conceptLinkRow) are shared globals by the time this renders. */

const SIM_FAULTS = [
  { id:"db-latency",  label:"db latency",       hint:"p99 explodes, p50 barely moves (cache hits stay fast), db p99 is the smoking gun, every host equally sick" },
  { id:"cache-drop",  label:"cache hit-ratio drop", hint:"p50 rises (misses take the slow path), db load and db p99 climb, hit ratio panel falls off a cliff — and users barely page-worthy" },
  { id:"bad-host",    label:"one bad host",     hint:"fleet p99 up while p50 is flat, error rate mid, and the host-spread panel shows one outlier carrying all the pain" },
  { id:"retry-storm", label:"retry storm",      hint:"the tell is traffic UP during an incident — retries multiply load, the db saturates, latency and errors feed the loop" },
  { id:"bad-deploy",  label:"bad deploy",       hint:"errors step up at the exact minute of a deploy marker, latency flat, resources bored — no cause alert has anything to say" },
];

const SIM_SLO = 0.995;           // 99.5% -> 0.5% error budget
const SIM_LAT_SLO = 400;         // p99 promise, ms
let simState = { seed: 7, mode: "symptom", run: null, guessed: false };

/* ---- the model: one minute of the service graph ---- */
function simMinute(m, fault, deployAt, rng) {
  const n = () => (rng() - 0.5);                       // +-0.5 noise unit
  const active = m >= 20;
  let rps = 100 + Math.round(n() * 6);
  let hit = 0.90 + n() * 0.02;
  let dbP99 = 66 + Math.round(n() * 6);
  let err = 0.002 + n() * 0.001;
  let spread = 1.1 + n() * 0.1;                        // worst-host p99 / median
  if (active) {
    if (fault === "db-latency") { dbP99 = 660 + Math.round(n() * 40); err = 0.010 + n() * 0.002; }
    if (fault === "cache-drop") { hit = 0.30 + n() * 0.04; dbP99 = 230 + Math.round(n() * 20); err = 0.004 + n() * 0.001; }
    if (fault === "bad-host")   { spread = 8 + n(); err = 0.050 + n() * 0.006; }
    if (fault === "retry-storm") {
      const ramp = Math.min(1, (m - 20) / 8);
      rps = Math.round(100 + 200 * ramp + n() * 10);
      dbP99 = Math.round(66 + 500 * ramp + n() * 20);
      err = 0.005 + 0.04 * ramp + n() * 0.004;
    }
    if (fault === "bad-deploy") { err = 0.080 + n() * 0.008; }
  }
  err = Math.max(0.0005, err);
  const miss = 1 - hit;
  const p50 = Math.round(miss > 0.5 ? 20 + dbP99 * 0.45 : 23 + n() * 2);
  let p99 = Math.round(20 + dbP99 + n() * 8);
  if (fault === "bad-host" && active) p99 = Math.round(20 + dbP99 * 10 + n() * 30);
  return { m, rps, hit, dbP99, err, spread, p50, p99, deploy: m === deployAt };
}

function simRun(seed) {
  const rng = mulberry32(seed * 2654435761 + 1);
  const fault = SIM_FAULTS[Math.floor(rng() * SIM_FAULTS.length)].id;
  // every run has a deploy marker; only the bad deploy's lands ON the step
  const deployAt = fault === "bad-deploy" ? 20 : 8 + Math.floor(rng() * 6);
  const mins = [];
  for (let m = 0; m < 60; m++) mins.push(simMinute(m, fault, deployAt, rng));
  return { fault, deployAt, mins, alerts: simAlerts(mins) };
}

/* ---- alert evaluation over the run (windows scaled for a 60-min sim) ---- */
function simWindow(mins, i, w, f) {
  const from = Math.max(0, i - w + 1);
  let s = 0; for (let j = from; j <= i; j++) s += f(mins[j]);
  return s / (i - from + 1);
}
function simAlerts(mins) {
  const budget = 1 - SIM_SLO;
  const first = { errBurn: -1, latSlo: -1, dbLat: -1, cacheHit: -1, traffic: -1, hostSpread: -1 };
  let latRun = 0, dbRun = 0, hitRun = 0, trafRun = 0, sprRun = 0;
  for (let i = 0; i < mins.length; i++) {
    // symptom: multi-window error-budget burn (sim windows 5m/15m; prod: 5m/1h + 30m/6h)
    const b5 = simWindow(mins, i, 5, (x) => x.err) / budget;
    const b15 = simWindow(mins, i, 15, (x) => x.err) / budget;
    if (first.errBurn === -1 && b5 > 8 && b15 > 8) first.errBurn = i;
    // symptom: latency SLO breach, sustained
    latRun = mins[i].p99 > SIM_LAT_SLO ? latRun + 1 : 0;
    if (first.latSlo === -1 && latRun >= 3) first.latSlo = i;
    // causes: sustained resource conditions
    dbRun = mins[i].dbP99 > 200 ? dbRun + 1 : 0;
    if (first.dbLat === -1 && dbRun >= 3) first.dbLat = i;
    hitRun = mins[i].hit < 0.6 ? hitRun + 1 : 0;
    if (first.cacheHit === -1 && hitRun >= 3) first.cacheHit = i;
    trafRun = mins[i].rps > 200 ? trafRun + 1 : 0;
    if (first.traffic === -1 && trafRun >= 3) first.traffic = i;
    sprRun = mins[i].spread > 4 ? sprRun + 1 : 0;
    if (first.hostSpread === -1 && sprRun >= 3) first.hostSpread = i;
  }
  return first;
}

/* ---- rendering helpers ---- */
const SIM_BLOCKS = "▁▂▃▄▅▆▇█";
function sparkline(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  return vals.map(v => SIM_BLOCKS[Math.min(7, Math.floor(((v - lo) / span) * 8))]).join("");
}
function simDashText(mins, upTo) {
  const sl = (f) => sparkline(mins.slice(0, upTo + 1).map(f));
  const cur = mins[upTo];
  const deployLine = mins.slice(0, upTo + 1).map(x => x.deploy ? "D" : "·").join("");
  return [
    "rps      " + sl(x => x.rps) + "  " + cur.rps + "/s",
    "err%     " + sl(x => x.err) + "  " + (cur.err * 100).toFixed(1) + "%",
    "p50      " + sl(x => x.p50) + "  " + cur.p50 + "ms",
    "p99      " + sl(x => x.p99) + "  " + cur.p99 + "ms",
    "db p99   " + sl(x => x.dbP99) + "  " + cur.dbP99 + "ms",
    "cache    " + sl(x => x.hit) + "  " + (cur.hit * 100).toFixed(0) + "% hit",
    "hosts    " + sl(x => x.spread) + "  worst/median ×" + cur.spread.toFixed(1),
    "deploys  " + deployLine,
  ].join("\n");
}
function simAlertRows(run, mode) {
  const a = run.alerts;
  const row = (t, label, note) => t === -1
    ? { fired: false, text: "quiet — " + label + " " + note }
    : { fired: true, text: "PAGE @m" + t + " — " + label };
  if (mode === "symptom") return [
    row(a.errBurn, "error-budget burn (5m ∧ 15m windows > 8× budget)", "(users' error budget never burned fast enough to page)"),
    row(a.latSlo, "latency SLO breach (p99 > " + SIM_LAT_SLO + "ms, 3m sustained)", "(the p99 promise held)"),
  ];
  return [
    row(a.dbLat, "cause: db p99 > 200ms (3m)", "(db latency looked normal)"),
    row(a.cacheHit, "cause: cache hit < 60% (3m)", "(cache behaved)"),
    row(a.traffic, "cause: traffic > 2× baseline (3m)", "(no traffic anomaly)"),
    row(a.hostSpread, "cause: host p99 spread > 4× (3m)", "(hosts uniform)"),
  ];
}

function renderIncidentSim(mod) {
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow || "module"}</div>
    <h1>The incident simulator</h1>
    <p class="lead">A service graph — edge &rarr; api ×4 hosts &rarr; db + cache — runs for sixty virtual minutes with one hidden fault injected at minute 20. You get exactly what the on-call gets: dashboards and alerts. Name the culprit from the shapes.</p>
    <p class="sub">Every incident is seeded and deterministic — replay it and the pixels repeat. Flip the alert toggle between <b style="color:var(--text)">symptom</b> (SLO burn, latency promise) and <b style="color:var(--text)">cause</b> (db, cache, traffic, hosts) and notice which fires first, which fires late, and which never fires at all — the bad deploy is invisible to every cause alert, and the cache collapse never pages the symptom set because users barely feel it.</p>
  </div>`));
  if (mod.conceptLesson != null) { const row = conceptLinkRow(mod.conceptLesson); if (row) { row.style.margin = "0 0 16px"; main.appendChild(row); } }

  const card = el(`<div class="card"><h2>Incident <span data-inum>#${simState.seed}</span></h2><div class="why">// fault hidden · injected at minute 20 · read the dashboards, then accuse</div></div>`);

  const ctrls = el(`<div class="ctrls"></div>`);
  const modeEl = el(`<div class="toggle ${simState.mode === "symptom" ? "on" : ""}"><div class="switch"></div> <span data-modelabel>${simState.mode === "symptom" ? "symptom alerts (page on user pain)" : "cause alerts (page on resource state)"}</span></div>`);
  ctrls.append(modeEl);
  card.appendChild(ctrls);

  const runBtn = el(`<button class="btn go">▶ live the hour</button>`);
  const newBtn = el(`<button class="btn">new incident</button>`);
  const dash = el(`<pre class="code" style="display:none;line-height:1.9"></pre>`);
  const alertBox = el(`<div class="tape" style="flex-direction:column;align-items:stretch"></div>`);
  const guessRow = el(`<div class="row" style="display:none"></div>`);
  const result = el(`<div class="result" style="display:none"></div>`);

  function paintAlerts() {
    alertBox.innerHTML = "";
    if (!simState.run) return;
    for (const r of simAlertRows(simState.run, simState.mode)) {
      const chip = el(`<span class="step">${esc(r.text)}</span>`);
      chip.style.borderColor = r.fired ? "var(--race)" : "var(--line)";
      chip.style.color = r.fired ? "var(--race)" : "var(--faint)";
      alertBox.appendChild(chip);
    }
  }
  modeEl.onclick = () => {
    simState.mode = simState.mode === "symptom" ? "cause" : "symptom";
    modeEl.classList.toggle("on", simState.mode === "symptom");
    modeEl.querySelector("[data-modelabel]").textContent = simState.mode === "symptom"
      ? "symptom alerts (page on user pain)" : "cause alerts (page on resource state)";
    paintAlerts();
  };

  function paintGuesses() {
    guessRow.innerHTML = "";
    for (const f of SIM_FAULTS) {
      const b = el(`<button class="btn">${esc(f.label)}</button>`);
      b.onclick = () => {
        if (simState.guessed) return;
        simState.guessed = true;
        const right = f.id === simState.run.fault;
        const truth = SIM_FAULTS.find(x => x.id === simState.run.fault);
        result.style.display = "block";
        result.className = "result " + (right ? "exact" : "lost");
        result.textContent = (right ? "✓ culprit named: " : "✗ it was: ") + truth.label + " — " + truth.hint;
        guessRow.querySelectorAll(".btn").forEach(x => { if (x !== b) x.disabled = true; });
        b.style.borderColor = right ? "var(--ordered)" : "var(--race)";
      };
      guessRow.appendChild(b);
    }
  }

  runBtn.onclick = async () => {
    runBtn.disabled = true; newBtn.disabled = true;
    const old = runBtn.textContent; runBtn.textContent = "living…";
    result.style.display = "none"; guessRow.style.display = "none";
    simState.guessed = false;
    simState.run = simRun(simState.seed);
    dash.style.display = "block";
    for (let m = 0; m < 60; m += 3) {                 // step the hour in 3-minute beats
      dash.textContent = simDashText(simState.run.mins, m);
      await sleep(70);
    }
    dash.textContent = simDashText(simState.run.mins, 59);
    paintAlerts();
    guessRow.style.display = "flex";
    paintGuesses();
    runBtn.disabled = false; newBtn.disabled = false; runBtn.textContent = old;
  };
  newBtn.onclick = () => {
    simState.seed++; simState.run = null; simState.guessed = false;
    card.querySelector("[data-inum]").textContent = "#" + simState.seed;
    dash.style.display = "none"; alertBox.innerHTML = "";
    guessRow.style.display = "none"; result.style.display = "none";
  };

  const btnRow = el(`<div class="row"></div>`);
  btnRow.append(runBtn, newBtn);
  card.appendChild(btnRow);
  card.appendChild(dash);
  card.appendChild(alertBox);
  card.appendChild(guessRow);
  card.appendChild(result);
  main.appendChild(card);

  main.appendChild(el(`<div class="card">
    <div class="why">// the five signatures — say them before you tap</div>
    <pre class="code"><span class="cm">// db latency:</span>   p99 ↑↑, p50 flat (hits fast), db p99 ↑↑, all hosts
<span class="cm">// cache drop:</span>   hit ↓↓, p50 ↑ (misses pay db), db load+p99 ↑ — often no page
<span class="cm">// one bad host:</span> p50 flat, fleet p99 ↑, err mid, host spread ↑↑
<span class="cm">// retry storm:</span>  <span class="kw">traffic ↑ during an incident</span> — the loop feeds itself
<span class="cm">// bad deploy:</span>   err steps AT the deploy marker · resources bored ·
<span class="cm">//</span>                <span class="ok">no cause alert will ever name it — symptoms page, causes explain</span></pre>
    <p class="sub" style="margin-bottom:0">Correlated failures have shapes. One host vs one dependency vs one deploy each bend a different subset of panels — and the whole triage loop (lessons 25–27) is learning to read the bend before you form a theory.</p>
  </div>`));
}
