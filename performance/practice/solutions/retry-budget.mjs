/* Retry budget — reference solution. */
"use strict";

export class RetryBudget {
  constructor(ratio = 0.1) {
    this.ratio = ratio;
    this.firstTries = 0;
    this.retries = 0;
  }

  onFirstTry() {
    this.firstTries++;
  }

  canRetry() {
    return this.retries < this.firstTries * this.ratio;   // base = FIRST TRIES only
  }

  onRetry() {
    this.retries++;                                       // never touches firstTries
  }
}
