import { suite } from "./_harness.mjs";
import { Histogram } from "./histogram.mjs";

suite("streaming histogram — conservative percentiles, valid merging", ({ log, assert }) => {
  const h = new Histogram([10, 20, 50, 100, 200]);
  assert(h.percentile(99) === undefined, "an EMPTY histogram has no p99 — undefined, never the first bound");
  for (let i = 0; i < 96; i++) h.record(8);
  h.record(60); h.record(60); h.record(150); h.record(180);
  assert(h.total === 100, "100 samples recorded, got " + h.total);
  assert(h.counts[0] === 96, "fast samples land in the first bucket, got " + h.counts[0]);
  assert(h.counts[3] === 2 && h.counts[4] === 2, "60s in <=100, 150/180 in <=200");

  assert(h.percentile(50) === 10, "p50 is the first bucket's UPPER bound (10), got " + h.percentile(50));
  assert(h.percentile(96) === 10, "rank 96 still lands in the fast bucket, got " + h.percentile(96));
  assert(h.percentile(97) === 100, "rank 97 lands with the 60ms samples: bound 100, got " + h.percentile(97));
  assert(h.percentile(99) === 200, "rank 99 lands in <=200, got " + h.percentile(99));
  assert(h.percentile(100) === 200, "p100 is the last non-empty bucket's bound, got " + h.percentile(100));
  log("p50=" + h.percentile(50) + " p97=" + h.percentile(97) + " p99=" + h.percentile(99));

  h.record(9999);
  assert(h.percentile(100) === Infinity, "overflow samples must report Infinity, never a finite lie");

  // the merge: one sick host + one healthy host
  const a = new Histogram([10, 1000]);
  for (let i = 0; i < 900; i++) a.record(8);
  for (let i = 0; i < 100; i++) a.record(700);
  const b = new Histogram([10, 1000]);
  for (let i = 0; i < 1000; i++) b.record(8);
  assert(a.percentile(99) === 1000 && b.percentile(99) === 10, "host p99s: 1000 and 10");
  const fleet = a.merge(b);
  assert(fleet.total === 2000, "merged population must be 2000, got " + fleet.total);
  assert(fleet.percentile(99) === 1000, "fleet p99 is 1000 — NOT avg(1000,10)=505, got " + fleet.percentile(99));
  assert(fleet.percentile(50) === 10, "fleet p50 stays 10, got " + fleet.percentile(50));
  assert(a.total === 1000 && b.total === 1000, "merge must not mutate its inputs");
  log("avg of host p99s would say 505ms; the merged population says " + fleet.percentile(99) + "ms");

  let threw = false;
  try { a.merge(new Histogram([10, 500])); } catch (e) { threw = true; }
  assert(threw, "mismatched bounds must throw — counts from different rulers cannot add");
  return "conservative percentiles, mergeable populations — the honest primitive holds";
});
