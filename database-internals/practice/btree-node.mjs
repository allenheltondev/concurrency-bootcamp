/* B-tree leaf node — sorted keys, insert in place, split when full.

   A node is a plain object: { keys: [...] }, keys sorted ascending.

   search(node, key)  -> the index of key in node.keys, or -1 if absent.
   insert(node, key, order) -> insert key keeping node.keys sorted.
     - duplicate key: return null, change nothing — one key, one slot.
     - if node.keys.length now EXCEEDS order, SPLIT:
         mid = Math.ceil(node.keys.length / 2)
         node keeps keys[0..mid); the new right sibling takes keys[mid..].
         return { sep, right } where right = { keys: [...] } and
         sep = right.keys[0] — the separator a parent would use to route:
         any lookup with k >= sep goes right and must find every moved key.
     - otherwise return null.

   INVARIANT: node.keys is sorted ascending at every return; after a split
   both halves are sorted, sep equals the right node's SMALLEST key, and no
   key is lost or duplicated across the two halves.
   EDGE: inserts at both extremes (new smallest, new largest); odd key counts
   (Math.ceil puts the extra key on the LEFT). */
"use strict";

export function search(node, key) {
  throw new Error("implement me");
}

export function insert(node, key, order) {
  throw new Error("implement me");
}
