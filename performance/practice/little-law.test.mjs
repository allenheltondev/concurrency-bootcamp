import { suite } from "./_harness.mjs";
import { littleSolve, capacityRps } from "./little-law.mjs";

suite("Little's law — three observables, one identity", ({ log, assert }) => {
  const w = littleSolve({ L: 120, lambda: 60 });
  assert(w.W === 2, "120 in flight at 60 req/s: users wait 2s, got " + w.W);
  log("incident math: L=120, λ=60 -> W = " + w.W + "s (no latency panel needed)");

  const l = littleSolve({ lambda: 100, W: 0.2 });
  assert(l.L === 20, "100 req/s x 0.2s: 20 concurrent, got " + l.L);

  const lam = littleSolve({ L: 10, W: 0.05 });
  assert(lam.lambda === 200, "10 connections at 50ms each: 200 req/s max, got " + lam.lambda);

  const round = littleSolve({ lambda: w.lambda, W: w.W });
  assert(round.L === 120, "solving back must reproduce L=120, got " + round.L);

  let threw = false;
  try { littleSolve({ L: 5 }); } catch (e) { threw = true; }
  assert(threw, "one known value must throw — nothing to solve");
  let threw2 = false;
  try { littleSolve({ L: 5, lambda: 1, W: 5 }); } catch (e) { threw2 = true; }
  assert(threw2, "three known values must throw — nothing is missing");

  assert(capacityRps(10, 50) === 200, "pool of 10 at 50ms: ceiling 200 rps, got " + capacityRps(10, 50));
  assert(capacityRps(64, 8) === 8000, "64 workers at 8ms: 8000 rps, got " + capacityRps(64, 8));
  log("capacityRps: the throughput ceiling a pool silently imposes");
  return "L = λW rearranged three ways, loud when unsolvable — half of capacity math in one identity";
});
