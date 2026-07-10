import { suite } from "./_harness.mjs";
import { buildTrace, criticalPath } from "./span-tree.mjs";

suite("span tree — same tree from any order, and the last-finisher path", ({ log, assert }) => {
  const spans = [
    { id: "s4", parent: "s3", name: "stripe.post", start: 130, end: 400 },
    { id: "s2", parent: "s1", name: "cart.load", start: 40, end: 120 },
    { id: "s3", parent: "s1", name: "charge", start: 120, end: 410 },
    { id: "s1", parent: null, name: "GET /checkout", start: 0, end: 420 },
    { id: "s0", parent: "s1", name: "auth.check", start: 0, end: 40 },
  ];
  const root = buildTrace(spans);
  assert(root.name === "GET /checkout", "the root is the PARENTLESS span, got " + root.name);
  assert(root.children.length === 3, "root must have 3 children, got " + root.children.length);
  assert(root.children.map(c => c.name).join(",") === "auth.check,cart.load,charge",
    "children sort by start time, got " + root.children.map(c => c.name).join(","));
  assert(root.children[2].children[0].name === "stripe.post", "grandchildren nest under their parent");

  const flip = buildTrace([spans[3], spans[0], spans[2]]);
  assert(flip.name === "GET /checkout" && flip.children[0].name === "charge",
    "any arrival order must produce the same tree");
  const orphaned = buildTrace(spans.concat([{ id: "sX", parent: "GONE", name: "orphan", start: 1, end: 2 }]));
  assert(orphaned.name === "GET /checkout", "a dropped parent must not break assembly");

  const p = criticalPath(root);
  log("critical path: " + p.join(" -> "));
  assert(p.join(",") === "GET /checkout,charge,stripe.post",
    "must follow the last-finisher chain, got " + p.join(","));

  const tricky = buildTrace([
    { id: "r", parent: null, name: "root", start: 0, end: 230 },
    { id: "a", parent: "r", name: "long-early", start: 0, end: 200 },
    { id: "b", parent: "r", name: "short-late", start: 150, end: 210 },
  ]);
  const p2 = criticalPath(tricky);
  log("long-early (dur 200) vs short-late (ends 210): " + p2.join(" -> "));
  assert(p2.join(",") === "root,short-late",
    "the LAST FINISHER gates the parent, not the longest child — got " + p2.join(","));
  assert(criticalPath(buildTrace([{ id: "x", parent: null, name: "leaf", start: 0, end: 5 }])).join(",") === "leaf",
    "a childless root is its own path");
  return "parent ids are the structure, arrival order is noise — and the last-finisher chain is the first-order critical path";
});
