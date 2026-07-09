/* Consistent hashing — vnode points, first point clockwise. Reference solution. */
export function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;                        // unsigned 32-bit
}

export class HashRing {
  #ring = [];                            // sorted [{h, node}]

  constructor(nodes = [], vnodes = 8) {
    this.vnodes = vnodes;
    nodes.forEach((n) => this.add(n));
  }

  add(node) {
    for (let i = 0; i < this.vnodes; i++) this.#ring.push({ h: fnv1a(node + "#" + i), node });
    this.#ring.sort((a, b) => a.h - b.h);              // the points land in the same places every time
  }

  remove(node) {
    this.#ring = this.#ring.filter((e) => e.node !== node);  // only that node's arcs change hands
  }

  owner(key) {
    if (!this.#ring.length) return null;
    const h = fnv1a(key);
    for (const e of this.#ring) if (e.h >= h) return e.node; // first point clockwise
    return this.#ring[0].node;                               // past the top: wrap around
  }
}
