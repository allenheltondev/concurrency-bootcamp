#!/usr/bin/env node
/* Validator for the account layer (js/account.js).

   Loads it in a bare VM context — no document, no localStorage — which
   itself proves the dormancy contract: the script must define itself without
   touching the DOM or storage until boot() runs in a real browser. Then
   exercises the pure sync-merge rules the multi-device story depends on.

   Usage: node tools/validate-account.mjs (runs in CI). */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({ console, setTimeout, clearTimeout, URLSearchParams, TextEncoder });

new vm.Script(fs.readFileSync(path.join(root, "js/account.js"), "utf8"), { filename: "js/account.js" })
  .runInContext(ctx);

const acct = vm.runInContext("CloudAccount", ctx);
const errors = [];
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  " + extra}`);
  if (!cond) errors.push(name);
};

check("loads without DOM/storage (dormancy contract)", !!acct && typeof acct.mergeDetail === "function");

/* ---- merge rules ---- */
const mine = {
  solved: { a: 1, b: 1 },
  position: { module: "learn", learnIdx: 3 },
  misses: [{ key: "m1", v: "local" }, { key: "m3" }]
};
const theirs = {
  solved: { b: 1, c: 1 },
  position: { module: "write", writeIdx: 5 },
  misses: [{ key: "m1", v: "cloud" }, { key: "m2" }]
};
const merged = acct.mergeDetail(mine, theirs);

check("solved is a union", ["a", "b", "c"].every((k) => merged.solved[k]));
check("position prefers this device", merged.position.module === "learn" && merged.position.learnIdx === 3);
check("empty local position adopts the cloud's", acct.mergeDetail({ ...mine, position: {} }, theirs).position.module === "write");
check("misses union by key", merged.misses.length === 3, JSON.stringify(merged.misses));
check("duplicate miss keys: local wins", merged.misses.find((m) => m.key === "m1").v === "local");

const many = Array.from({ length: 60 }, (_, i) => ({ key: `k${i}` }));
const capped = acct.mergeDetail({ solved: {}, position: {}, misses: many }, { misses: many.slice(0, 30) });
check("misses capped at 50, newest kept", capped.misses.length === 50 && capped.misses.at(-1).key === "k59");

check("missing fields tolerated", (() => {
  const m = acct.mergeDetail({ solved: {}, position: {}, misses: [] }, {});
  return m && typeof m.solved === "object" && Array.isArray(m.misses);
})());

/* ---- emptiness (guards against creating empty cloud docs) ---- */
check("empty detail detected", acct.isEmptyDetail({ solved: {}, position: {}, misses: [] }));
check("one solve is not empty", !acct.isEmptyDetail({ solved: { a: 1 }, position: {}, misses: [] }));

if (errors.length) { console.error(`\n${errors.length} FAILED`); process.exit(1); }
console.log("\naccount layer OK");
