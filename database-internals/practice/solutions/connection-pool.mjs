/* Connection pool — reference solution. */
"use strict";

export class Pool {
  constructor(size) {
    this.size = size;
    this.idle = Array.from({ length: size }, (_, i) => "c" + (i + 1));
    this.waiters = [];
  }

  acquire() {
    if (this.idle.length > 0) return Promise.resolve(this.idle.shift());
    return new Promise((resolve) => this.waiters.push(resolve));   // park FIFO
  }

  release(conn) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(conn);                    // direct hand-off — never via idle
    else this.idle.push(conn);
  }

  stats() {
    return {
      idle: this.idle.length,
      inUse: this.size - this.idle.length,
      waiting: this.waiters.length,
    };
  }
}
