/* Log sampler — cut 99% of the bill, keep 100% of the evidence.

   INVARIANT: two rules, in strict order. (1) ERROR-level records are ALWAYS
   kept — pushed to this.kept and returned — no dice ever rolled for them.
   (2) Everything else is kept only when fnv1a(record.trace_id) lands under
   rate * 10000 (deterministic by trace id, so logs and traces keep the same
   specimens), and each kept record is stamped with sample_rate = 1 / rate so
   query-time totals can reweigh. Dropped records return null.
   EDGE: an error whose trace id would fail the sampling check must STILL be
   kept — the order of the two checks is the entire invariant. */
"use strict";

/* provided: 32-bit FNV-1a — deterministic string hash */
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

  /* record = { level, trace_id, ... } -> the record if kept, else null */
  emit(record) {
    throw new Error("implement me");
  }
}
