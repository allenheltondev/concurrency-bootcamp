/* Histogram — bucketed latency with interpolated quantiles and exact merge.

   INVARIANT: bounds are upper edges with LE ("less or equal") semantics — a
   value equal to a boundary belongs in that bucket; values above the last
   bound land in the +Inf slot (counts has bounds.length + 1 entries).
   quantile(q): rank = q * total; find the bucket where the cumulative count
   reaches the rank, then LINEARLY INTERPOLATE within it:
   lo + (hi - lo) * ((rank - prev) / counts[i]). A rank landing in the +Inf
   bucket returns the largest finite bound (the histogram_quantile rule).
   merge(hists): bucket counts and totals ADD element-wise — the only valid
   fleet aggregation; mismatched bounds must throw, never silently corrupt.
   EDGE: an empty histogram's quantile is NaN; merge must not mutate inputs. */
"use strict";

export class Histogram {
  constructor(bounds) {
    this.bounds = bounds.slice();
    this.counts = new Array(bounds.length + 1).fill(0);   // last slot = +Inf
    this.total = 0;
  }

  record(v) {
    throw new Error("implement me");
  }

  quantile(q) {
    throw new Error("implement me");
  }
}

export function merge(hists) {
  throw new Error("implement me");
}
