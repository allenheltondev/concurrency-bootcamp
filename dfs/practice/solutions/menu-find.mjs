/* Menu lookup — reference solution. */
"use strict";

export function findMenuItem(node, itemId) {
  for (const item of node.items || []) {          // leaves first — cheapest
    if (item.id === itemId) return item;
  }
  for (const group of node.groups || []) {
    const found = findMenuItem(group, itemId);
    if (found) return found;                      // short-circuit
  }
  return null;
}

export function findItemPath(node, itemId, trail = []) {
  const here = trail.concat(node.name);           // fresh array: nothing to undo
  for (const item of node.items || []) {
    if (item.id === itemId) return here.concat(item.name);
  }
  for (const group of node.groups || []) {
    const found = findItemPath(group, itemId, here);
    if (found) return found;
  }
  return null;
}
