/* Streaming histogram — the honest latency primitive.

   INVARIANT: percentile(p) returns the UPPER bound of the bucket containing
   rank ceil(p/100 × total) — it may over-report by up to one bucket width,
   it can NEVER under-report. counts[i] holds samples in
   (bounds[i-1], bounds[i]]; the final slot is the overflow bucket and
   reports Infinity.
   EDGE: merge(other) requires identical bounds (throw otherwise) and sums
   counts index-wise into a NEW histogram — merging populations is the only
   valid way to aggregate percentiles across hosts. */
"use strict";

export class Histogram {
  constructor(bounds) {              // ascending bucket upper bounds
    this.bounds = bounds;
    this.counts = new Array(bounds.length + 1).fill(0);
    this.total = 0;
  }

  record(v) {
    throw new Error("implement me");
  }

  percentile(p) {
    throw new Error("implement me");
  }

  merge(other) {
    // return a NEW Histogram over the combined population
    throw new Error("implement me");
  }
}
