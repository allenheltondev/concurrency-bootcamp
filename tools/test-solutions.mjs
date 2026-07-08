#!/usr/bin/env node
/* Practice-pack solution verifier for the Concurrency Bootcamp.

   Every practice/<name>.test.mjs imports "./<name>.mjs" — normally the
   learner's skeleton. This script stages the tests, the harness, and the
   REFERENCE solutions (practice/solutions/<name>.mjs renamed over the
   skeleton slot) into a temp directory and runs each suite there, so CI
   proves that:

     - every reference solution passes its own test suite
     - every test file has a matching solution (and vice versa)

   A test or solution edit that breaks the pair cannot merge.

   Usage: node tools/test-solutions.mjs
   Exits non-zero with a report if anything fails. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const practice = path.join(root, "practice");
const solutions = path.join(practice, "solutions");

const tests = fs.readdirSync(practice).filter((f) => f.endsWith(".test.mjs")).sort();
const sols = fs.readdirSync(solutions).filter((f) => f.endsWith(".mjs")).sort();

const errors = [];

// pairing checks: a test without a solution can't be verified; a solution
// without a test is dead weight that silently rots
for (const t of tests) {
  const name = t.replace(/\.test\.mjs$/, ".mjs");
  if (!sols.includes(name)) errors.push(`test ${t} has no reference solution practice/solutions/${name}`);
}
for (const s of sols) {
  const t = s.replace(/\.mjs$/, ".test.mjs");
  if (!tests.includes(t)) errors.push(`solution practice/solutions/${s} has no test practice/${t}`);
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "bootcamp-solutions-"));
fs.copyFileSync(path.join(practice, "_harness.mjs"), path.join(stage, "_harness.mjs"));

let ran = 0;
for (const t of tests) {
  const name = t.replace(/\.test\.mjs$/, ".mjs");
  const sol = path.join(solutions, name);
  if (!fs.existsSync(sol)) continue; // already reported above
  fs.copyFileSync(path.join(practice, t), path.join(stage, t));
  fs.copyFileSync(sol, path.join(stage, name));

  const r = spawnSync(process.execPath, [t], { cwd: stage, stdio: "inherit", timeout: 30_000 });
  if (r.status !== 0) errors.push(`${t} FAILED against the reference solution (exit ${r.status ?? "timeout"})`);
  ran++;
}

fs.rmSync(stage, { recursive: true, force: true });

console.log(`\nran ${ran} suites against ${sols.length} reference solutions`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("✓ every reference solution passes its own test suite");
