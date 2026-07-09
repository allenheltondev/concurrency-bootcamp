/* Circuit breaker — closed, open, half-open. Reference solution. */
export class CircuitBreaker {
  #state = "closed"; #fails = 0; #openedAt = 0;

  constructor({ threshold = 3, cooldown = 50, now = Date.now } = {}) {
    this.threshold = threshold; this.cooldown = cooldown; this.now = now;
  }

  get state() { return this.#state; }

  async call(fn) {
    if (this.#state === "open") {
      if (this.now() - this.#openedAt < this.cooldown) throw new Error("open — fast fail");  // fn NOT invoked
      this.#state = "half-open";                       // cooldown elapsed: let ONE probe through
    }
    try {
      const v = await fn();
      this.#state = "closed"; this.#fails = 0;         // success closes and resets the streak
      return v;
    } catch (err) {
      this.#fails++;
      if (this.#state === "half-open" || this.#fails >= this.threshold) {
        this.#state = "open"; this.#openedAt = this.now();   // a failed probe re-opens on ONE strike
      }
      throw err;
    }
  }
}
