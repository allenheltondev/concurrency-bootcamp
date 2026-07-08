import { suite, sleep } from "./_harness.mjs";
import { TokenBucket } from "./token-bucket.mjs";

suite("Token bucket — capped drip, deny at zero", async ({ log, assert }) => {
  const b = new TokenBucket(3, 15);
  let granted = 0;
  for (let i = 0; i < 10; i++) if (b.tryRemove()) granted++;
  log("burst of 10 asks against capacity 3: " + granted + " granted");
  assert(granted === 3, "a fresh bucket of capacity 3 must grant exactly 3 of a burst of 10 (granted " + granted + ")");

  // STRENGTHEN: an empty bucket denies immediately and goes into no debt.
  assert(b.tryRemove() === false, "an empty bucket must deny — tryRemove() returns false");
  assert(b.tokens >= 0, "tokens must never go negative — deny-at-zero, no debt (tokens = " + b.tokens + ")");

  await sleep(50);                 // ~3 refill ticks
  let refilled = 0;
  for (let i = 0; i < 10; i++) if (b.tryRemove()) refilled++;
  log("after ~3 ticks: " + refilled + " granted");
  assert(refilled >= 2 && refilled <= 4, "about 3 tokens should have dripped back (got " + refilled + ")");

  await sleep(200);                // long quiet period: ~13 ticks
  let burst = 0;
  for (let i = 0; i < 10; i++) if (b.tryRemove()) burst++;
  assert(burst === 3, "tokens must cap at capacity during quiet periods - a burst of " + burst + " means the bucket overfilled");
  log("long quiet period: bucket capped at capacity");

  return "burst capped at capacity, tokens dripped back, quiet time never overfilled the bucket";
});
