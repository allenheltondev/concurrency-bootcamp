"use strict";
/* Database Internals Bootcamp — course-owned module: the isolation-anomaly
   simulator. Two concurrent transactions run against a tiny bank ledger.
   You pick the scenario (lost update / write skew / inconsistent read) and
   the isolation level (read committed / repeatable read / serializable),
   then STEP through the interleaving one event at a time — watching each
   transaction's reads, the committed state, and finally whether the money
   invariant survived. Aborted transactions retry the way production code
   should: from the top, reads included.

   The events are not scripted — every run executes the same ledger model the
   primitives drills use (makeLedger/ledgerBegin/ledgerRead/ledgerWrite/
   ledgerCommit in core.js): per-statement reads at read committed, snapshot
   reads + first-updater-wins at repeatable read, and a simplified SSI
   rw-antidependency check at serializable.

   The generic engine (../js/app.js) knows nothing about it: the MODULES entry
   in js/content.js points here with { type:"sim", renderFn:"renderIsoSimModule" }
   and the engine dispatches through globalThis. Loaded after content.js,
   before the engine — the engine helpers (el, main, esc, conceptLinkRow) are
   shared globals that exist by the time this renders. */

let isosim = { scenario:"lostupdate", level:"repeatable read" };

const ISO_LEVELS = ["read committed", "repeatable read", "serializable"];

/* each scenario: setup, invariant text+check, and play(level) -> events[]
   events: { tx: 0|1|2 (2 = system), t, kind: read|write|commit|abort|bad|good|info,
             state: snapshot of committed accounts after this event } */
