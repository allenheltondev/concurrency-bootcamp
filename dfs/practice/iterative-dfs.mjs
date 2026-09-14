/* Recursion to an explicit stack — the conversion, done by hand.

   INVARIANT: the output must be byte-identical to the recursive version,
   including order. `pop()` returns the most recently pushed item, so the
   child you want to visit FIRST must be pushed LAST — push children in
   reverse index order. preorderIterative returns names in preorder;
   priceIterative is getItemPrice with no recursion, which means the
   inherited price must be pushed alongside each node (the call stack was
   storing it for you).
   EDGE: no call-stack limit — a chain 50,000 deep must work; a declared
   price of 0 is still a real price; items/groups keys may be absent. */
"use strict";

/* n-ary tree -> ["root", "A", "A1", "A2", "B", "B1"] */
export function preorderIterative(root) {
  throw new Error("implement me");
}

/* the effective price of one item, iteratively — or null */
export function priceIterative(menu, itemId) {
  throw new Error("implement me");
}
