/* Consistent hashing — a ring of virtual node points; keys walk clockwise.

   fnv1a(s): the 32-bit FNV-1a hash — h = 2166136261; per char: h ^= charCode;
   h = Math.imul(h, 16777619); return h >>> 0 (unsigned).
   HashRing: each node contributes `vnodes` points hashed from "node#i"; the
   ring stays sorted by hash. owner(key) hashes the key and returns the node
   at the FIRST point clockwise (point hash >= key hash), wrapping to the
   ring's lowest point past the top.

   INVARIANT: ownership is a pure function of the point set — the same key
   maps to the same node until a node is added or removed.
   INVARIANT: removing a node reassigns ONLY the keys it owned; every other
   key keeps its owner. Adding it back restores the original mapping exactly —
   its points hash to exactly the same places.
   EDGE: a key hashing past the highest point wraps to the ring's first point.
*/
export function fnv1a(s) {
  throw new Error("implement me");
}

export class HashRing {
  #ring = [];                           // sorted [{h, node}]

  constructor(nodes = [], vnodes = 8) {
    this.vnodes = vnodes;
    nodes.forEach((n) => this.add(n));
  }

  add(node) {
    throw new Error("implement me");
  }

  remove(node) {
    throw new Error("implement me");
  }

  owner(key) {
    throw new Error("implement me");
  }
}
