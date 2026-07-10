/* Head sampler — the deterministic keep/drop decision at trace start.

   INVARIANT: keep(traceId) is a PURE FUNCTION of the trace id — hash it
   (fnv1a below, provided) into 0..9999 and keep when the hash falls below
   rate * 10000. The same trace id must always get the same verdict, on any
   service, at any time — that's what keeps whole traces together with zero
   coordination. No Math.random(), no clock, no per-span anything.
   EDGE: rate 0 keeps nothing, rate 1 keeps everything; two independently
   constructed samplers with the same rate must agree on every trace. */
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

export class HeadSampler {
  constructor(rate) {
    this.rate = rate;
  }

  keep(traceId) {
    throw new Error("implement me");
  }
}
