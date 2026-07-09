import { suite } from "./_harness.mjs";
import { IdempotentConsumer } from "./idempotent-consumer.mjs";

suite("Idempotent consumer — every id applies exactly once", async ({ log, assert }) => {
  const c = new IdempotentConsumer();
  assert(c.handle({ id: "chg-1" }) === true, "first delivery of chg-1 must apply and return true");
  assert(c.handle({ id: "chg-2" }) === true, "a different id is not a duplicate — chg-2 must apply");
  assert(c.handle({ id: "chg-1" }) === false, "chg-1's ack was lost and the sender retried — the redelivery must return false");
  assert(c.applied === 2, "applied counts EFFECTS, not deliveries — 3 deliveries of 2 ids must apply 2, got " + c.applied);
  log("3 deliveries (chg-1 twice) -> " + c.applied + " effects");

  // STRENGTHEN: duplicates interleaved across many ids — each redelivery lands
  // after OTHER messages, not right behind its original.
  const c2 = new IdempotentConsumer();
  const stream = [];
  for (let i = 0; i < 8; i++) {
    stream.push({ id: "m" + i });                          // first delivery of m<i>
    if (i > 0) stream.push({ id: "m" + (i - 1) });         // previous id redelivered, interleaved
  }
  const applied = stream.filter((m) => c2.handle(m)).length;
  log(stream.length + " interleaved deliveries of 8 distinct ids -> " + c2.applied + " effects");
  assert(applied === 8 && c2.applied === 8, "8 distinct ids must apply exactly 8 times no matter how the duplicates interleave — got " + c2.applied);

  // STRENGTHEN: a redelivery arriving long AFTER other traffic is still a duplicate.
  const late = c2.handle({ id: "m0" });
  assert(late === false && c2.applied === 8, "m0 came back after 14 other deliveries — dedupe has no expiry, it must still be dropped");
  log("late redelivery of m0: dropped");

  return "at-least-once delivery in, exactly-once effect out — interleaved and late duplicates were all dropped";
});
