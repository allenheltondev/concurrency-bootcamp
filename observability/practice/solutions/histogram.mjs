/* Histogram — reference solution. */
"use strict";

export class Histogram {
  constructor(bounds) {
    this.bounds = bounds.slice();
    this.counts = new Array(bounds.length + 1).fill(0);
    this.total = 0;
  }

  record(v) {
    let i = this.bounds.findIndex(b => v <= b);   // le, not lt
    if (i === -1) i = this.bounds.length;         // +Inf bucket
    this.counts[i]++;
    this.total++;
  }

  quantile(q) {
    if (!this.total) return NaN;
    const rank = q * this.total;
    let cum = 0;
    for (let i = 0; i < this.counts.length; i++) {
      const prev = cum;
      cum += this.counts[i];
      if (cum >= rank && this.counts[i] > 0) {
        if (i >= this.bounds.length)
          return this.bounds[this.bounds.length - 1];   // the +Inf rule
        const lo = i === 0 ? 0 : this.bounds[i - 1];
        const hi = this.bounds[i];
        return lo + (hi - lo) * ((rank - prev) / this.counts[i]);
      }
    }
    return this.bounds[this.bounds.length - 1];
  }
}

export function merge(hists) {
  const bounds = hists[0].bounds;
  for (const h of hists)
    if (h.bounds.join() !== bounds.join()) throw new Error("bucket bounds must match");
  const m = new Histogram(bounds);
  for (const h of hists) {
    h.counts.forEach((c, i) => m.counts[i] += c);
    m.total += h.total;
  }
  return m;
}
