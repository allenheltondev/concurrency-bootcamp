import { suite } from "./_harness.mjs";
import { RetryBudget } from "./retry-budget.mjs";

suite("retry budget — amplification capped by construction", ({ log, assert }) => {
  const b = new RetryBudget(0.1);
  assert(b.canRetry() === false, "no traffic -> no budget exists yet");

  for (let i = 0; i < 100; i++) b.onFirstTry();
  assert(b.canRetry() === true, "100 first tries at 10% -> retries available");

  let spent = 0;
  while (b.canRetry() && spent < 1000) { b.onRetry(); spent++; }
  assert(spent === 10, "hard outage: the budget grants exactly 10% of 100 = 10, got " + spent);
  assert(b.canRetry() === false, "budget exhausted — the storm stops here");
  log("outage: unlimited retries demanded, exactly " + spent + " granted");

  for (let i = 0; i < 50; i++) b.onFirstTry();
  assert(b.canRetry() === true, "fresh first-try traffic replenishes the budget");
  b.onRetry();
  assert(b.retries === 11 && b.firstTries === 150,
    "retries never count into the base: 11 retries / 150 first tries");
  log("150 first tries seen -> 15 total retries allowed, 11 spent");

  const strict = new RetryBudget(0.0);
  strict.onFirstTry();
  assert(strict.canRetry() === false, "ratio 0 means never retry — the budget honors it");
  return "offered load can never exceed (1 + ratio) × traffic — an invariant, not a hope";
});
