import { suite } from "./_harness.mjs";
import { Ewma } from "./ewma.mjs";

suite("EWMA — seeded honestly, weighted as configured", ({ log, assert }) => {
  const e = new Ewma(0.5);
  assert(e.value() === null, "no samples yet: value() must be null");
  assert(e.update(100) === 100, "the first sample SEEDS the average (no zero-blend)");
  assert(e.update(200) === 150, "0.5*200 + 0.5*100 = 150, got " + e.value());
  assert(e.update(200) === 175, "0.5*200 + 0.5*150 = 175, got " + e.value());
  log("alpha .5: 100 -> 150 -> 175, converging on the new level");

  const calm = new Ewma(0.2);
  calm.update(100);
  const atSpike = calm.update(600);
  assert(atSpike === 200, "a 6x spike moves a 0.2-EWMA to 200, not 600 — got " + atSpike);
  for (let i = 0; i < 5; i++) calm.update(100);
  assert(Math.abs(calm.value() - 132.768) < 1e-9,
    "five healthy samples decay it to 132.768, got " + calm.value());
  log("spike absorbed: 200 -> " + calm.value().toFixed(1) + " and falling");

  const converge = new Ewma(0.2);
  for (let i = 0; i < 60; i++) converge.update(50);
  assert(Math.abs(converge.value() - 50) < 1e-6, "a steady signal converges to itself");

  const jumpy = new Ewma(0.9);
  jumpy.update(100); jumpy.update(600);
  assert(jumpy.value() === 550, "alpha .9 gives the new sample 90%: 550, got " + jumpy.value());
  return "one multiply-add per sample: alpha is the policy, the seed is the honesty";
});
