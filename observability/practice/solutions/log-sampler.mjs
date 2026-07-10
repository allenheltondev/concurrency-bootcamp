/* Log sampler — reference solution. */
"use strict";

export function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class LogSampler {
  constructor(rate) {
    this.rate = rate;
    this.kept = [];
  }

  emit(record) {
    if (record.level === "error") {         // classify FIRST — no dice for errors
      this.kept.push(record);
      return record;
    }
    if (fnv1a(record.trace_id) % 10000 < this.rate * 10000) {
      record.sample_rate = 1 / this.rate;   // the weight travels with the record
      this.kept.push(record);
      return record;
    }
    return null;
  }
}
