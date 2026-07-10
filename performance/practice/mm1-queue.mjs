/* Single-server queue — the virtual-time simulator and the M/M/1 closed form.

   INVARIANT (simulateQueue): jobs = [{arrival, service}] sorted by arrival,
   served FIFO by ONE server. A job starts at max(its arrival, when the
   server frees up). wait = start − arrival; latency = wait + service.
   INVARIANT (mm1Wait): the exact M/M/1 mean time-in-system,
   W = S/(1−ρ) with ρ = λ·S/1000 (λ per second, S in ms) — and Infinity
   at ρ ≥ 1, because a system at or past saturation has NO steady state
   (never return a number there).
   EDGE: lambdaRps is per second, serviceMs per request in ms — mind units. */
"use strict";

export function simulateQueue(jobs) {
  // return { waits, latencies }
  throw new Error("implement me");
}

export function mm1Wait(lambdaRps, serviceMs) {
  throw new Error("implement me");
}
