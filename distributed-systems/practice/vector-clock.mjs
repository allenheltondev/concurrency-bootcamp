/* VectorClock — one counter per node; compare detects what Lamport can't.

   Node `id` of `n` keeps a vector v where v[i] counts the events it has seen
   from node i. Its own slot is the only one it increments directly.

   INVARIANT: recv(remote) merges element-wise max FIRST, then increments the
   node's OWN slot — the receive is itself an event, counted after the merge,
   never before.
   COMPARE: vcCompare(a, b) returns "equal" if identical, "before" if a <= b
   in every slot (and not equal), "after" if a >= b everywhere, and
   "concurrent" if each side wins somewhere. Concurrency is the whole point:
   vectors that disagree in both directions are causally unrelated.
   EDGE: tick/stamp/recv return a COPY of the vector — hand out the live
   array and a later local event rewrites messages already sent.
*/
export class VectorClock {
  constructor(id, n) { this.id = id; this.v = new Array(n).fill(0); }

  tick() {
    throw new Error("implement me");
  }

  stamp() {
    throw new Error("implement me");
  }

  recv(remote) {
    throw new Error("implement me");
  }
}

export function vcCompare(a, b) {
  throw new Error("implement me");
}
