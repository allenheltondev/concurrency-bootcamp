/* Reorderer — hold-and-release contiguous prefix. Reference solution. */
export class Reorderer {
  #emit;
  #next = 0;
  #held = new Map();

  constructor(emit) {
    this.#emit = emit;
  }

  push(seq, item) {
    this.#held.set(seq, item);
    while (this.#held.has(this.#next)) {     // WHILE: one filler can release a run
      this.#emit(this.#held.get(this.#next));
      this.#held.delete(this.#next);
      this.#next++;
    }
  }
}
