/* Retrieval scoring — relevance + recency + importance, weighted.

   INVARIANT: score = w.sim * sim
                    + w.rec * halfLifeDecay(now - m.ts)
                    + w.imp * (m.importance / 10)
   where halfLifeDecay is 1 for a brand-new memory, 0.5 after exactly
   w.halfLifeDays days, and decays toward 0 — never negative, never > 1.
   EDGE: importance is rated 1-10 and must be normalized to [0,1] so the
   weights are comparable; a memory written at `now` has recency exactly 1. */
"use strict";

export const DAY = 86400000;

export function scoreMemory(m, sim, now, w) {
  // m = { ts, importance }; sim in [0,1]
  // w = { sim, rec, imp, halfLifeDays }
  throw new Error("implement me");
}

export function rank(memories, sims, now, w) {
  // memories[i] pairs with sims[i]; return [{ m, score }] best-first
  throw new Error("implement me");
}
