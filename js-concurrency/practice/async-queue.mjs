/* AsyncQueue — producer/consumer handoff. pop() blocks for a value.

   INVARIANT: every pushed item is delivered EXACTLY ONCE — to a parked
   consumer if one is waiting, otherwise buffered. Never both, never neither.
   FIFO: buffered items come out in push order; parked consumers are woken in
   pop order.
   EDGE: pop() on an empty queue must PARK (return a pending promise), not
   return undefined.
*/
export class AsyncQueue {
  #items = [];
  #waiters = [];

  push(item) {
    throw new Error("implement me");
  }

  async pop() {
    throw new Error("implement me");
  }
}
