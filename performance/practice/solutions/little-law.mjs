/* Little's law — reference solution. */
"use strict";

export function littleSolve({ L, lambda, W }) {
  const known = [L, lambda, W].filter(v => v != null).length;
  if (known !== 2) throw new Error("need exactly two of L, lambda, W");
  if (L == null)      return { L: lambda * W, lambda, W };   // occupancy = rate × time
  if (lambda == null) return { L, lambda: L / W, W };        // rate = occupancy ÷ time
  return { L, lambda, W: L / lambda };                       // time = occupancy ÷ rate
}

export function capacityRps(concurrency, serviceMs) {
  return concurrency / (serviceMs / 1000);                   // λmax = N / W
}
