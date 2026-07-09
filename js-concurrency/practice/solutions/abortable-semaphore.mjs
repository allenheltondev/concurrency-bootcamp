/* Semaphore — abortable waits, direct handoff. Reference solution. */
export class Semaphore {
  #permits;
  #waiters = [];

  constructor(n) {
    this.#permits = n;
  }

  acquire(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);   // never queue
    if (this.#permits > 0) { this.#permits--; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const waiter = { resolve };
      const onAbort = () => {
        const i = this.#waiters.indexOf(waiter);
        if (i !== -1) this.#waiters.splice(i, 1);   // remove the slot: no leak, no ghost wake
        reject(signal.reason);
      };
      waiter.cleanup = () => signal && signal.removeEventListener("abort", onAbort);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      this.#waiters.push(waiter);
    });
  }

  release() {
    const w = this.#waiters.shift();   // aborted waiters already spliced themselves out
    if (w) { w.cleanup(); w.resolve(); }  // hand the permit straight over
    else this.#permits++;                 // otherwise return it to the pool
  }
}
