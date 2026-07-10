/* Counter rate — reset-proof increase and per-second rate.

   INVARIANT: a counter is cumulative per process and can only grow — an
   observed DECREASE can only mean the process restarted and began counting
   again from zero, so the post-reset sample itself IS the increase since the
   reset. increase() is therefore never negative, and ratePerSec() divides by
   the window in seconds ((last.t - first.t) / 1000), not the sample count.
   EDGE: multiple resets in one window each contribute their post-reset value;
   a steady window is just the sum of the deltas. */
"use strict";

/* samples: [{ t (ms), v (cumulative count) }], oldest first */
export function increase(samples) {
  throw new Error("implement me");
}

export function ratePerSec(samples) {
  throw new Error("implement me");
}
