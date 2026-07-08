#!/usr/bin/env node
/* Content validator for the Concurrency Bootcamp.

   Loads js/core.js + js/content.js + every js/packs/*.js into one shared VM
   context (same semantics as classic <script> tags sharing a page), then:

     - WRITE:   runs each exercise's reference assembly (pre + lines + post)
                against its own test source with the sandbox harness
                (log/assert/sleep/deferred) — the reference MUST pass.
     - DRILLS:  runs each drill's demo() — the reference implementation MUST
                pass its invariant check; verifies options/whys are parallel
                and the answer index is valid (authored correct-first).
     - BUGHUNT: verifies bug line indices are in range and fields exist.
     - QUIZ:    verifies options/whys parity and answer index.
     - LESSONS / MODULES / cross-links: shape checks, dangling references.

   Usage: node tools/validate-content.mjs
   Exits non-zero with a report if anything fails. Run it before committing
   any content change or new pack. */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  queueMicrotask, performance,
  AbortController, AbortSignal, Event, EventTarget, structuredClone,
});

function load(rel) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  new vm.Script(src, { filename: rel }).runInContext(ctx);
}

load("js/core.js");
load("js/content.js");
// --only js/packs/foo.js  → validate a single pack in isolation (authoring aid,
// so a work-in-progress sibling pack can't fail your run). Default: all packs.
const onlyArg = process.argv.indexOf("--only");
const packsDir = path.join(root, "js/packs");
let packs;
if (onlyArg !== -1) {
  packs = [path.relative(path.join(root, "js/packs"), path.resolve(process.argv[onlyArg + 1]))];
  for (const p of packs) load("js/packs/" + p);
} else {
  packs = fs.existsSync(packsDir)
    ? fs.readdirSync(packsDir).filter((f) => f.endsWith(".js")).sort()
    : [];
  for (const p of packs) load("js/packs/" + p);
}

const errors = [];
const err = (m) => errors.push(m);
const g = (name) => vm.runInContext(name, ctx);

const LESSONS = g("LESSONS"), QUIZ = g("QUIZ"), DRILLS = g("DRILLS"),
  BUGHUNT = g("BUGHUNT"), WRITE = g("WRITE"), MODULES = g("MODULES"),
  CARDS = g("CARDS"), DRILL_LESSON = g("DRILL_LESSON"),
  LESSON_PRACTICE = g("LESSON_PRACTICE");

/* ---------- structural checks ---------- */
const KNOWN_TYPES = ["learn", "lesson", "drills", "sim", "cards", "bugs", "write", "sheet", "test"];
const ids = new Set();
for (const m of MODULES) {
  if (!m.id || !m.label || !KNOWN_TYPES.includes(m.type)) err(`MODULES: bad entry ${JSON.stringify(m)}`);
  if (ids.has(m.id)) err(`MODULES: duplicate id ${m.id}`);
  ids.add(m.id);
  if (m.type === "sheet" && typeof m.html !== "string") err(`MODULES: sheet ${m.id} missing html`);
  if (m.type === "drills" && !Array.isArray(DRILLS[m.id])) err(`MODULES: drills module ${m.id} has no DRILLS.${m.id} array`);
}

for (const [i, l] of LESSONS.entries()) {
  if (typeof l.eb !== "string" || typeof l.title !== "string" || typeof l.html !== "string" || !l.html.trim())
    err(`LESSONS[${i}]: missing eb/title/html`);
}

const solvedIds = new Set();
const checkChoice = (where, b) => {
  if (!Array.isArray(b.options) || b.options.length < 2) err(`${where}: needs >=2 options`);
  if (!Array.isArray(b.whys) || b.whys.length !== b.options.length) err(`${where}: whys must parallel options`);
  if (!Number.isInteger(b.answer) || b.answer < 0 || b.answer >= b.options.length) err(`${where}: bad answer index`);
};

for (const [qi, q] of QUIZ.entries()) checkChoice(`QUIZ[${qi}]`, q);

for (const mod of Object.keys(DRILLS)) {
  for (const d of DRILLS[mod]) {
    const where = `DRILLS.${mod}.${d.id}`;
    if (!d.id || !d.title || typeof d.pre !== "string" || typeof d.post !== "string") err(`${where}: missing id/title/pre/post`);
    if (solvedIds.has(d.id)) err(`${where}: duplicate solved id ${d.id}`);
    solvedIds.add(d.id);
    if (typeof d.demo !== "function") err(`${where}: demo must be a function`);
    checkChoice(where + ".blank", d.blank);
    if (d.id in DRILL_LESSON) {
      const li = DRILL_LESSON[d.id];
      if (!Number.isInteger(li) || li < 0 || li >= LESSONS.length) err(`${where}: DRILL_LESSON points at bad lesson ${li}`);
    }
  }
}

