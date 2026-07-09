import { suite, sleep } from "./_harness.mjs";
import { promiseAll } from "./promise-all.mjs";

suite("Promise.all — input order, first rejection, empty", async ({ log, assert }) => {
  const slow = sleep(30).then(() => "slow");
  const fast = sleep(5).then(() => "fast");
  const out = await promiseAll([slow, fast, "plain"]);
  log("mixed inputs resolved to: [" + out.join(", ") + "]");
  assert(out.length === 3 && out[0] === "slow" && out[1] === "fast" && out[2] === "plain",
    "values must keep INPUT order even when they settle out of order (and plain values pass through)");

  const none = await promiseAll([]);
  assert(Array.isArray(none) && none.length === 0, "an empty array must resolve immediately with []");
  log("empty array resolved immediately");

  // STRENGTHEN: an all-plain-values input (no thenables) still resolves in order.
  const plains = await promiseAll([1, 2, 3]);
  assert(plains.join(",") === "1,2,3", "an all-plain-values input must resolve in input order");
  log("all-plain input resolved in order");

  let err = null;
  try { await promiseAll([sleep(5).then(() => "ok"), sleep(10).then(() => { throw new Error("boom"); })]); }
  catch (e) { err = e; }
  assert(err && err.message === "boom", "one rejection must reject the whole thing with that error");
  log("first rejection propagated");

  return "order preserved under out-of-order completion, empty + all-plain handled, rejection propagated";
});
