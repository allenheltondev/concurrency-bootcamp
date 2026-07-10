/* Retrieval scoring — reference solution. */
"use strict";

export const DAY = 86400000;

export function scoreMemory(m, sim, now, w) {
  const age = now - m.ts;
  return w.sim * sim
       + w.rec * Math.pow(0.5, age / (w.halfLifeDays * DAY))   // decay DOWN from 1
       + w.imp * (m.importance / 10);                          // normalized to [0,1]
}

export function rank(memories, sims, now, w) {
  return memories
    .map((m, i) => ({ m, score: scoreMemory(m, sims[i], now, w) }))
    .sort((a, b) => b.score - a.score);
}
