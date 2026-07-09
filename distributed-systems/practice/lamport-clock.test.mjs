import { suite } from "./_harness.mjs";
import { LamportClock } from "./lamport-clock.mjs";

suite("Lamport clock — max(local, remote) + 1 on every receive", async ({ log, assert }) => {
  const A = new LamportClock(), B = new LamportClock();

  A.tick();                              // A: local event -> 1
  const m1 = A.stamp();                  // A sends        -> 2
  assert(m1 === 2, "a tick then a stamp must advance A to 2 — got " + m1);

  B.tick(); B.tick(); B.tick();          // B is AHEAD of the sender: 3
  const atRecv = B.recv(m1);
  log("B at 3 receives a message stamped " + m1 + " -> " + atRecv);
  assert(atRecv === 4, "a receiver ahead of the sender must land at max(3,2)+1 = 4 — got " + atRecv + " (max alone is not enough; the receive is an event)");
  assert(atRecv > m1, "the receive timestamp must be strictly greater than the send timestamp");

  const m2 = B.stamp();                  // B replies -> 5
  const back = A.recv(m2);
  log("B replies stamped " + m2 + "; A merges -> " + back);
  assert(m2 === 5 && back === 6, "A behind the sender must land at max(2,5)+1 = 6 — got stamp " + m2 + ", recv " + back);
  A.now(); A.now();
  assert(A.now() === 6, "now() reads the clock — three reads in a row must not advance it (got " + A.now() + ")");

  // STRENGTHEN: along a causal chain the timestamps strictly increase, hop by hop.
  const C = new LamportClock(), D = new LamportClock();
  const chain = [];
  for (let i = 0; i < 3; i++) {
    const out = C.stamp();  chain.push(out, D.recv(out));
    const back2 = D.stamp(); chain.push(back2, C.recv(back2));
  }
  log("3 round trips C<->D: [" + chain.join(", ") + "]");
  const strict = chain.every((t, i) => i === 0 || t > chain[i - 1]);
  assert(strict, "every hop in a causal chain must carry a strictly larger timestamp — the chain above has a stall or a repeat");

  return "every receive landed after its send — happened-before survived, even with the receiver ahead of the sender";
});
