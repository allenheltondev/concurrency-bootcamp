/* Burn rate — reference solution. */
"use strict";

export function burnRate(rate, slo) {
  return rate / (1 - slo);            // budget rate, not the SLO itself
}

export function evaluateBurn(w, slo) {
  const b = (r) => burnRate(r, slo);
  if (b(w.h1) > 14.4 && b(w.m5) > 14.4) return "page-fast";   // 2% of budget in 1h
  if (b(w.h6) > 6 && b(w.m30) > 6) return "page-slow";        // 5% of budget in 6h
  if (b(w.d3) > 1 && b(w.h6) > 1) return "ticket";            // 10% of budget in 3d
  return null;
}
