/* Reorderer — hold out-of-order arrivals, release the contiguous prefix.

   class Reorderer {
     constructor(emit)  // emit(item) called in seq order 0, 1, 2, ...
     push(seq, item)    // arbitrary arrival order, each seq exactly once
   }

   INVARIANT: emit is called strictly in seq order starting at 0, with no gaps.
   HOLD-AND-RELEASE: buffer whatever arrives; after each arrival, flush every
   item that now sits at the next-expected seq — a WHILE loop, not an if, since
   one gap-filler can release a long run held behind it.
*/
export class Reorderer {
  constructor(emit) {
    this.emit = emit;
  }

  push(seq, item) {
    throw new Error("implement me");
  }
}
