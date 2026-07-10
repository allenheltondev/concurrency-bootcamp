/* Lock manager — reference solution. */
"use strict";

export class DeadlockError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "DeadlockError";
  }
}

export class LockManager {
  constructor() {
    this.locks = new Map();
    this.waitsFor = new Map();
  }

  acquire(tx, row) {
    const l = this.locks.get(row);
    if (!l) {
      this.locks.set(row, { holder: tx, queue: [] });
      return Promise.resolve();
    }
    if (l.holder === tx) return Promise.resolve();   // already yours

    // Deadlock check BEFORE queueing: waiting would add tx -> holder.
    let cur = l.holder;
    while (cur !== undefined) {
      if (cur === tx) {
        return Promise.reject(new DeadlockError(
          "wait-for cycle: waiting on " + String(row) + " would deadlock " + String(tx)));
      }
      cur = this.waitsFor.get(cur);                  // follow the chain
    }

    this.waitsFor.set(tx, l.holder);
    return new Promise((resolve) => l.queue.push({ tx, resolve }));
  }

  release(tx, row) {
    const l = this.locks.get(row);
    if (!l || l.holder !== tx) return;
    const next = l.queue.shift();
    if (next) {
      l.holder = next.tx;                            // hand off BEFORE resolving —
      this.waitsFor.delete(next.tx);                 // the lock is never observably free
      for (const w of l.queue)                       // survivors now wait on the NEW holder —
        this.waitsFor.set(w.tx, next.tx);            // stale edges fake cycles and hide real ones
      next.resolve();
    } else {
      this.locks.delete(row);                        // no waiters — genuinely free
    }
  }

  holderOf(row) {
    const l = this.locks.get(row);
    return l ? l.holder : null;
  }
}
