/* Memory index — top-k retrieval by cosine similarity.

   INVARIANT: search(qvec, k) returns the k most similar records as
   [{ item, sim }], best first. All vectors are unit-length, so cosine
   similarity reduces to the dot product.
   EDGE: k larger than the store returns everything (still ranked);
   an empty store returns []. */
"use strict";

export function cosine(a, b) {
  throw new Error("implement me");
}

export class MemoryIndex {
  constructor() {
    this.items = [];   // [{ id, vec, ... }]
  }

  add(item) {
    this.items.push(item);
    return item;
  }

  search(qvec, k) {
    throw new Error("implement me");
  }
}
