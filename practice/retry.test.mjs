import { suite } from "./_harness.mjs";
import { retry } from "./retry.mjs";

suite("Retry with backoff — bounded, exponential", async ({ log, assert }) => {
  let calls = 0;
  const flaky = async () => { calls++; if (calls < 3) throw new Error("flaky #" + calls); return "recovered"; };
  let v = null, unexpected = null;
  try { v = await retry(flaky, 5, 5); } catch (e) { unexpected = e; }
  assert(!unexpected, "a call that eventually succeeds must not reject (retry gave up with: " + (unexpected && unexpected.message) + ")");
  log("flaky call: " + calls + " attempts -> " + v);
  assert(v === "recovered", "must resolve with fn's value once it succeeds");
  assert(calls === 3, "must stop retrying the moment fn succeeds (made " + calls + " calls)");

  calls = 0;
  let err = null;
  try { await retry(async () => { calls++; throw new Error("down"); }, 3, 5); }
  catch (e) { err = e; }
  log("always-failing call: " + calls + " attempts, then threw '" + (err && err.message) + "'");
  assert(calls === 3, "tries = 3 means exactly 3 attempts, no more, no fewer (made " + calls + ")");
  assert(err && err.message === "down", "after the last attempt the ORIGINAL error must surface");

  // STRENGTHEN: tries = 1 means one attempt and no retry.
  calls = 0;
  let e1 = null;
  try { await retry(async () => { calls++; throw new Error("once"); }, 1, 5); } catch (e) { e1 = e; }
  assert(calls === 1 && e1 && e1.message === "once", "tries = 1 must attempt exactly once and rethrow immediately (made " + calls + ")");
  log("tries = 1 attempted once, no retry");

  return "retried to success, stopped at the cap, original error surfaced, tries=1 honored";
});
