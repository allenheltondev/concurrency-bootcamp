/* promiseAny(promises) — Promise.any from scratch.

   Resolve with the FIRST fulfillment. If every input rejects, reject with an
   AggregateError whose .errors holds each rejection in INPUT order.

   INVARIANT: rejections are ignored while any input might still fulfill; only
   when the LAST one rejects do you give up.
   ERROR ORDER: errors[i] is input i's rejection reason, regardless of settle
   order — count rejections down, store by index.
   EDGE: an empty input rejects immediately with an empty AggregateError; plain
   (non-thenable) values count as instant fulfillments.
*/
export function promiseAny(promises) {
  return new Promise((resolve, reject) => {
    throw new Error("implement me");
  });
}
