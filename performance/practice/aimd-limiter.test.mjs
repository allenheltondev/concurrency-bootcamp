import { suite } from "./_harness.mjs";
import { AimdLimiter } from "./aimd-limiter.mjs";

suite("AIMD limiter — gentle up, violent down", ({ log, assert }) => {
  const l = new AimdLimiter(4, 1, 100);
  for (let i = 0; i < 4; i++) assert(l.acquire() === true, "under the limit: admit #" + i);
  assert(l.acquire() === false, "at the limit: refuse the 5th");
  for (let i = 0; i < 4; i++) l.release(true);
  assert(l.limit === 5, "one full clean window raises the limit to 5, got " + l.limit);
  log("probe: 4 clean releases -> limit " + l.limit);

  for (let i = 0; i < 5; i++) assert(l.acquire(), "the raised limit admits 5");
  l.release(false);
  assert(l.limit === 2, "one overload signal HALVES: floor(5/2)=2, got " + l.limit);
  assert(l.acquire() === false, "in-flight (4) exceeds the new limit: refuse");
  for (let i = 0; i < 4; i++) l.release(true);
  assert(l.inflight === 0, "bookkeeping: all released, got " + l.inflight);
  log("overload -> limit " + l.limit + " (halved, not decremented)");

  // discovery loop against a hidden capacity of 8
  const capacity = 8;
  const d = new AimdLimiter(4, 1, 100);
  const trace = [];
  for (let round = 0; round < 14; round++) {
    let admitted = 0;
    while (d.acquire()) admitted++;
    const overloaded = admitted > capacity;
    if (overloaded) d.release(false);
    for (let i = overloaded ? 1 : 0; i < admitted; i++) d.release(true);
    trace.push(d.limit);
  }
  log("sawtooth around capacity 8: " + trace.join(" "));
  assert(Math.max(...trace) === 9, "the probe peaks one past capacity, got " + Math.max(...trace));
  assert(trace.includes(8), "the true capacity is visited on the way up");
  assert(Math.min(...trace.slice(3)) >= 4, "the escape halves — it never crawls to zero");

  const c = new AimdLimiter(2, 1, 10);
  c.acquire(); c.release(false);
  c.acquire(); c.release(false);
  assert(c.limit === 1, "repeated failures clamp at min=1, got " + c.limit);
  assert(c.acquire() === true, "even at the floor, one request may probe — that's the recovery path");
  return "capacity discovered, tracked, and re-discovered — the sawtooth is the feature";
});
