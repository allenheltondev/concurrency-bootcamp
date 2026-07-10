/* Memory index — reference solution. */
"use strict";

export function cosine(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;   // unit-length vectors: cosine = dot product
}

export class MemoryIndex {
  constructor() {
    this.items = [];
  }

  add(item) {
    this.items.push(item);
    return item;
  }

  search(qvec, k) {
    return this.items
      .map((item) => ({ item, sim: cosine(qvec, item.vec) }))
      .sort((a, b) => b.sim - a.sim)   // descending — the classic silent bug is a-b
      .slice(0, k);
  }
}
