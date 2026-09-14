import { suite } from "./_harness.mjs";
import { reachable, hasCycle } from "./graph-dfs.mjs";

const cyclic = {
  lunch:    { name: "Lunch",    children: ["apps", "entrees"] },
  apps:     { name: "Apps",     children: ["combos"] },
  entrees:  { name: "Entrees",  children: ["combos", "specials"] },
  combos:   { name: "Combos",   children: [] },
  specials: { name: "Specials", children: ["lunch"] },      // back edge
  orphan:   { name: "Orphan",   children: [] },
};

// a diamond: two paths to one node, no cycle anywhere
const dag = {
  a: { name: "A", children: ["b", "c"] },
  b: { name: "B", children: ["d"] },
  c: { name: "C", children: ["d"] },
  d: { name: "D", children: [] },
};

suite("graph DFS — one visit per node, and a cycle that isn't a diamond", ({ log, assert }) => {
  const out = reachable(cyclic, "lunch");
  log("walk: " + out.join(" -> "));
  assert(out.join(",") === "Lunch,Apps,Combos,Entrees,Specials",
    "DFS order, each node once, got " + out.join(","));
  assert(out.filter(n => n === "Combos").length === 1, "Combos has two parents and must appear once");
  assert(!out.includes("Orphan"), "an unreachable node must not be walked");

  const fromEntrees = reachable(cyclic, "entrees");
  assert(fromEntrees.join(",") === "Entrees,Combos,Specials,Lunch,Apps",
    "starting elsewhere follows the back edge into the rest, got " + fromEntrees.join(","));
  assert(reachable({ x: { name: "X", children: [] } }, "x").join(",") === "X", "a node with no edges is its own walk");
  assert(reachable(dag, "a").join(",") === "A,B,D,C", "the diamond's shared node is entered once, got " + reachable(dag, "a").join(","));
  log("diamond: " + reachable(dag, "a").join(" -> ") + "  (D reached twice, entered once)");

  assert(hasCycle(cyclic, "lunch") === true, "specials -> lunch is a cycle");
  assert(hasCycle(dag, "a") === false,
    "a diamond is NOT a cycle — if this says true, the on-path set is never being unmarked");
  assert(hasCycle({ s: { name: "S", children: ["s"] } }, "s") === true, "a self-loop is a cycle");
  assert(hasCycle(cyclic, "apps") === false, "no cycle is reachable from apps");
  log("cycle detection agreed on all four graphs");
  return "one set marked on entry and never cleared; a different set that IS cleared — two questions, two sets";
});
