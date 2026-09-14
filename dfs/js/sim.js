"use strict";
/* DFS & Recursive Traversal Bootcamp — course-owned module: the walkthrough.
   An instrumented depth-first search you can watch one frame at a time: the
   call stack grows and shrinks, the visit tape fills left to right, and in
   menu mode every frame shows the price it inherited and the price it
   resolved — the state travelling down, made visible.

   Deterministic by construction: the events are produced by running the real
   reference traversal over the fixtures in core.js, so what you watch is
   what the code does. The generic engine (../js/app.js) knows nothing about
   this module: the MODULES entry in js/content.js points here with
   { type:"sim", renderFn:"renderDfsWalk" } and the engine dispatches through
   globalThis. Engine helpers (el, main, esc, conceptLinkRow) are shared
   globals by the time this renders. */

const WALK_TARGETS = {
  tree: ["A1", "A2", "B1", "root", "Z"],
  menu: ["wings", "burger", "garden", "cobb", "sushi"],
};
let walkState = { mode: "tree", target: "A1", playing: false };

/* ---- the events: one per thing the traversal actually does ---- */
function treeWalkEvents(target) {
  const events = [];
  (function rec(node, depth) {
    events.push({ k: "enter", name: node.name, depth });
    if (node.name === target) { events.push({ k: "hit", name: node.name, depth }); return true; }
    for (const child of node.children) {
      if (rec(child, depth + 1)) { events.push({ k: "unwind", name: node.name, depth }); return true; }
    }
    events.push({ k: "exit", name: node.name, depth });
    return false;
  })(TREE, 0);
  return { events, total: countNodes(TREE), unit: "nodes" };
}

function menuWalkEvents(target) {
  const events = [];
  (function rec(node, inherited, depth) {
    const effective = node.price ?? inherited;
    events.push({ k: "enter", name: node.name, depth, price: effective, own: node.price ?? null });
    for (const item of node.items || []) {
      const price = item.price ?? effective;
      if (item.id === target) { events.push({ k: "hit", name: item.name, depth: depth + 1, price }); return price; }
      events.push({ k: "check", name: item.name, depth: depth + 1, price });
    }
    for (const group of node.groups || []) {
      const found = rec(group, effective, depth + 1);
      if (found !== null) { events.push({ k: "unwind", name: node.name, depth, price: found }); return found; }
    }
    events.push({ k: "exit", name: node.name, depth });
    return null;
  })(PRICED_MENU, null, 0);
  let total = 0;
  (function count(node) { total += 1 + (node.items || []).length; (node.groups || []).forEach(count); })(PRICED_MENU);
  return { events, total, unit: "groups + items" };
}

const walkEvents = (mode, target) => mode === "tree" ? treeWalkEvents(target) : menuWalkEvents(target);

/* ---- one line of narration per event ---- */
function walkNarrate(e, mode) {
  const at = "  ".repeat(e.depth);
  if (e.k === "enter") {
    if (mode === "tree") return `${at}enter ${e.name}`;
    const own = e.own === null ? "declares nothing" : `declares $${e.own}`;
    return `${at}enter ${e.name} — ${own}, effective $${e.price ?? "—"}`;
  }
  if (e.k === "check") return `${at}· ${e.name} — not it (would be $${e.price})`;
  if (e.k === "hit") return `${at}✓ ${e.name} — MATCH${e.price != null ? ` → $${e.price}` : ""}`;
  if (e.k === "unwind") return `${at}↑ ${e.name} returns the match — siblings skipped`;
  return `${at}↑ ${e.name} exhausted — backtrack`;
}

