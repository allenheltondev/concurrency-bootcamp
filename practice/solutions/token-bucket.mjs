/* TokenBucket — capped drip refill. Reference solution. */
export class TokenBucket {
  constructor(capacity, refillMs) {
    this.capacity = capacity;
    this.tokens = capacity;
    setInterval(() => this.refill(), refillMs);
  }

  refill() {
    if (this.tokens < this.capacity) this.tokens++;  // drip one, but never past the ceiling
  }

  tryRemove() {
    if (this.tokens === 0) return false;             // empty: deny, spend nothing
    this.tokens--;
    return true;
  }
}