const ISO_SCENARIOS = {
  lostupdate: {
    label: "lost update",
    title: "Two refunds, one balance",
    desc: `Merchant balance <b style="color:var(--text)">100</b>. T1 refunds 60, T2 refunds 30 — each reads the balance, computes the new value <i>in the app</i>, and writes it back. The invariant: both debits land, final balance <b style="color:var(--text)">10</b>.`,
    invariant: "balance === 100 - 60 - 30 = 10",
    accounts: { balance: 100 },
    check: (db) => db.rows.get("balance").value === 10,
    play(level) {
      const ev = [];
      const db = makeLedger({ balance: 100 });
      const snap = () => ({ balance: db.rows.get("balance").value });
      const push = (tx, t, kind) => ev.push({ tx, t, kind, state: snap() });

      const t1 = ledgerBegin(db, level);
      push(0, "T1 BEGIN (" + level + ")", "info");
      const r1 = ledgerRead(db, t1, "balance");
      push(0, "T1 reads balance = " + r1, "read");

      const t2 = ledgerBegin(db, level);
      push(1, "T2 BEGIN (" + level + ")", "info");
      const r2 = ledgerRead(db, t2, "balance");
      push(1, "T2 reads balance = " + r2, "read");

      ledgerWrite(t1, "balance", r1 - 60);
      push(0, "T1 writes balance = " + (r1 - 60) + "  (app computed " + r1 + " - 60)", "write");
      const c1 = ledgerCommit(db, t1);
      push(0, "T1 COMMIT ✓ — balance now " + db.rows.get("balance").value, "commit");

      ledgerWrite(t2, "balance", r2 - 30);
      push(1, "T2 writes balance = " + (r2 - 30) + "  (app computed " + r2 + " - 30)", "write");
      const c2 = ledgerCommit(db, t2);
      if (c2.ok) {
        push(1, "T2 COMMIT ✓ — balance now " + db.rows.get("balance").value, "commit");
        if (db.rows.get("balance").value !== 10)
          push(2, "T1's -60 debit is GONE — overwritten by a value computed from a stale read. No error was raised.", "bad");
      } else {
        push(1, "T2 COMMIT ✗ 40001 — " + c2.reason, "abort");
        push(1, "T2 retries FROM THE TOP (reads included)", "info");
        const t2b = ledgerBegin(db, level);
        const rb = ledgerRead(db, t2b, "balance");
        push(1, "T2' reads balance = " + rb + " — the fresh value, T1's debit included", "read");
        ledgerWrite(t2b, "balance", rb - 30);
        push(1, "T2' writes balance = " + (rb - 30), "write");
        const cb = ledgerCommit(db, t2b);
        push(1, "T2' COMMIT " + (cb.ok ? "✓ — balance now " + db.rows.get("balance").value : "✗"), cb.ok ? "commit" : "abort");
      }
      return { ev, db };
    },
  },

  writeskew: {
    label: "write skew",
    title: "Two withdrawals, two accounts, one rule",
    desc: `checking <b style="color:var(--text)">60</b>, savings <b style="color:var(--text)">60</b>. The rule: one account may overdraw as long as <b style="color:var(--text)">checking + savings ≥ 0</b>. Each transaction reads BOTH balances, checks the sum covers its 100 withdrawal, then debits a <i>different</i> account.`,
    invariant: "checking + savings ≥ 0",
    accounts: { checking: 60, savings: 60 },
    check: (db) => db.rows.get("checking").value + db.rows.get("savings").value >= 0,
    play(level) {
      const ev = [];
      const db = makeLedger({ checking: 60, savings: 60 });
      const snap = () => ({ checking: db.rows.get("checking").value, savings: db.rows.get("savings").value });
      const push = (tx, t, kind) => ev.push({ tx, t, kind, state: snap() });
      const total = (db2) => db2.rows.get("checking").value + db2.rows.get("savings").value;

      const t1 = ledgerBegin(db, level);
      push(0, "T1 BEGIN (" + level + ")", "info");
      const t1c = ledgerRead(db, t1, "checking"), t1s = ledgerRead(db, t1, "savings");
      push(0, "T1 reads checking=" + t1c + ", savings=" + t1s + " → sum " + (t1c + t1s) + " ≥ 100 ✓", "read");

      const t2 = ledgerBegin(db, level);
      push(1, "T2 BEGIN (" + level + ")", "info");
      const t2c = ledgerRead(db, t2, "checking"), t2s = ledgerRead(db, t2, "savings");
      push(1, "T2 reads checking=" + t2c + ", savings=" + t2s + " → sum " + (t2c + t2s) + " ≥ 100 ✓", "read");

      ledgerWrite(t1, "checking", t1c - 100);
      push(0, "T1 debits CHECKING: " + t1c + " → " + (t1c - 100), "write");
      ledgerCommit(db, t1);
      push(0, "T1 COMMIT ✓", "commit");

      ledgerWrite(t2, "savings", t2s - 100);
      push(1, "T2 debits SAVINGS: " + t2s + " → " + (t2s - 100), "write");
      const c2 = ledgerCommit(db, t2);
      if (c2.ok) {
        push(1, "T2 COMMIT ✓ — different rows, so no update conflict fired", "commit");
        push(2, "combined balance = " + total(db) + " — the rule both transactions checked is broken, silently", "bad");
      } else {
        push(1, "T2 COMMIT ✗ 40001 — " + c2.reason, "abort");
        push(1, "T2 retries FROM THE TOP (reads included)", "info");
        const t2b = ledgerBegin(db, level);
        const rc = ledgerRead(db, t2b, "checking"), rs = ledgerRead(db, t2b, "savings");
        push(1, "T2' reads checking=" + rc + ", savings=" + rs + " → sum " + (rc + rs) + " < 100 ✗", "read");
        push(1, "T2' withdrawal REFUSED — the rule holds because the retry saw the truth", "good");
      }
      return { ev, db };
    },
  },

  unrepeatable: {
    label: "inconsistent read",
    title: "An audit races a transfer",
    desc: `checking <b style="color:var(--text)">100</b>, savings <b style="color:var(--text)">100</b>. T1 is an audit: read checking, then savings, and report the total (should be <b style="color:var(--text)">200</b>). Between its two reads, T2 commits a 50 transfer from checking to savings.`,
    invariant: "audit total === 200",
    accounts: { checking: 100, savings: 100 },
    check: (db, extra) => extra && extra.auditTotal === 200,
    play(level) {
      const ev = [];
      const db = makeLedger({ checking: 100, savings: 100 });
      const snap = () => ({ checking: db.rows.get("checking").value, savings: db.rows.get("savings").value });
      const push = (tx, t, kind) => ev.push({ tx, t, kind, state: snap() });

      const t1 = ledgerBegin(db, level);
      push(0, "T1 (audit) BEGIN (" + level + ")", "info");
      const a1 = ledgerRead(db, t1, "checking");
      push(0, "T1 reads checking = " + a1, "read");

      const t2 = ledgerBegin(db, level);
      push(1, "T2 BEGIN — transfer 50 checking → savings", "info");
      const c = ledgerRead(db, t2, "checking"), s = ledgerRead(db, t2, "savings");
      ledgerWrite(t2, "checking", c - 50);
      ledgerWrite(t2, "savings", s + 50);
      push(1, "T2 writes checking=" + (c - 50) + ", savings=" + (s + 50), "write");
      ledgerCommit(db, t2);
      push(1, "T2 COMMIT ✓ — the transfer is real now", "commit");

      const a2 = ledgerRead(db, t1, "savings");
      push(0, "T1 reads savings = " + a2 + (level === "read committed" ? "  (fresh statement snapshot — sees T2's commit)" : "  (same transaction snapshot — T2 invisible)"), "read");
      const totalRead = a1 + a2;
      push(0, "T1 reports total = " + a1 + " + " + a2 + " = " + totalRead, totalRead === 200 ? "good" : "bad");
      if (totalRead !== 200)
        push(2, "the audit saw checking BEFORE the transfer and savings AFTER it — a state that never existed. 50 phantom dollars.", "bad");
      const cm = ledgerCommit(db, t1);
      push(0, "T1 COMMIT " + (cm.ok ? "✓ (reads don't conflict)" : "✗"), cm.ok ? "commit" : "abort");
      return { ev, db, extra: { auditTotal: totalRead } };
    },
  },
};

