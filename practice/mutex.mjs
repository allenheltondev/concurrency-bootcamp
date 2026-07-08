/* Mutex — a direct-handoff lock. One holder at a time.

   INVARIANT: the lock is never observably free while a waiter exists — on
   release it transfers straight to the next waiter, so no newcomer can slip
   in between (no barging window).
   FIFO: waiters are handed the lock in the order they parked.
   EDGE: release() with an empty queue must actually free the lock, or it
   stays locked forever.
*/
export class Mutex {
  #locked = false;
  #queue = [];

  async acquire() {
    throw new Error("implement me");
  }

  release() {
    throw new Error("implement me");
  }
}
