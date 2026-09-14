/* MenuIndex — preprocess once, answer in O(1), and own the invalidation.

   INVARIANT: one DFS at construction resolves every item's effective price
   and path into a Map keyed by id; every later lookup is a Map hit, not a
   traversal. k lookups cost O(n + k) instead of O(k*n) — and the price of
   that is staleness, so the index exposes rebuild() and anything that edits
   the menu must call it.
   `walks` counts how many times the menu has been traversed: it must be 1
   after construction and must NOT grow with lookups. That counter is the
   whole point of the exercise.
   EDGE: an unknown id returns null from price() and undefined-free from
   get(); a declared price of 0 is real; duplicate ids keep the FIRST in DFS
   order (menu order wins, same as the search). */
"use strict";

export class MenuIndex {
  constructor(menu) {
    throw new Error("implement me");
  }

  /* -> { id, name, price, path } or null */
  get(itemId) {
    throw new Error("implement me");
  }

  /* -> the effective price, or null */
  price(itemId) {
    throw new Error("implement me");
  }

  /* re-traverse the (possibly edited) menu — the cost of caching */
  rebuild() {
    throw new Error("implement me");
  }
}
