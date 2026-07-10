/* EWMA — reference solution. */
"use strict";

export class Ewma {
  constructor(alpha) {
    this.alpha = alpha;
    this.v = null;
  }

  update(sample) {
    if (this.v === null) this.v = sample;                       // seed with the first sample
    else this.v = this.alpha * sample + (1 - this.alpha) * this.v;
    return this.v;
  }

  value() {
    return this.v;
  }
}
