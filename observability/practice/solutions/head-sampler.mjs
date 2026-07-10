/* Head sampler — reference solution. */
"use strict";

export function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class HeadSampler {
  constructor(rate) {
    this.rate = rate;
  }

  keep(traceId) {
    return fnv1a(traceId) % 10000 < this.rate * 10000;
  }
}
