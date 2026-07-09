/* Saga — steps forward, compensations in reverse. Reference solution. */
export class Saga {
  #steps = [];

  step(name, action, compensate) {
    this.#steps.push({ name, action, compensate });
    return this;                         // chainable
  }

  async run(log = []) {
    const done = [];
    for (const s of this.#steps) {
      try {
        await s.action();                // one at a time, in declaration order
        log.push("ok:" + s.name);
        done.push(s);                    // only COMPLETED steps earn a compensation
      } catch (e) {
        for (const d of done.reverse()) {          // unwind newest-first — the failed step isn't in `done`
          await d.compensate();
          log.push("undo:" + d.name);
        }
        return { ok: false, log };       // a failed saga is a result, not an exception
      }
    }
    return { ok: true, log };
  }
}
