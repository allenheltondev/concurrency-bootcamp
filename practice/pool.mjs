/* mapPool(items, limit, fn) — run fn over every item with at most `limit`
   in flight, returning results in INPUT order.

   INVARIANT: at no instant are more than `limit` calls to fn in flight.
   ORDER: results[i] corresponds to items[i], regardless of finish order.
   EACH-ONCE: fn runs exactly once per item.
   EDGE: an empty items array resolves to []; limit > items.length still works
   (you never start more workers than there are items).

   Shape hint the interviewer wants to see: a shared cursor + a handful of
   workers that loop claiming the next index.
*/
export async function mapPool(items, limit, fn) {
  throw new Error("implement me");
}
