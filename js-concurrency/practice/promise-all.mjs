/* promiseAll(promises) — Promise.all from scratch.

   Resolve with every value at its INPUT index. Reject as soon as any input
   rejects. Accept plain (non-thenable) values too. Handle the empty array.

   INVARIANT: results[i] holds input i's value regardless of settle order.
   Count settlements DOWN — do not trust array length (a preallocated array
   already has the final length).
   EDGE: [] resolves immediately with []; a rejection propagates the first
   error and later settlements are ignored.
*/
export function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    throw new Error("implement me");
  });
}