function renderIsoSimModule(mod) {
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow || "module"}</div>
    <h1>The anomaly simulator</h1>
    <p class="lead">Two transactions overlap on a tiny bank ledger — the second axiom, live. Pick the interleaving and the isolation level, then <b style="color:var(--text)">step</b> through it: watch what each transaction reads, what commits, and whether the money invariant survives.</p>
    <p class="sub">Try each scenario at <b style="color:var(--text)">read committed</b> first (the default you're probably running), then climb the ladder. Lost update dies at repeatable read; write skew survives everything except <b style="color:var(--text)">serializable</b>; the aborts you'll see are the mechanism, not a malfunction — the retry re-runs from the top and lands on the truth.</p>
  </div>`));
  if (mod.conceptLesson != null) { const row = conceptLinkRow(mod.conceptLesson); if (row) { row.style.margin = "0 0 16px"; main.appendChild(row); } }

  const card = el(`<div class="card"><h2 data-title></h2><div class="why" data-inv></div><p class="sub" data-desc style="margin:0 0 4px"></p></div>`);

  /* controls: scenario chips + isolation chips */
  const ctrls = el(`<div class="ctrls" style="flex-direction:column;align-items:flex-start;gap:8px"></div>`);
  const scRow = el(`<div class="row" style="margin-top:0"></div>`);
  const lvRow = el(`<div class="row" style="margin-top:0"></div>`);
  ctrls.append(el(`<div class="ctrl">scenario</div>`), scRow, el(`<div class="ctrl">isolation level</div>`), lvRow);
  card.appendChild(ctrls);

  const stateRow = el(`<div class="dcols" style="margin:12px 0 4px"></div>`);
  card.appendChild(stateRow);

  const btnRow = el(`<div class="row"></div>`);
  const stepBtn = el(`<button class="btn go">step →</button>`);
  const runBtn = el(`<button class="btn">▶ run the rest</button>`);
  const resetBtn = el(`<button class="btn">↺ reset</button>`);
  btnRow.append(stepBtn, runBtn, resetBtn);
  card.appendChild(btnRow);

  const tape = el(`<div class="tape"></div>`);
  const result = el(`<div class="result" style="display:none"></div>`);
  card.append(tape, result);
  main.appendChild(card);

  /* run state */
  let run = null;   // { ev, db, extra }, pos
  let pos = 0;

  const txColor = (tx, kind) =>
    kind === "abort" || kind === "bad" ? "var(--race)"
    : kind === "commit" || kind === "good" ? "var(--ordered)"
    : tx === 0 ? "var(--accent)" : tx === 1 ? "#e0c25a" : "var(--faint)";

  function renderState(state) {
    stateRow.innerHTML = "";
    for (const [k, v] of Object.entries(state)) {
      stateRow.appendChild(el(`<div class="dcol" style="min-width:110px">
        <div class="dlabel">${esc(k)} · committed</div>
        <div class="memcell" style="min-width:76px;${v < 0 ? "border-color:var(--race);color:var(--race)" : ""}">${v}</div>
      </div>`));
    }
  }

  function reset() {
    const sc = ISO_SCENARIOS[isosim.scenario];
    card.querySelector("[data-title]").textContent = sc.title;
    card.querySelector("[data-inv]").textContent = "// invariant: " + sc.invariant;
    card.querySelector("[data-desc]").innerHTML = sc.desc;
    run = sc.play(isosim.level);
    pos = 0;
    tape.innerHTML = "";
    result.style.display = "none";
    renderState(Object.fromEntries([...run.db.rows.keys()].map(k => [k, sc.accounts[k]])));
    stepBtn.disabled = false; runBtn.disabled = false;
  }

  function showEvent(e) {
    const chip = el(`<span class="step">${esc(e.t)}</span>`);
    const color = txColor(e.tx, e.kind);
    chip.style.borderColor = color; chip.style.color = color;
    tape.appendChild(chip);
    renderState(e.state);
  }

  function finish() {
    const sc = ISO_SCENARIOS[isosim.scenario];
    const held = sc.check(run.db, run.extra);
    const aborted = run.ev.some(e => e.kind === "abort");
    result.style.display = "block";
    result.className = "result " + (held ? "exact" : "lost");
    result.textContent = held
      ? "invariant HELD (" + sc.invariant + ")" + (aborted ? " · one abort + a from-the-top retry — that's serializable doing its job" : " · no conflict at this level")
      : "invariant BROKEN (" + sc.invariant + ") · both transactions committed without a single error — this level permits the anomaly";
    stepBtn.disabled = true; runBtn.disabled = true;
  }

  function step() {
    if (!run || pos >= run.ev.length) return;
    showEvent(run.ev[pos++]);
    if (pos >= run.ev.length) finish();
  }

  stepBtn.onclick = step;
  runBtn.onclick = async () => {
    runBtn.disabled = true;
    while (run && pos < run.ev.length) { step(); await sleep(340); }
  };
  resetBtn.onclick = reset;

  function chipRow(row, values, get, set) {
    row.innerHTML = "";
    for (const v of values) {
      const b = el(`<button class="chip" role="tab" aria-selected="${get() === v}">${esc(v)}</button>`);
      b.onclick = () => { set(v); chipRow(row, values, get, set); reset(); };
      row.appendChild(b);
    }
  }
  chipRow(scRow, Object.keys(ISO_SCENARIOS).map(k => ISO_SCENARIOS[k].label), () => ISO_SCENARIOS[isosim.scenario].label,
    (label) => { isosim.scenario = Object.keys(ISO_SCENARIOS).find(k => ISO_SCENARIOS[k].label === label); });
  chipRow(lvRow, ISO_LEVELS, () => isosim.level, (v) => { isosim.level = v; });

  reset();

  main.appendChild(el(`<div class="card">
    <div class="why">// what each level is actually checking at COMMIT</div>
    <pre class="code"><span class="cm">// read committed — each statement reads fresh; no commit-time check.</span>
<span class="cm">//   lost update: permitted · write skew: permitted · torn read: permitted</span>

<span class="cm">// repeatable read (snapshot) — one snapshot per tx, plus:</span>
if (committedVersion(key) !== snapshotVersion(key))
  <span class="ok">abort("40001: concurrent update");</span>   <span class="cm">// first-updater-wins</span>
<span class="cm">//   kills lost update (via abort+retry) and torn reads.</span>
<span class="cm">//   write skew: the two txs wrote DIFFERENT keys — check never fires.</span>

<span class="cm">// serializable — snapshot + SSI: track read/write overlaps;</span>
if (iReadWhatTheyWrote &amp;&amp; theyReadWhatIWrote)
  <span class="ok">abort("40001: rw-antidependency cycle");</span>
<span class="cm">//   kills write skew. aborts are the interface — retry from the top.</span></pre>
    <p class="sub" style="margin-bottom:0">Two things to carry out of this module: <b style="color:var(--text)">"no error" does not mean "no anomaly"</b> — the broken runs above commit cleanly; and a retry must re-run the <b style="color:var(--text)">whole transaction, reads included</b> — every held invariant on the serializable path came from the retry seeing fresh data.</p>
  </div>`));
}
