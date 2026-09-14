/* Graph DFS — reference solution. */
"use strict";

export function reachable(graph, startId, visited = new Set(), out = []) {
  if (visited.has(startId)) return out;             // cycle AND duplicate work
  visited.add(startId);                             // mark on ENTRY, never unmark
  out.push(graph[startId].name);
  for (const next of graph[startId].children) reachable(graph, next, visited, out);
  return out;
}

export function hasCycle(graph, startId) {
  const done = new Set();                           // fully explored
  const onPath = new Set();                         // the current root-to-here path
  const walk = (id) => {
    if (onPath.has(id)) return true;                // reached a node still on the path
    if (done.has(id)) return false;                 // already cleared this subtree
    onPath.add(id);
    for (const next of graph[id].children) if (walk(next)) return true;
    onPath.delete(id);                              // THIS set is unmarked on the way out
    done.add(id);
    return false;
  };
  return walk(startId);
}
