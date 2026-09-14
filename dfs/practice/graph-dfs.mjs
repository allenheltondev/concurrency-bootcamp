/* When the tree becomes a graph — shared nodes and cycles.

   INVARIANT: the structure is an adjacency map,
     { id: { name, children: [ids] } }
   and an id may be reachable from two parents (a DAG) or point back upward
   (a cycle). reachable() returns each reachable node's NAME exactly once, in
   DFS order, starting from `startId` — check and mark visited on ENTRY, and
   never unmark: that single rule kills both the infinite recursion and the
   duplicate subtree work, and makes the walk O(V + E).
   hasCycle() is the other question, and it needs the OTHER set: a node is
   only on a cycle if you reach it while it is still on the CURRENT PATH, so
   that set is added to on the way down and removed from on the way back up
   — a diamond (two paths to one node) is not a cycle.
   EDGE: a self-loop is a cycle; an unreachable node is not walked; a node
   with no edges returns just itself. */
"use strict";

/* -> node names, DFS order, each exactly once */
export function reachable(graph, startId, visited = new Set(), out = []) {
  throw new Error("implement me");
}

/* -> true if any cycle is reachable from startId */
export function hasCycle(graph, startId) {
  throw new Error("implement me");
}
