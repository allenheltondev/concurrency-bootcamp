/* Cardinality budget — count series like the TSDB bills them, and triage
   an explosion.

   INVARIANT: a time series is (metric name + canonical label-set), and the
   potential series count is the PRODUCT of each label's distinct-value count
   ({} -> 1, the bare metric). SeriesTracker.observe(name, labels) counts
   TRUE distinct series: the key is the name plus label pairs sorted by key,
   so {a, b} and {b, a} are one series but a new VALUE or a new metric name
   is a new one. dropUntilBudget(labelCards, budget) is greedy triage: while
   the product exceeds the budget, drop the label with the MOST distinct
   values, recording the drop order; return { dropped, series }.
   EDGE: an already-under-budget set drops nothing; ties may resolve either
   way (the tests avoid them). */
"use strict";

export function seriesProduct(labelCards) {
  throw new Error("implement me");
}

export class SeriesTracker {
  constructor() {
    this.seen = new Set();
  }

  observe(name, labels) {
    throw new Error("implement me");
  }
}

export function dropUntilBudget(labelCards, budget) {
  throw new Error("implement me");
}
