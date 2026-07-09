/* TokenBucket — burst up to capacity, then a steady drip.

   The constructor is GIVEN: it starts the bucket full and ticks refill() on an
   interval. You write refill() and tryRemove().

   INVARIANT: tokens never exceed capacity — idle time buys at most `capacity`
   of future burst, never more (the ceiling IS the burst budget).
   DENY-AT-ZERO: tryRemove() at zero tokens returns false and spends nothing
   (no debt, no negative tokens).
*/
export class TokenBucket {
  constructor(capacity, refillMs) {
    this.capacity = capacity;
    this.tokens = capacity;                       // start full: one burst allowed
    setInterval(() => this.refill(), refillMs);
  }

  refill() {
    throw new Error("implement me");
  }

  tryRemove() {
    throw new Error("implement me");
  }
}