for (const b of BUGHUNT) {
  const where = `BUGHUNT.${b.id}`;
  if (!b.id || !b.title || !b.scenario || !b.explain) err(`${where}: missing fields`);
  if (solvedIds.has(b.id)) err(`${where}: duplicate solved id ${b.id}`);
  solvedIds.add(b.id);
  if (!Array.isArray(b.lines) || !b.lines.length) err(`${where}: lines required`);
  if (!Array.isArray(b.bug) || !b.bug.length || b.bug.some((i) => !Number.isInteger(i) || i < 0 || i >= b.lines.length))
    err(`${where}: bug indices out of range`);
  if (b.lesson != null && (b.lesson < 0 || b.lesson >= LESSONS.length)) err(`${where}: bad lesson index ${b.lesson}`);
}

for (const [li, p] of Object.entries(LESSON_PRACTICE)) {
  if (li < 0 || li >= LESSONS.length) err(`LESSON_PRACTICE[${li}]: bad lesson index`);
  if (!MODULES.some((m) => m.id === p.mod)) err(`LESSON_PRACTICE[${li}]: unknown module ${p.mod}`);
  if (p.drill && (!DRILLS[p.mod] || !DRILLS[p.mod].some((d) => d.id === p.drill)))
    err(`LESSON_PRACTICE[${li}]: unknown drill ${p.mod}/${p.drill}`);
}

for (const [i, c] of CARDS.entries()) {
  if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== "string" || typeof c[1] !== "string")
    err(`CARDS[${i}]: must be [front, back] strings`);
}

/* ---------- behavioral checks: run the code ---------- */
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms))])
    .catch((e) => { throw new Error(`${label}: ${e.message}`); });

// same harness surface the in-app worker sandbox provides
const HARNESS = `
  const __lines=[];
  const log=(t)=>__lines.push(String(t));
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
  const assert=(c,m)=>{ if(!c) throw new Error(m); };
`;

async function runWriteExercise(w) {
  const src = [w.pre, ...w.lines, w.post].join("\n");
  const prog = `(async()=>{ "use strict"; ${HARNESS}\n${src}\n${w.test}\n})()`;
  const p = new vm.Script(prog, { filename: `WRITE:${w.id}` }).runInContext(ctx);
  await withTimeout(p, 5000, `WRITE.${w.id}`);
}

const writeIds = new Set();
for (const w of WRITE) {
  const where = `WRITE.${w.id}`;
  for (const k of ["id", "title", "why", "spec", "pre", "post", "test", "pass", "takeaway", "hint"])
    if (typeof w[k] !== "string" || !w[k]) err(`${where}: missing string field "${k}"`);
  if (!Array.isArray(w.lines) || w.lines.length < 3) err(`${where}: lines must be the reference body (>=3 lines)`);
  if (!Array.isArray(w.distractors) || !w.distractors.length || w.distractors.some((d) => !d.code || !d.why))
    err(`${where}: distractors need {code, why}`);
  if (writeIds.has(w.id) || solvedIds.has(w.id)) err(`${where}: duplicate solved id ${w.id}`);
  writeIds.add(w.id);
  if (w.lesson != null && (w.lesson < 0 || w.lesson >= LESSONS.length)) err(`${where}: bad lesson index ${w.lesson}`);
}

let ran = 0;
for (const w of WRITE) {
  try { await runWriteExercise(w); ran++; }
  catch (e) { err(`WRITE.${w.id}: reference solution FAILED its own tests — ${e.message}`); }
}

let demos = 0;
for (const mod of Object.keys(DRILLS)) {
  for (const d of DRILLS[mod]) {
    if (typeof d.demo !== "function") continue;
    try {
      const r = await withTimeout(Promise.resolve().then(() => d.demo()), 5000, `demo ${d.id}`);
      if (!r || r.pass !== true) err(`DRILLS.${mod}.${d.id}: demo() did not pass (${r && r.verdict})`);
      demos++;
    } catch (e) { err(`DRILLS.${mod}.${d.id}: demo() threw — ${e.message}`); }
  }
}

console.log(`packs loaded: ${packs.length ? packs.join(", ") : "(none)"}`);
console.log(`checked: ${LESSONS.length} lessons, ${QUIZ.length} quiz, ${Object.values(DRILLS).flat().length} drills (${demos} demos ran), ${BUGHUNT.length} bugs, ${WRITE.length} write exercises (${ran} executed), ${CARDS.length} cards, ${MODULES.length} modules`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("\n✓ all content valid — every reference implementation passed its own tests");
process.exit(0);
