/* Idempotent consumer — at-least-once in, effectively-once out. Reference solution. */
export class IdempotentConsumer {
  #seen = new Set();
  applied = 0;

  handle(msg) {                          // msg = {id, ...}
    if (this.#seen.has(msg.id)) return false;   // duplicate — drop it, forever
    this.#seen.add(msg.id);                     // record WITH the effect — no double-apply window
    this.applied++;
    return true;
  }
}
