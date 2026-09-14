/* MenuIndex — reference solution. */
"use strict";

function flatten(node, inherited = null, trail = [], out = []) {
  const effective = node.price ?? inherited;
  const here = trail.concat(node.name);
  for (const item of node.items || []) {
    out.push({ id: item.id, name: item.name,
               price: item.price ?? effective,
               path: here.concat(item.name) });
  }
  for (const group of node.groups || []) flatten(group, effective, here, out);
  return out;
}

export class MenuIndex {
  constructor(menu) {
    this.menu = menu;
    this.walks = 0;
    this.rebuild();                                  // one traversal, at construction
  }

  rebuild() {
    this.walks++;
    this.byId = new Map();
    for (const row of flatten(this.menu))
      if (!this.byId.has(row.id)) this.byId.set(row.id, row);   // first in DFS order wins
  }

  get(itemId) { return this.byId.get(itemId) ?? null; }         // O(1), no traversal

  price(itemId) { const row = this.get(itemId); return row ? row.price : null; }
}
