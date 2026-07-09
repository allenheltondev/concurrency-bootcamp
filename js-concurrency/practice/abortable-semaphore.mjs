/* Semaphore — N permits, with an abortable wait.

   class Semaphore {
     constructor(n)
     async acquire(signal?)   // an AbortSignal aborts a WAITING acquire
     release()
   }

   INVARIANT: at most N holders at once; the permit count never drifts.
   ABORT: aborting a waiting acquire rejects it with the signal's reason,
   removes its queue slot (no permit leak, no ghost wake), and a later release
   hands the permit to the NEXT live waiter — never the aborted one.
   ALREADY-ABORTED: an already-aborted signal rejects immediately, without ever
   joining the queue.
   Direct handoff: release() either wakes a waiter OR returns a permit to the
   pool — never both.
*/
export class Semaphore {
  #permits;
  #waiters = [];

  constructor(n) {
    this.#permits = n;
  }

  async acquire(signal) {
    throw new Error("implement me");
  }

  release() {
    throw new Error("implement me");
  }
}
