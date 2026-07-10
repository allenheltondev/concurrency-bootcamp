/* Forgetting policy — a capacity-bounded store that evicts the weakest.

   INVARIANT: add(m, now) appends {...m, lastAccess: now}; when the store
   exceeds capacity it evicts AND RETURNS the item with the LOWEST
   score(m, now), else returns null. score(): pinned items are Infinity
   (never evicted); others are (importance/10) * halfLifeDecay(idle time),
   where idle time = now - lastAccess.
   EDGE: touch(id, now) refreshes lastAccess — being retrieved is what keeps
   a memory alive; the weakest item can be the newcomer itself; no eviction
   happens while the store is merely AT capacity. */
"use strict";

export const DAY = 86400000;

export class BoundedMemory {
  constructor(capacity, halfLifeDays = 7) {
    this.capacity = capacity;
    this.halfLifeDays = halfLifeDays;
    this.items = [];
  }

  score(m, now) {
    throw new Error("implement me");
  }

  add(m, now) {
    throw new Error("implement me");
  }

  touch(id, now) {
    throw new Error("implement me");
  }

  has(id) {
    return this.items.some((x) => x.id === id);
  }
}
