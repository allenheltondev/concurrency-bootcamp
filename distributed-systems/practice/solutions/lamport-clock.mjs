/* Lamport clock — max, then +1. Reference solution. */
export class LamportClock {
  #t = 0;

  tick() { return ++this.#t; }           // a local event counts
  stamp() { return ++this.#t; }          // the send counts too — this value goes on the wire
  recv(remote) {
    this.#t = Math.max(this.#t, remote) + 1;   // merge rule: max, THEN +1 — the receive is an event
    return this.#t;
  }
  now() { return this.#t; }              // read-only — never advances
}
