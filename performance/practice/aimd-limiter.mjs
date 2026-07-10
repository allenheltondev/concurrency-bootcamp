/* AIMD concurrency limiter — discover capacity instead of configuring it.

   INVARIANT: at most `limit` requests in flight (acquire returns false at
   the limit). On a failure signal: streak resets and the limit HALVES
   (floor, clamped to min) — multiplicative decrease outruns the overload.
   On success: streak++; after a full window (streak ≥ limit) the streak
   resets and the limit rises by 1 (clamped to max) — additive increase
   probes without re-creating the incident.
   EDGE: the limit never reaches 0 (min ≥ 1) — a limiter that can't probe
   can't recover. Success accounting uses a WINDOW, never +1 per success. */
"use strict";

export class AimdLimiter {
  constructor(start = 10, min = 1, max = 1000) {
    this.limit = start; this.min = min; this.max = max;
    this.inflight = 0; this.streak = 0;
  }

  acquire() {
    throw new Error("implement me");
  }

  release(ok) {
    throw new Error("implement me");
  }
}
