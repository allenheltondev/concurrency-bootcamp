/* Little's law — L = λW, on any stable system, no distribution assumptions.

   INVARIANT: littleSolve({L, lambda, W}) receives exactly TWO of the three
   (the missing one is null/undefined) and returns all three, using
   L = lambda × W. Fewer or more than two known values must THROW — a solver
   that can't solve must say so, never return NaN.
   EDGE: capacityRps(concurrency, serviceMs) is the pool-sizing corollary:
   the max throughput a concurrency limit permits, λmax = N / W, with W
   converted from ms to seconds. */
"use strict";

export function littleSolve({ L, lambda, W }) {
  throw new Error("implement me");
}

export function capacityRps(concurrency, serviceMs) {
  throw new Error("implement me");
}
