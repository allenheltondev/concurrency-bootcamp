/* Mutex — direct-handoff lock. Reference solution. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export class Mutex {
  #locked = false;
  #queue = [];

  async acquire() {
    if (!this.#locked) { this.#locked = true; return; }
    const d = deferred();
    this.#queue.push(d);      // park until someone hands me the lock
    await d.promise;
  }

  release() {
    const next = this.#queue.shift();
    if (next) next.resolve();  // hand the lock straight over — stays #locked
    else this.#locked = false; // only now is it observably free
  }
}
