/* Flatten the menu — one pass carrying two inherited values.

   INVARIANT: flattenMenu returns one row per item, in DFS (menu) order:
     { id, name, price, path }
   where `price` is the item's own price if it declared one and otherwise the
   closest ancestor's, and `path` is the names from the root down to and
   including the item. One traversal: calling a per-item search from inside
   the walk re-derives state the frame is already holding and is O(n^2).
   cheapestItem returns the row with the lowest effective price (ties: the
   first in DFS order), or null for a menu with no items.
   EDGE: a declared price of 0 is real; items/groups keys may be absent; a
   branch that fails must not leak its name into a later row's path. */
"use strict";

/* -> [{ id, name, price, path }], in DFS order */
export function flattenMenu(node, inherited = null, trail = [], out = []) {
  throw new Error("implement me");
}

/* -> the lowest-priced row, or null */
export function cheapestItem(menu) {
  throw new Error("implement me");
}
