/* EWMA — exponentially weighted moving average.

   INVARIANT: v ← alpha·sample + (1−alpha)·v, where alpha is the weight of
   the NEW sample (0.2 = calm and laggy, 0.9 = jumpy and current).
   EDGE: the FIRST sample seeds v directly — never blend with a fake 0, or
   the average spends its first ~1/alpha samples climbing out of a hole
   that never existed. value() is null before any sample. */
"use strict";

export class Ewma {
  constructor(alpha) {
    this.alpha = alpha;
    this.v = null;
  }

  update(sample) {
    throw new Error("implement me");
  }

  value() {
    throw new Error("implement me");
  }
}
