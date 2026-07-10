/* Deadline-aware load shedder — reference solution. */
"use strict";

export class DeadlineShedder {
  constructor(estServiceMs) {
    this.est = estServiceMs;
    this.queued = 0;
  }

  offer(now, deadline) {
    const finishBy = now + (this.queued + 1) * this.est;   // queue wait + own service
    if (finishBy > deadline) return "shed";                // fast, free no — queue untouched
    this.queued++;
    return "admitted";
  }

  done() {
    this.queued--;
  }
}
