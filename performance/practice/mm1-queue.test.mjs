import { suite } from "./_harness.mjs";
import { simulateQueue, mm1Wait } from "./mm1-queue.mjs";

suite("single-server queue — simulated backlog, analytic hockey stick", ({ log, assert }) => {
  const r = simulateQueue([
    { arrival: 0, service: 2 }, { arrival: 1, service: 2 },
    { arrival: 2, service: 2 }, { arrival: 3, service: 2 },
  ]);
  assert(r.waits.join(",") === "0,1,2,3", "each arrival queues behind the backlog: 0,1,2,3 — got " + r.waits.join(","));
  assert(r.latencies.join(",") === "2,3,4,5", "latency = wait + service, got " + r.latencies.join(","));
  log("overloaded arrivals: waits " + r.waits.join(", ") + " — the backlog compounds");

  const idle = simulateQueue([{ arrival: 0, service: 2 }, { arrival: 100, service: 2 }]);
  assert(idle.waits[1] === 0 && idle.latencies[1] === 2, "after an idle gap: no wait, latency = service");

  const burst = simulateQueue([
    { arrival: 0, service: 10 }, { arrival: 0, service: 10 }, { arrival: 0, service: 10 },
  ]);
  assert(burst.waits.join(",") === "0,10,20", "a burst serializes through one server: 0,10,20");

  assert(mm1Wait(50, 10) === 20, "ρ=0.5 -> W = 2×S = 20ms, got " + mm1Wait(50, 10));
  assert(Math.abs(mm1Wait(80, 10) - 50) < 1e-9, "ρ=0.8 -> 5×S = 50ms, got " + mm1Wait(80, 10));
  assert(Math.abs(mm1Wait(90, 10) - 100) < 1e-9, "ρ=0.9 -> 10×S = 100ms, got " + mm1Wait(90, 10));
  assert(Math.abs(mm1Wait(99, 10) - 1000) < 1e-6, "ρ=0.99 -> 100×S, got " + mm1Wait(99, 10));
  log("the hockey stick: ρ .5/.8/.9/.99 -> " + [50, 80, 90, 99].map(l => mm1Wait(l, 10).toFixed(0)).join("/") + " ms");
  assert(mm1Wait(100, 10) === Infinity, "ρ = 1 has NO steady state — the honest answer is Infinity");
  assert(mm1Wait(120, 10) === Infinity, "past saturation must never return a (negative) number");
  return "start = max(arrival, free) makes the queue; 1/(1−ρ) makes it explode";
});
