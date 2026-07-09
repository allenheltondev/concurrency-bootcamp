/* IdempotentConsumer — at-least-once delivery in, effectively-once effect out.

   The network retries: a lost ack means the same message arrives twice. The
   consumer's job is to make the EFFECT happen once per message id no matter
   how many times the message shows up.

   INVARIANT: handle(msg) applies the effect and returns true exactly once per
   msg.id; every redelivery of that id returns false and applies nothing.
   `applied` counts effects, not deliveries.
   EDGE: record the id the moment you apply — a consumer that applies first
   and records later has a window where a duplicate charges twice.
   EDGE: dedupe is by id, forever — a redelivery arriving long after
   unrelated traffic is still a duplicate.
*/
export class IdempotentConsumer {
  #seen = new Set();
  applied = 0;

  handle(msg) {                         // msg = {id, ...}
    throw new Error("implement me");
  }
}
