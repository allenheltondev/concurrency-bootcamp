/* Deadline-aware load shedder — admission control at the front door.

   INVARIANT: offer(now, deadline) projects the request's finish time as
   now + (queued + 1) × estServiceMs (everything ahead of it, plus itself).
   Past the deadline → return "shed" WITHOUT touching the queue count;
   otherwise queued++ and return "admitted". Everything admitted can still
   finish inside its deadline.
   EDGE: shed requests never occupy the queue (or the estimate spirals);
   done() decrements when an admitted request finishes; a request already
   past its deadline is shed even with an empty queue. */
"use strict";

export class DeadlineShedder {
  constructor(estServiceMs) {
    this.est = estServiceMs;
    this.queued = 0;
  }

  offer(now, deadline) {
    throw new Error("implement me");
  }

  done() {
    throw new Error("implement me");
  }
}
