import { suite, sleep } from "./_harness.mjs";
import { promiseAny } from "./promise-any.mjs";

suite("Promise.any — first fulfillment, else AggregateError", async ({ log, assert }) => {
  // First FULFILLMENT wins even when a faster promise rejects.
  const v = await promiseAny([
    sleep(20).then(() => "slow-ok"),
    sleep(5).then(() => { throw new Error("fast-fail"); }),
  ]);
  assert(v === "slow-ok", "the first FULFILLMENT wins; a faster rejection must be ignored (got " + v + ")");
  log("a fast rejection was ignored; the slower fulfillment won");

  // All rejected -> AggregateError, errors in INPUT order (not settle order).
  let agg = null;
  try {
    await promiseAny([
      sleep(10).then(() => { throw new Error("e0"); }),
      sleep(2).then(() => { throw new Error("e1"); }),
    ]);
  } catch (e) { agg = e; }
  assert(agg instanceof AggregateError, "all-rejected must throw an AggregateError");
  assert(agg.errors.map((e) => e.message).join(",") === "e0,e1",
    "errors must be in INPUT order, not settle order (got " + agg.errors.map((e) => e.message).join(",") + ")");
  log("all rejected -> AggregateError with errors in input order");

  // Empty input rejects immediately with an empty AggregateError.
  let empty = null;
  try { await promiseAny([]); } catch (e) { empty = e; }
  assert(empty instanceof AggregateError && empty.errors.length === 0,
    "empty input must reject with an empty AggregateError");
  log("empty input rejected with an empty AggregateError");

  // STRENGTHEN: a plain non-thenable value is an instant fulfillment.
  const plain = await promiseAny(["plain", sleep(5).then(() => "later")]);
  assert(plain === "plain", "a plain value must count as an instant fulfillment (got " + plain + ")");
  log("plain value passed through as a fulfillment");

  return "first fulfillment won over a faster rejection, all-rejected aggregated in input order, empty + plain handled";
});
