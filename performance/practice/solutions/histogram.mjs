/* Streaming histogram — reference solution. */
"use strict";

export class Histogram {
  constructor(bounds) {
    this.bounds = bounds;
    this.counts = new Array(bounds.length + 1).fill(0);
    this.total = 0;
  }

  record(v) {
    let i = 0;
    while (i < this.bounds.length && v > this.bounds[i]) i++;
    this.counts[i]++;
    this.total++;
  }

  percentile(p) {
    const rank = Math.ceil((p / 100) * this.total);   // ranks count samples: start at 1
    let cum = 0;
    for (let i = 0; i < this.counts.length; i++) {
      cum += this.counts[i];
      if (cum >= rank) return i < this.bounds.length ? this.bounds[i] : Infinity;
    }
  }

  merge(other) {
    if (other.bounds.length !== this.bounds.length ||
        other.bounds.some((b, i) => b !== this.bounds[i]))
      throw new Error("bounds must match to merge");
    const h = new Histogram(this.bounds);
    h.counts = this.counts.map((c, i) => c + other.counts[i]);
    h.total = this.total + other.total;
    return h;
  }
}
