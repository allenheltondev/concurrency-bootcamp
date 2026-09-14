/* Inherited prices — DFS that carries state down.

   INVARIANT: a price may be declared on the menu, on any group, or on an
   individual item. An item with no price of its own inherits the price of
   the CLOSEST ancestor that declared one. At each node: resolve the
   effective price for this level (own price if declared, else what was
   handed down), use it for this level's items, and recurse with it.
   getItemPrice returns the effective price of one item, or null if the item
   isn't on the menu. priceEveryItem returns a Map of id -> effective price
   for every item, in ONE traversal (a search per item is O(n^2)).
   EDGE: a declared price of 0 is a real price — "unset" is null/undefined
   only, so resolve with `??` and test results with `!== null`, never with
   truthiness. items/groups keys may be absent. */
"use strict";

/* -> the effective price, or null if there is no such item */
export function getItemPrice(node, itemId, inherited = null) {
  throw new Error("implement me");
}

/* -> Map(itemId -> effective price) for every item, in one pass */
export function priceEveryItem(node, inherited = null, out = new Map()) {
  throw new Error("implement me");
}
