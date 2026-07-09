import { suite } from "./_harness.mjs";
import { VectorClock, vcCompare } from "./vector-clock.mjs";

suite("Vector clocks — element-wise max, then your own slot; compare finds concurrency", async ({ log, assert }) => {
  const A = new VectorClock(0, 2), B = new VectorClock(1, 2);

  const a1 = A.tick();                   // [1,0]
  const b1 = B.tick();                   // [0,1]
  assert(a1.join(",") === "1,0" && b1.join(",") === "0,1", "tick must increment only your OWN slot — A=[" + a1 + "], B=[" + b1 + "]");
  log("A=[" + a1 + "] vs B=[" + b1 + "] -> " + vcCompare(a1, b1));
  assert(vcCompare(a1, b1) === "concurrent", "two independent local events disagree in both directions — they must compare as concurrent");

  const m = A.stamp();                   // [2,0] on the wire
  const b2 = B.recv(m);                  // max([0,1],[2,0]) = [2,1], then own slot -> [2,2]
  log("A sends [" + m + "]; B merges to [" + b2 + "]");
  assert(b2.join(",") === "2,2", "recv must take the element-wise max FIRST, then increment slot 1 — expected [2,2], got [" + b2 + "] (incrementing before the max double-counts)");
  assert(vcCompare(m, b2) === "before", "the send is causally before the merged receive");
  assert(vcCompare(b2, m) === "after", "…and the receive after the send — compare must work in both directions");
  assert(vcCompare(b2, b2.slice()) === "equal", "identical vectors must compare as equal");

  const a2 = A.tick();                   // [3,0] — A forked off after the send
  log("A ticks to [" + a2 + "] vs B's [" + b2 + "] -> " + vcCompare(a2, b2));
  assert(vcCompare(a2, b2) === "concurrent", "after the message, each side won a slot — the fork must read as concurrent again");

  // STRENGTHEN: causality is transitive across a 3-node chain.
  const X = new VectorClock(0, 3), Y = new VectorClock(1, 3), Z = new VectorClock(2, 3);
  const z0 = Z.tick();                   // [0,0,1] — Z acts before hearing anything
  const mx = X.stamp();                  // [1,0,0]
  Y.recv(mx);                            // [1,1,0]
  const my = Y.stamp();                  // [1,2,0]
  const z1 = Z.recv(my);                 // max([0,0,1],[1,2,0]) + own = [1,2,2]
  log("X -> Y -> Z: Z ends at [" + z1 + "]");
  assert(z1.join(",") === "1,2,2", "two-hop merge must land at [1,2,2] — got [" + z1 + "]");
  assert(vcCompare(mx, z1) === "before", "X's send reaches Z through Y — before must hold transitively");
  assert(vcCompare(z0, mx) === "concurrent", "Z's early event never reached X — they must stay concurrent");

  // STRENGTHEN: a returned stamp is a snapshot, not the live vector.
  const snap = A.stamp();
  A.tick();
  assert(snap.join(",") === "4,0", "a later local event mutated a message already sent — tick/stamp/recv must return a COPY");
  log("stamp stayed [" + snap + "] after a later tick — copies, not references");

  return "concurrency detected, merges maxed-then-counted, causality held transitively, and stamps were snapshots";
});
