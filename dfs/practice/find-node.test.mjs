import { suite } from "./_harness.mjs";
import { findNode, findAllNodes, counter } from "./find-node.mjs";

const tree = () => ({ name: "root", children: [
  { name: "A", children: [ { name: "A1", children: [] }, { name: "dup", children: [] } ] },
  { name: "B", children: [ { name: "dup", children: [ { name: "B1", children: [] } ] } ] },
] });

suite("findNode — DFS order, short-circuit, and an honest null", ({ log, assert }) => {
  const t = tree();
  assert(findNode(t, "root") === t, "the root itself must match");
  assert(findNode(t, "A1") === t.children[0].children[0], "must return the node object, not a name or copy");
  assert(findNode(t, "B1").name === "B1", "must reach the last branch");
  assert(findNode(t, "nope") === null, "an absent name returns null, not undefined");
  assert(findNode(null, "x") === null, "a null root returns null instead of throwing");

  counter.visits = 0;
  findNode(t, "A1");
  log("target A1 (3rd in DFS order) -> " + counter.visits + " nodes entered");
  assert(counter.visits === 3, "must short-circuit: root, A, A1 = 3 nodes, got " + counter.visits);

  counter.visits = 0;
  findNode(t, "missing");
  assert(counter.visits === 7, "an absent target still walks all 7 nodes, got " + counter.visits);
  log("absent target -> " + counter.visits + " nodes (the O(n) worst case)");

  const first = findNode(t, "dup");
  assert(first === t.children[0].children[1], "duplicate names: the FIRST in DFS order wins");

  const all = findAllNodes(t, "dup");
  assert(all.length === 2, "findAllNodes must return both, got " + all.length);
  assert(all[0] === t.children[0].children[1] && all[1] === t.children[1].children[0],
    "and in DFS order — A's dup before B's dup");
  assert(findAllNodes(t, "nope").length === 0, "no matches is an empty array, never null");
  assert(findAllNodes(null, "x").length === 0, "a null root yields no matches");
  log("2 duplicates found, in menu order");
  return "the early return is the only difference between find-first and find-all";
});
