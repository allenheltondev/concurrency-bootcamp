/* Flatten the menu — reference solution. */
"use strict";

export function flattenMenu(node, inherited = null, trail = [], out = []) {
  const effective = node.price ?? inherited;
  const here = trail.concat(node.name);
  for (const item of node.items || []) {
    out.push({
      id: item.id,
      name: item.name,
      price: item.price ?? effective,
      path: here.concat(item.name),
    });
  }
  for (const group of node.groups || [])
    flattenMenu(group, effective, here, out);      // no early return: collect all
  return out;
}

export function cheapestItem(menu) {
  let best = null;
  for (const row of flattenMenu(menu))
    if (best === null || row.price < best.price) best = row;   // strict <: ties keep the first
  return best;
}
