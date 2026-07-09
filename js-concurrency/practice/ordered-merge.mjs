/* OrderedMerger — k-way merge of timestamped streams under a watermark.

   class OrderedMerger {
     constructor(producerCount, emit)  // emit(item) gets items in global ts order
     push(p, item)                     // item has .ts; each producer's own
                                       //   pushes arrive in ts order
     end(p)                            // producer p will push nothing more
   }

   INVARIANT (the watermark): you may emit the smallest buffered head only when
   EVERY still-open producer has something buffered — an open producer with an
   empty buffer might still send a smaller ts, so it stalls all emission. A
   producer that has ended AND drained no longer counts toward that gate.
   TIES: equal ts breaks toward the LOWEST producer index.
   end(p) re-triggers draining (it may unblock a stall).
*/
export class OrderedMerger {
  constructor(producerCount, emit) {
    this.producerCount = producerCount;
    this.emit = emit;
  }

  push(p, item) {
    throw new Error("implement me");
  }

  end(p) {
    throw new Error("implement me");
  }
}
