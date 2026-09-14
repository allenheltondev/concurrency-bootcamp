/* findNode — reference solution. */
"use strict";

export const counter = { visits: 0 };

export function findNode(root, targetName) {
  if (!root) return null;                        // base case
  counter.visits++;
  if (root.name === targetName) return root;
  for (const child of root.children) {
    const found = findNode(child, targetName);
    if (found) return found;                     // short-circuit: unwind now
  }
  return null;
}

export function findAllNodes(root, targetName, out = []) {
  if (!root) return out;
  if (root.name === targetName) out.push(root);  // collect, never return early
  for (const child of root.children) findAllNodes(child, targetName, out);
  return out;
}
