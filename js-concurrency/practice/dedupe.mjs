/* dedupe(fn) — share one in-flight promise per key.

   Wrap an async fn so concurrent calls with the same key share ONE in-flight
   promise. When it settles, EVICT that key so a later call fetches fresh.
   Other keys are untouched.

   INVARIANT: at most one call to fn per key is in flight at a time.
   LIFETIME = SEMANTICS: set the entry on launch, delete THAT key on settle
   (success OR failure). Forget the eviction and you built an unbounded cache;
   evict too broadly (clear all) and you un-dedupe everyone else.
   THE TRICK: cache the PROMISE, not the resolved value.
*/
export function dedupe(fn) {
  throw new Error("implement me");
}
