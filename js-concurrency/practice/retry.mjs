/* retry(fn, tries, baseMs) — bounded retry with exponential backoff.

   Call fn up to `tries` times. Success returns its value immediately. Each
   failure before the last waits baseMs * 2^(attempt-1), then retries; the
   final failure rethrows the ORIGINAL error.

   INVARIANT: fn is called at most `tries` times — exactly `tries` when it
   always fails, fewer once it succeeds.
   THE TRAP: you must `await fn()` INSIDE the try — without the await the
   rejection settles after you've left the try block and the catch never runs.
   Bind the error (catch (err)) so the last failure has something to rethrow.
*/
export async function retry(fn, tries, baseMs) {
  throw new Error("implement me");
}
