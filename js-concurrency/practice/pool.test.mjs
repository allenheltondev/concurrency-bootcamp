import { suite, sleep } from "./_harness.mjs";
import { mapPool } from "./pool.mjs";

suite("Concurrency pool — bounded, in-order results", async ({ log, assert }) => {
  let running = 0, peak = 0, calls = 0;
  const fn = async (x) => { calls++; running++; peak = Math.max(peak, running); await sleep(10); running--; return x * 2; };
  const out = await mapPool([1, 2, 3, 4, 5], 2, fn);
  log("5 items, limit 2 -> results [" + out.join(", ") + "], peak in-flight " + peak);
  assert(Array.isArray(out) && out.length === 5, "must return one result per item");
  assert(out.join(",") === "2,4,6,8,10", "results must line up with their input positions");
  assert(calls === 5, "every item must be processed exactly once (fn ran " + calls + " times)");
  assert(peak === 2, "with limit 2, exactly 2 items should be in flight at the busiest moment (peak was " + peak + ")");

  const one = await mapPool(["only"], 4, async (x) => x.toUpperCase());
  assert(one.length === 1 && one[0] === "ONLY", "limit larger than the item count must still work");
  log("limit > items handled");

  // STRENGTHEN: empty input resolves to [] and never calls fn.
  let touched = 0;
  const none = await mapPool([], 3, async (x) => { touched++; return x; });
  assert(Array.isArray(none) && none.length === 0, "an empty item list must resolve to []");
  assert(touched === 0, "fn must never run when there are no items");
  log("empty input -> [] with zero fn calls");

  return "all items processed once, in-order results, in-flight pinned at the limit";
});
