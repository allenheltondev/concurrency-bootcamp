/* LSM store — reference solution. */
"use strict";

export const TOMBSTONE = Symbol("tombstone");

export class LSM {
  constructor(flushAt) {
    this.flushAt = flushAt;
    this.memtable = new Map();
    this.sstables = [];
  }

  put(key, val) {
    this.memtable.set(key, val);
    if (this.memtable.size >= this.flushAt) this.flush();
  }

  del(key) {
    this.put(key, TOMBSTONE);                    // a delete is a WRITE that shadows
  }

  flush() {
    if (this.memtable.size === 0) return;
    this.sstables.unshift(new Map(this.memtable));   // front = newest
    this.memtable = new Map();
  }

  get(key) {
    if (this.memtable.has(key)) {
      const v = this.memtable.get(key);
      return v === TOMBSTONE ? undefined : v;
    }
    for (const table of this.sstables) {         // newest-first; first hit decides
      if (table.has(key)) {
        const v = table.get(key);
        return v === TOMBSTONE ? undefined : v;
      }
    }
    return undefined;
  }

  compact() {
    if (this.sstables.length === 0) return;
    const merged = new Map();
    for (let i = this.sstables.length - 1; i >= 0; i--) {
      for (const [k, v] of this.sstables[i]) merged.set(k, v);   // newer overwrites
    }
    for (const [k, v] of merged) {
      if (v === TOMBSTONE) merged.delete(k);     // nothing left to shadow — drop it
    }
    this.sstables = [merged];
  }
}
