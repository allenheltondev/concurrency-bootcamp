import { suite } from "./_harness.mjs";
import { retryBackoff } from "./retry-backoff.mjs";

suite("Retry with backoff — exponential, capped, jittered, in zero wall-clock time", async ({ log, assert }) => {
  const delays = [];
  const wait = async (ms) => { delays.push(ms); };   // recorder — no real time passes

  // recovers on attempt 3 -> exactly two waits: 8, 16
  let calls = 0;
  const flaky = async () => { if (++calls < 3) throw new Error("503 #" + calls); return "ok"; };
  const v = await retryBackoff(flaky, { tries: 5, base: 8, wait });
  log("recovered on attempt " + calls + " after waits [" + delays.join(", ") + "]");
  assert(v === "ok", "must resolve with fn's value the moment it succeeds");
  assert(calls === 3, "must stop retrying on success — made " + calls + " calls");
  assert(delays.join(",") === "8,16", "exponential is base * 2^(attempt-1): expected [8,16], got [" + delays.join(",") + "]");

  // the cap clamps the ceiling; the LAST error surfaces after exactly `tries` calls
  calls = 0; delays.length = 0;
  let err = null;
  try { await retryBackoff(async () => { throw new Error("down #" + ++calls); }, { tries: 5, base: 8, cap: 20, wait }); }
  catch (e) { err = e; }
  log("always failing, cap=20: waits [" + delays.join(", ") + "], then threw '" + (err && err.message) + "'");
  assert(calls === 5, "tries=5 means exactly 5 attempts — made " + calls);
  assert(delays.join(",") === "8,16,20,20", "the cap must clamp the ceiling: expected [8,16,20,20], got [" + delays.join(",") + "]");
  assert(delays.length === 4, "no wait after the final failure — 5 attempts means 4 waits, got " + delays.length);
  assert(err && err.message === "down #5", "the LAST error must surface (the freshest evidence) — got '" + (err && err.message) + "'");

  // full jitter: floor(random() * ceiling), with random injected
  delays.length = 0;
  await retryBackoff(async () => { throw new Error("x"); }, { tries: 3, base: 8, jitter: true, wait, random: () => 0.25 }).catch(() => {});
  log("jitter with random() = 0.25: waits [" + delays.join(", ") + "]");
  assert(delays.join(",") === "2,4", "full jitter is floor(0.25 * ceiling): expected [2,4], got [" + delays.join(",") + "]");

  // STRENGTHEN: immediate success never waits; tries=1 never retries.
  delays.length = 0;
  const one = await retryBackoff(async () => 42, { wait });
  assert(one === 42 && delays.length === 0, "success on attempt 1 must return immediately — zero waits");
  let calls1 = 0, e1 = null;
  try { await retryBackoff(async () => { calls1++; throw new Error("once"); }, { tries: 1, wait }); } catch (e) { e1 = e; }
  assert(calls1 === 1 && e1 && e1.message === "once" && delays.length === 0, "tries=1 is one attempt, zero waits, immediate rethrow — made " + calls1 + " call(s), " + delays.length + " wait(s)");
  log("tries=1: one attempt, no wait, error rethrown");

  return "delays went [8,16] then clamped at the cap, jitter was deterministic under injected random, and the last error surfaced after exactly `tries` calls";
});
