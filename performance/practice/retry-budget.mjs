/* Retry budget — cap the storm before it exists.

   INVARIANT: retries may never exceed ratio × firstTries, so total offered
   load can never exceed (1 + ratio) × first-try traffic, no matter how bad
   the outage. canRetry() answers for RIGHT NOW; onRetry() spends one unit.
   EDGE: retries must NEVER count into the base (a self-funding budget
   creeps past its cap); zero traffic means zero budget; fresh first-try
   traffic replenishes it. */
"use strict";

export class RetryBudget {
  constructor(ratio = 0.1) {
    this.ratio = ratio;
    this.firstTries = 0;
    this.retries = 0;
  }

  onFirstTry() {
    throw new Error("implement me");
  }

  canRetry() {
    throw new Error("implement me");
  }

  onRetry() {
    throw new Error("implement me");
  }
}