function renderDfsWalk(mod) {
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow || "module"}</div>
    <h1>The walkthrough</h1>
    <p class="lead">The same recursion you've been reading, executed one frame at a time. Watch the <b style="color:var(--text)">call stack</b> grow as it descends and shrink as it backtracks, and the <b style="color:var(--text)">visit tape</b> fill in exactly the order the code produces.</p>
    <p class="sub">Switch to the priced menu and every frame shows two numbers: what it inherited, and what it resolved. That's the state travelling down &mdash; the thing the interview is actually about. Pick a target that isn't there to watch the full O(n) walk and the honest <code>null</code> at the end.</p>
  </div>`));
  if (mod.conceptLesson != null) { const row = conceptLinkRow(mod.conceptLesson); if (row) { row.style.margin = "0 0 16px"; main.appendChild(row); } }

  const card = el(`<div class="card">
    <h2 data-title></h2>
    <div class="why">// one event per thing the traversal does — enter, check, match, backtrack</div>
  </div>`);

  const ctrls = el(`<div class="ctrls"></div>`);
  const modeEl = el(`<div class="toggle ${walkState.mode === "menu" ? "on" : ""}"><div class="switch"></div> <span data-modelabel></span></div>`);
  ctrls.appendChild(modeEl);
  card.appendChild(ctrls);

  const targetRow = el(`<div class="tape" data-targets></div>`);
  card.appendChild(targetRow);

  const stageRow = el(`<div class="dcols" style="margin-top:12px"></div>`);
  const stackCol = el(`<div class="dcol"><div class="dlabel">call stack</div><div class="stackcol" data-stack></div></div>`);
  const tapeCol = el(`<div class="dcol"><div class="dlabel">visit tape &middot; DFS order</div><div class="tape" data-tape></div></div>`);
  stageRow.append(stackCol, tapeCol);
  card.appendChild(stageRow);

  const logBox = el(`<pre class="code" style="margin-top:12px;min-height:88px"></pre>`);
  card.appendChild(logBox);

  const btnRow = el(`<div class="row"></div>`);
  const playBtn = el(`<button class="btn go">▶ walk it</button>`);
  const stepBtn = el(`<button class="btn">step ›</button>`);
  const resetBtn = el(`<button class="btn">↺ reset</button>`);
  btnRow.append(playBtn, stepBtn, resetBtn);
  card.appendChild(btnRow);

  const result = el(`<div class="result" style="display:none"></div>`);
  card.appendChild(result);
  main.appendChild(card);

  /* ---- run state: rebuilt whenever mode or target changes ---- */
  let run = null, idx = 0, stack = [], tape = [], visits = 0;

  function reset() {
    run = walkEvents(walkState.mode, walkState.target);
    idx = 0; stack = []; tape = []; visits = 0;
    result.style.display = "none";
    logBox.textContent = walkState.mode === "tree"
      ? `findNode(tree, "${walkState.target}")\n// ${run.total} nodes in the tree — how many will it enter?`
      : `getItemPrice(menu, "${walkState.target}")\n// ${run.total} ${run.unit} — and every frame carries a price down`;
    card.querySelector("[data-title]").textContent = walkState.mode === "tree"
      ? `findNode(tree, "${walkState.target}")`
      : `getItemPrice(menu, "${walkState.target}")`;
    modeEl.querySelector("[data-modelabel]").textContent = walkState.mode === "menu"
      ? "priced menu — watch the inherited value" : "simple tree — watch the order";
    paint();
    paintTargets();
    stepBtn.disabled = false;
  }

  function paintTargets() {
    targetRow.innerHTML = "";
    for (const t of WALK_TARGETS[walkState.mode]) {
      const b = el(`<button class="btn" style="min-height:34px;font-size:12px">${esc(t)}</button>`);
      if (t === walkState.target) b.style.borderColor = "var(--accent)";
      b.onclick = () => { if (walkState.playing) return; walkState.target = t; reset(); };
      targetRow.appendChild(b);
    }
  }

  function paint() {
    const stackBox = card.querySelector("[data-stack]");
    stackBox.innerHTML = "";
    if (!stack.length) {
      const note = idx === 0 ? "(empty — nothing entered yet)" : "(empty — every frame has returned)";
      stackBox.appendChild(el(`<div class="frame" style="border-left-color:var(--line);color:var(--faint)">${note}</div>`));
    }
    for (const f of stack) {
      const label = walkState.mode === "menu" && f.price !== undefined
        ? `${esc(f.name)} <span style="color:#8b90ab">· $${f.price ?? "—"}</span>`
        : esc(f.name);
      stackBox.appendChild(el(`<div class="frame">${label}</div>`));
    }
    const tapeBox = card.querySelector("[data-tape]");
    tapeBox.innerHTML = "";
    if (!tape.length) tapeBox.appendChild(el(`<span class="step" style="color:var(--faint)">—</span>`));
    for (const t of tape) {
      const chip = el(`<span class="step">${esc(t.name)}</span>`);
      if (t.hit) { chip.style.borderColor = "var(--ordered)"; chip.style.color = "var(--ordered)"; }
      tapeBox.appendChild(chip);
    }
  }

  function step() {
    if (!run || idx >= run.events.length) return false;
    const e = run.events[idx++];
    if (e.k === "enter") { stack.push({ name: e.name, price: e.price }); tape.push({ name: e.name }); visits++; }
    else if (e.k === "check") { tape.push({ name: e.name }); visits++; }
    else if (e.k === "hit") {
      // tree mode matches the node it just entered (mark that chip); menu mode
      // matches an item inside the current group (a new chip). Either way the
      // frame that found it returns, so it leaves the stack.
      if (walkState.mode === "menu") { tape.push({ name: e.name, hit: true }); visits++; }
      else if (tape.length) tape[tape.length - 1].hit = true;
      stack.pop();
    }
    else if (e.k === "exit" || e.k === "unwind") { stack.pop(); }
    const line = walkNarrate(e, walkState.mode);
    const lines = logBox.textContent.split("\n").concat(line);
    logBox.textContent = lines.slice(-9).join("\n");
    paint();
    if (idx >= run.events.length) { finish(); return false; }
    return true;
  }

  function finish() {
    stepBtn.disabled = true;
    const last = run.events[run.events.length - 1];
    const hit = run.events.some(e => e.k === "hit");
    const hitEvent = run.events.find(e => e.k === "hit");
    result.style.display = "block";
    result.className = "result " + (hit ? "exact" : "lost");
    if (!hit) {
      result.textContent = `✗ not found — returned null after entering all ${run.total} ${run.unit}. `
        + `Proving absence is the O(n) worst case: you cannot skip a branch you haven't looked in.`;
    } else if (walkState.mode === "tree") {
      result.textContent = `✓ found ${walkState.target} after entering ${visits} of ${run.total} nodes. `
        + `The short-circuit unwound ${run.total - visits} node${run.total - visits === 1 ? "" : "s"} of work the moment it knew.`;
    } else {
      result.textContent = `✓ ${hitEvent.name} → $${hitEvent.price} after touching ${visits} of ${run.total} ${run.unit}. `
        + `That price came from the closest ancestor that declared one — carried down, never searched upward.`;
    }
    void last;
  }

  playBtn.onclick = async () => {
    if (walkState.playing) return;
    if (!run || idx >= run.events.length) reset();
    walkState.playing = true;
    playBtn.disabled = stepBtn.disabled = resetBtn.disabled = true;
    const label = playBtn.textContent; playBtn.textContent = "walking…";
    while (step()) await sleep(520);
    walkState.playing = false;
    playBtn.disabled = resetBtn.disabled = false;
    playBtn.textContent = label;
  };
  stepBtn.onclick = () => { if (!walkState.playing) step(); };
  resetBtn.onclick = () => { if (!walkState.playing) reset(); };
  modeEl.onclick = () => {
    if (walkState.playing) return;
    walkState.mode = walkState.mode === "tree" ? "menu" : "tree";
    walkState.target = WALK_TARGETS[walkState.mode][0];
    modeEl.classList.toggle("on", walkState.mode === "menu");
    reset();
  };

  reset();

  main.appendChild(el(`<div class="card">
    <div class="why">// what to notice, in order</div>
    <pre class="code"><span class="cm">// 1.</span> the stack only ever holds ONE root-to-leaf path —
<span class="cm">//    </span>that's the whole O(h) space bound, on screen
<span class="cm">// 2.</span> "backtrack" is not an instruction: it's a frame
<span class="cm">//    </span>returning, and the loop below it resuming
<span class="cm">// 3.</span> a match makes every frame above return immediately —
<span class="cm">//    </span><span class="kw">the short-circuit, unwinding</span>
<span class="cm">// 4.</span> pick a target that isn't there: every node entered,
<span class="cm">//    </span>then an honest null — the O(n) worst case
<span class="cm">// 5.</span> in menu mode, read each frame's two numbers —
<span class="cm">//    </span><span class="ok">inherited in, effective out. that's the interview.</span></pre>
    <p class="sub" style="margin-bottom:0">Try <code>burger</code> in menu mode: Entrees declares nothing, so the $12 it inherited from Lunch passes straight through. Then try <code>garden</code>: Salads declares $8 and everything below it changes.</p>
  </div>`));
}
