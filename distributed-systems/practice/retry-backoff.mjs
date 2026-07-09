/* retryBackoff(fn, opts) — exponential backoff, capped, with optional full jitter.

   Call fn until it succeeds or `tries` attempts have failed. Between
   failures, wait via the injected `wait` for:
     ceiling = min(cap, base * 2^(attempt-1))          — exponential, capped
     jitter on: floor(random() * ceiling)              — full jitter, uniform in [0, ceiling)

   INVARIANT: fn is called at most `tries` times; the final failure rethrows
   the LAST error (the freshest evidence), with no wait after it.
   INVARIANT: `wait` and `random` are injected — time is a parameter, not a
   side effect, so tests and simulations run in zero wall-clock time.
   THE TRAP: `await fn()` INSIDE the try — without the await the rejection
   settles after you've left the try block and the catch never fires.
*/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function retryBackoff(fn, { tries = 4, base = 8, cap = 1000, jitter = false, wait = sleep, random = Math.random } = {}) {
  throw new Error("implement me");
}
