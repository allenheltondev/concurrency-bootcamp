/* Menu lookup — find an item anywhere in a nested restaurant menu, and
   report where it lives.

   INVARIANT: a menu node is { name, items: [{ id, name }], groups: [node] }
   nested arbitrarily deep. findMenuItem returns the item object with that id
   from anywhere in the menu, or null — items at a level are checked before
   descending into that level's groups, and the search stops at the first
   match. findItemPath returns the names from the root down to and including
   the ITEM ("Lunch" ... "Cobb Salad"), or null.
   EDGE: real menu JSON omits empty arrays, so `items` or `groups` may be
   absent on any node; a branch that fails must leave nothing behind in a
   later branch's path (the classic missing-pop bug). */
"use strict";

/* -> the item object, or null */
export function findMenuItem(node, itemId) {
  throw new Error("implement me");
}

/* -> ["Lunch", "Entrees", "Salads", "Cobb Salad"], or null */
export function findItemPath(node, itemId) {
  throw new Error("implement me");
}
