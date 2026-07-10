import { suite } from "./_harness.mjs";
import { burnRate, evaluateBurn } from "./burn-rate.mjs";

suite("burn rate — fires page in minutes, leaks in hours, blips never", ({ log, assert }) => {
  const slo = 0.999;   // budget 0.1%
  assert(Math.abs(burnRate(0.001, slo) - 1) < 1e-9, "erring exactly at budget is burn 1");
  assert(Math.abs(burnRate(0.02, slo) - 20) < 1e-9, "2% errors vs 0.1% budget is burn 20, got " + burnRate(0.02, slo));
  assert(Math.abs(burnRate(1, slo) - 1000) < 1e-9, "total failure burns 1000x — budget dead in ~43 minutes");

  const fire = evaluateBurn({ m5: 0.02, m30: 0.02, h1: 0.02, h6: 0.004, d3: 0.001 }, slo);
  log("2% errors sustained -> " + fire);
  assert(fire === "page-fast", "a real fire must page fast, got " + fire);

  const blip = evaluateBurn({ m5: 0.16, m30: 0.027, h1: 0.01, h6: 0.002, d3: 0.0005 }, slo);
  log("90-second blip (5m window screaming, 1h calm) -> " + blip);
  assert(blip === null, "a blip must NOT page: the long window never confirmed it, got " + blip);

  const leak = evaluateBurn({ m5: 0.0008, m30: 0.008, h1: 0.008, h6: 0.008, d3: 0.004 }, slo);
  assert(leak === "page-slow", "a 0.8% slow leak burns 8x on 6h AND 30m -> page-slow, got " + leak);

  const drip = evaluateBurn({ m5: 0.002, m30: 0.002, h1: 0.002, h6: 0.002, d3: 0.002 }, slo);
  assert(drip === "ticket", "a 2x drip is morning work: ticket, got " + drip);

  const calm = evaluateBurn({ m5: 0.0005, m30: 0.0005, h1: 0.0005, h6: 0.0005, d3: 0.0005 }, slo);
  assert(calm === null, "burn 0.5 is within budget: silence, got " + calm);
  return "both windows or no page — the long window proves it's real, the short one proves it's still happening";
});
