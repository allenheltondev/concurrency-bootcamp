/* CircuitBreaker — stop hammering a dependency that is already down.

   Three states. closed: calls pass through; count CONSECUTIVE failures and
   trip to open at `threshold`. open: while now() - openedAt < cooldown,
   throw immediately WITHOUT calling fn — that fast-fail is the whole point.
   After the cooldown, half-open: let exactly one probe through — success
   closes the breaker and resets the failure count; failure re-opens it (one
   strike, not a full `threshold` streak) and restarts the cooldown.

   INVARIANT: while open and inside the cooldown, fn is never invoked.
   INVARIANT: a success in the closed state resets the consecutive-failure
   count — only an unbroken streak trips the breaker.
   CLOCK: `now` is injected — the breaker asks it for the time, so tests
   drive time by hand instead of sleeping.
*/
export class CircuitBreaker {
  #state = "closed"; #fails = 0; #openedAt = 0;

  constructor({ threshold = 3, cooldown = 50, now = Date.now } = {}) {
    this.threshold = threshold; this.cooldown = cooldown; this.now = now;
  }

  get state() {
    throw new Error("implement me");    // just return the private state field
  }

  async call(fn) {
    throw new Error("implement me");
  }
}
