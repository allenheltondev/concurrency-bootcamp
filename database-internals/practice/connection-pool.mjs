/* Connection pool — few connections, many requests, FIFO service.

   acquire() -> Promise<conn>: if a connection is idle, hand it out
   immediately; otherwise return a promise parked FIFO in waiters.

   release(conn): direct hand-off — if a waiter is queued, the OLDEST waiter
   gets this exact connection (it never touches idle on the way); only if no
   one is waiting does the connection return to idle.

   stats() -> { idle, inUse, waiting }
     idle    = this.idle.length
     inUse   = this.size - this.idle.length
     waiting = this.waiters.length

   INVARIANT: never more than `size` connections dispensed concurrently;
   waiters are served FIFO; a released connection reaches a waiter before it
   ever returns to idle — the pool is never observably idle while someone is
   waiting.
   EDGE: release with no waiters goes back to idle; an acquire/release storm
   leaves stats exact. */
"use strict";

export class Pool {
  constructor(size) {
    this.size = size;
    this.idle = Array.from({ length: size }, (_, i) => "c" + (i + 1));
    this.waiters = [];   // FIFO: resolve functions of parked acquire() calls
  }

  acquire() {
    throw new Error("implement me");
  }

  release(conn) {
    throw new Error("implement me");
  }

  stats() {
    throw new Error("implement me");
  }
}
