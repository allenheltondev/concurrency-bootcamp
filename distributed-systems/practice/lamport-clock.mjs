/* LamportClock — one scalar counter that orders events across nodes.

   Physical clocks disagree; a Lamport clock only promises ORDER: if event a
   happened-before event b, then L(a) < L(b). tick() counts a local event;
   stamp() counts the send and returns the value to put on the wire; now()
   just reads — it must not advance anything.

   INVARIANT: recv(remote) sets the clock to max(local, remote) + 1 — so every
   message's receive timestamp is strictly greater than its send timestamp,
   even when the receiver's clock is already AHEAD of the sender's.
   EDGE: a receiver that is ahead must still move PAST its own value — the
   receive is itself an event, so the +1 applies after the max, always.
*/
export class LamportClock {
  #t = 0;

  tick() {
    throw new Error("implement me");
  }

  stamp() {
    throw new Error("implement me");
  }

  recv(remote) {
    throw new Error("implement me");
  }

  now() {
    throw new Error("implement me");
  }
}
