/* AsyncQueue — producer/consumer handoff. Reference solution. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export class AsyncQueue {
  #items = [];
  #waiters = [];

  push(item) {
    const w = this.#waiters.shift();
    if (w) w.resolve(item);        // hand straight to a parked consumer
    else this.#items.push(item);   // otherwise buffer it
  }

  async pop() {
    if (this.#items.length > 0) return this.#items.shift();  // buffered value
    const d = deferred();
    this.#waiters.push(d);         // park until a push wakes us with the item
    return d.promise;
  }
}
