/* Lock manager — async row locks, FIFO hand-off, deadlock detection.

   acquire(tx, row) -> Promise:
     - row free: record tx as holder, return a resolved promise.
     - held by tx itself: already yours, return a resolved promise.
     - held by someone else: FIRST check the wait-for graph. Waiting here
       would add the edge tx -> holder; follow waitsFor edges from that
       holder — if the chain reaches tx, granting the wait would close a
       cycle: reject with DeadlockError WITHOUT queueing (a deadlock is
       detected, not served). Otherwise record waitsFor.set(tx, holder) and
       return a promise parked FIFO in the row's queue.

   release(tx, row): direct hand-off — if waiters are queued, the HEAD waiter
   becomes the holder (and its waitsFor edge is cleared) BEFORE its promise
   resolves; only if the queue is empty does the row become free.

   INVARIANT: grants are FIFO; the lock is never observably free while a
   waiter exists — an acquire issued right after a release-with-waiters must
   queue behind them, not barge; a cyclic wait throws DeadlockError instead
   of hanging forever.
   EDGE: t1 holds A, t2 holds B, t1 requests B (queues), t2 requests A ->
   DeadlockError; after t2 aborts (releases B), t1 gets B. */
"use strict";

export class DeadlockError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "DeadlockError";
  }
}

export class LockManager {
  constructor() {
    this.locks = new Map();      // row -> { holder, queue: [{ tx, resolve }] }
    this.waitsFor = new Map();   // waiting tx -> the tx it currently waits for
  }

  acquire(tx, row) {
    throw new Error("implement me");
  }

  release(tx, row) {
    throw new Error("implement me");
  }

  holderOf(row) {
    const l = this.locks.get(row);
    return l ? l.holder : null;
  }
}
