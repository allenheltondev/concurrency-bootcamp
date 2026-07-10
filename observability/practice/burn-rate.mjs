/* Burn rate — the SLO's spending velocity, and the multi-window pager.

   INVARIANT: burnRate(rate, slo) = rate / (1 - slo) — how many times faster
   than budget the promise is dying (burn 1 spends a 30-day budget in exactly
   30 days; 14.4 is 2% of the budget per hour, because 0.02 x 720h/1h = 14.4).
   evaluateBurn(w, slo) checks three AND-gated tiers, fastest first:
     "page-fast"  when burn(h1) > 14.4 AND burn(m5)  > 14.4
     "page-slow"  when burn(h6) > 6    AND burn(m30) > 6
     "ticket"     when burn(d3) > 1    AND burn(h6)  > 1
     null otherwise.
   The AND is the design: the long window proves the burn is real, the short
   window proves it's still happening — blips never confirm, recoveries
   reset fast.
   EDGE: a blip that screams in the 5m window but leaves the 1h burn under
   14.4 must return null, not page. */
"use strict";

export function burnRate(rate, slo) {
  throw new Error("implement me");
}

/* w = windowed error rates: { m5, m30, h1, h6, d3 } */
export function evaluateBurn(w, slo) {
  throw new Error("implement me");
}
