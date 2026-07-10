/* Forgetting policy — reference solution. */
"use strict";

export const DAY = 86400000;

export class BoundedMemory {
  constructor(capacity, halfLifeDays = 7) {
    this.capacity = capacity;
    this.halfLifeDays = halfLifeDays;
    this.items = [];
  }

  score(m, now) {
    if (m.pin) return Infinity;                       // pins are unbeatable
    const idle = now - m.lastAccess;
    return (m.importance / 10)
         * Math.pow(0.5, idle / (this.halfLifeDays * DAY));
  }

  add(m, now) {
    this.items.push({ ...m, lastAccess: now });
    if (this.items.length <= this.capacity) return null;
    let victim = 0;
    for (let i = 1; i < this.items.length; i++)
      if (this.score(this.items[i], now) < this.score(this.items[victim], now))
        victim = i;                                    // LOWEST score goes
    return this.items.splice(victim, 1)[0];
  }

  touch(id, now) {
    const m = this.items.find((x) => x.id === id);
    if (m) m.lastAccess = now;                         // retrieval refreshes
  }

  has(id) {
    return this.items.some((x) => x.id === id);
  }
}
