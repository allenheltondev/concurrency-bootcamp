/* Inherited prices — reference solution. */
"use strict";

export function getItemPrice(node, itemId, inherited = null) {
  const effective = node.price ?? inherited;        // ?? — 0 is a real price
  for (const item of node.items || []) {
    if (item.id === itemId) return item.price ?? effective;
  }
  for (const group of node.groups || []) {
    const found = getItemPrice(group, itemId, effective);   // carry it DOWN
    if (found !== null) return found;               // !== null, not truthiness
  }
  return null;
}

export function priceEveryItem(node, inherited = null, out = new Map()) {
  const effective = node.price ?? inherited;
  for (const item of node.items || []) out.set(item.id, item.price ?? effective);
  for (const group of node.groups || []) priceEveryItem(group, effective, out);
  return out;                                       // accumulator, no early exit
}
