/* Single-server queue — reference solution. */
"use strict";

export function simulateQueue(jobs) {
  let free = 0;
  const waits = [], latencies = [];
  for (const j of jobs) {
    const start = Math.max(j.arrival, free);   // queue behind the backlog
    free = start + j.service;
    waits.push(start - j.arrival);
    latencies.push(free - j.arrival);          // measured from ARRIVAL
  }
  return { waits, latencies };
}

export function mm1Wait(lambdaRps, serviceMs) {
  const rho = lambdaRps * serviceMs / 1000;
  if (rho >= 1) return Infinity;               // no steady state — say so
  return serviceMs / (1 - rho);
}
