/* AIMD concurrency limiter — reference solution. */
"use strict";

export class AimdLimiter {
  constructor(start = 10, min = 1, max = 1000) {
    this.limit = start; this.min = min; this.max = max;
    this.inflight = 0; this.streak = 0;
  }

  acquire() {
    if (this.inflight >= this.limit) return false;
    this.inflight++;
    return true;
  }

  release(ok) {
    this.inflight--;
    if (!ok) {
      this.streak = 0;
      this.limit = Math.max(this.min, Math.floor(this.limit / 2));  // MD: escape fast
      return;
    }
    this.streak++;
    if (this.streak >= this.limit) {                                // one full clean window
      this.streak = 0;
      this.limit = Math.min(this.max, this.limit + 1);              // AI: probe gently
    }
  }
}
