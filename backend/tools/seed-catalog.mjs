#!/usr/bin/env node
/* Catalog seeder for the Concurrency Bootcamp backend.

   Reads backend/data/courses.json + badges.json, validates them, and emits
   DynamoDB BatchWriteItem request payloads (chunks of 25) as a JSON array on
   stdout. The deploy workflow feeds each chunk to
   `aws dynamodb batch-write-item` — no SDK dependency, no npm install.

   A course with "totalItems": "auto" gets its count computed by loading the
   app content the same way tools/validate-content.mjs does (core + content +
   packs in one VM context) and applying the exact TOTAL formula from
   js/app.js — the catalog can never drift from what the app actually counts.

   Usage: node backend/tools/seed-catalog.mjs <table-name>
   CI runs it with a dummy table name as a pure validation gate. */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tableName = process.argv[2];
if (!tableName) {
  console.error("usage: seed-catalog.mjs <table-name>");
  process.exit(1);
}

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const courses = readJson("backend/data/courses.json");
const badges = readJson("backend/data/badges.json");

/* ---- validation: a bad catalog entry must fail CI, not deploy quietly ---- */
const CRITERIA_TYPES = new Set([
  "total-solved", "streak", "courses-completed",
  "course-started", "percent-complete", "course-completed"
]);
const die = (msg) => { console.error(`seed-catalog: ${msg}`); process.exit(1); };
const idOk = (id) => typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);

const courseIds = new Set();
for (const c of courses) {
  if (!idOk(c.id)) die(`bad course id: ${JSON.stringify(c.id)}`);
  if (courseIds.has(c.id)) die(`duplicate course id: ${c.id}`);
  courseIds.add(c.id);
  if (!c.title || !c.description) die(`course ${c.id} needs title + description`);
  if (c.totalItems !== "auto" && !Number.isInteger(c.totalItems)) die(`course ${c.id}: totalItems must be an integer or "auto"`);
  if (c.totalItems === "auto") {
    const dir = path.join(root, c.contentRoot || ".");
    if (!fs.existsSync(path.join(dir, "js/content.js"))) die(`course ${c.id}: contentRoot ${c.contentRoot || "."} has no js/content.js`);
  }
}
const badgeIds = new Set();
for (const b of badges) {
  if (!idOk(b.id)) die(`bad badge id: ${JSON.stringify(b.id)}`);
  if (badgeIds.has(b.id)) die(`duplicate badge id: ${b.id}`);
  badgeIds.add(b.id);
  if (!b.name || !b.description || !b.icon) die(`badge ${b.id} needs name + description + icon`);
  if (!CRITERIA_TYPES.has(b.criteria?.type)) die(`badge ${b.id}: unknown criteria type ${JSON.stringify(b.criteria?.type)}`);
  if (b.criteria.courseId && !courseIds.has(b.criteria.courseId)) die(`badge ${b.id}: unknown courseId ${b.criteria.courseId}`);
}

/* ---- totalItems: "auto" — same loading strategy as tools/validate-content.mjs,
   same formula as js/app.js. Each course names its content directory with
   contentRoot (default "." = the repo-root course). ---- */
function computedTotal(contentRoot = ".") {
  const courseDir = path.join(root, contentRoot);
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask, performance,
    AbortController, AbortSignal, Event, EventTarget, structuredClone,
  });
  const load = (rel) => new vm.Script(fs.readFileSync(path.join(courseDir, rel), "utf8"), { filename: path.join(contentRoot, rel) }).runInContext(ctx);
  load("js/core.js");
  load("js/content.js");
  const packsDir = path.join(courseDir, "js/packs");
  const packs = fs.existsSync(packsDir)
    ? fs.readdirSync(packsDir).filter((f) => f.endsWith(".js")).sort()
    : [];
  for (const p of packs) load("js/packs/" + p);
  return vm.runInContext(
    "Object.values(DRILLS).reduce((n, l) => n + l.length, 0) + BUGHUNT.length + WRITE.length",
    ctx
  );
}

/* ---- minimal DynamoDB marshaller (only the shapes our catalogs use) ---- */
function marshal(v) {
  if (typeof v === "string") return { S: v };
  if (typeof v === "number") return { N: String(v) };
  if (typeof v === "boolean") return { BOOL: v };
  if (v === null) return { NULL: true };
  if (Array.isArray(v)) return { L: v.map(marshal) };
  if (typeof v === "object") {
    return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshal(x)])) };
  }
  die(`cannot marshal value of type ${typeof v}`);
}

const items = [
  ...courses.map(({ contentRoot, ...c }) => ({
    pk: "COURSES", sk: `COURSE#${c.id}`, type: "course",
    ...c,
    totalItems: c.totalItems === "auto" ? computedTotal(contentRoot) : c.totalItems
  })),
  ...badges.map((b) => ({ pk: "BADGES", sk: `BADGE#${b.id}`, type: "badge", ...b }))
];

const chunks = [];
for (let i = 0; i < items.length; i += 25) {
  chunks.push({
    [tableName]: items.slice(i, i + 25).map((item) => ({ PutRequest: { Item: marshal(item).M } }))
  });
}
console.log(JSON.stringify(chunks));
console.error(`seed-catalog: ${courses.length} courses + ${badges.length} badges -> ${chunks.length} batch(es)`);
