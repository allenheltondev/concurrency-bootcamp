/* OrderedMerger — watermark k-way merge. Reference solution. */
export class OrderedMerger {
  #emit;
  #buffers;
  #open;

  constructor(producerCount, emit) {
    this.#emit = emit;
    this.#buffers = Array.from({ length: producerCount }, () => []);
    this.#open = new Array(producerCount).fill(true);
  }

  push(p, item) {
    this.#buffers[p].push(item);
    this.#drain();
  }

  end(p) {
    this.#open[p] = false;   // a drained, ended producer stops gating the watermark
    this.#drain();
  }

  #drain() {
    for (;;) {
      let best = -1;
      for (let i = 0; i < this.#buffers.length; i++) {
        const buf = this.#buffers[i];
        if (buf.length === 0) {
          if (this.#open[i]) return;   // open + empty: might still send a smaller ts — stall
          continue;                     // ended + drained: ignore
        }
        // strict < keeps the lowest index on a tie
        if (best === -1 || buf[0].ts < this.#buffers[best][0].ts) best = i;
      }
      if (best === -1) return;          // nothing left to emit
      this.#emit(this.#buffers[best].shift());
    }
  }
}
