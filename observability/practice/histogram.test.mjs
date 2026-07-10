import { suite } from "./_harness.mjs";
import { Histogram, merge } from "./histogram.mjs";

suite("histogram — buckets, interpolation, and the only honest fleet p99", ({ log, assert }) => {
  const h = new Histogram([100, 250, 500, 1000]);
  for (let i = 0; i < 40; i++) h.record(50);
  for (let i = 0; i < 30; i++) h.record(200);
  for (let i = 0; i < 20; i++) h.record(400);
  for (let i = 0; i < 10; i++) h.record(800);
  assert(h.total === 100, "100 observations, got " + h.total);
  assert(h.counts.join(",") === "40,30,20,10,0", "bucket counts wrong: " + h.counts.join(","));

  const p50 = h.quantile(0.5);
  log("p50 -> " + p50.toFixed(1) + "ms (rank 50, 10/30 deep into (100,250])");
  assert(Math.abs(p50 - 150) < 1e-9, "p50 must interpolate to 150, got " + p50);
  const p99 = h.quantile(0.99);
  log("p99 -> " + p99.toFixed(1) + "ms — every real sample in that bucket was 800");
  assert(Math.abs(p99 - 950) < 1e-9, "p99 must interpolate to 950, got " + p99);

  h.record(250);
  assert(h.counts[1] === 31, "a value equal to a bound belongs in THAT bucket (le semantics)");
  const big = new Histogram([100, 200]);
  big.record(5000);
  assert(big.quantile(0.99) === 200, "+Inf bucket returns the largest finite bound, got " + big.quantile(0.99));
  assert(Number.isNaN(new Histogram([100]).quantile(0.5)), "an empty histogram has no quantile — NaN");

  const a = new Histogram([100, 250, 500]);
  for (let i = 0; i < 9; i++) a.record(80);
  a.record(200);
  const b = new Histogram([100, 250, 500]);
  b.record(80);
  for (let i = 0; i < 9; i++) b.record(400);
  const m = merge([a, b]);
  assert(m.total === 20 && m.counts.join(",") === "10,1,9,0",
    "merged counts must be element-wise sums, got " + m.counts.join(","));
  const fleet = m.quantile(0.99);
  const avg = (a.quantile(0.99) + b.quantile(0.99)) / 2;
  log("fleet p99 (merge-then-quantile) " + fleet.toFixed(0) + "ms vs avg-of-p99s " + avg.toFixed(0) + "ms");
  assert(fleet > avg, "the merged p99 must expose the canary the average dilutes");
  assert(a.total === 10 && b.total === 10, "merge must not mutate its inputs");

  let threw = false;
  try { merge([a, new Histogram([1, 2])]); } catch (e) { threw = true; }
  assert(threw, "mismatched bounds must throw, not silently corrupt");
  return "counts bucketed, ranks interpolated, fleets merged — you built histogram_quantile";
});
