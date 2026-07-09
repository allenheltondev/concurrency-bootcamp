import { suite } from "./_harness.mjs";
import { Replica, QuorumStore } from "./quorum-store.mjs";

suite("Quorum store — R + W > N means the read overlaps the write", async ({ log, assert }) => {
  const reps = [new Replica("A"), new Replica("B"), new Replica("C")];
  const store = new QuorumStore(reps, 2, 2);       // N=3, W=2, R=2

  const w1 = await store.put("cart", "v1");
  assert(w1.acks === 3 && w1.version === 1, "all replicas up: expected 3 acks at version 1 — got " + w1.acks + " acks, version " + w1.version);

  reps[1].up = false;                              // B misses the write
  const w2 = await store.put("cart", "v2");
  log("write v2 with B down: " + w2.acks + "/3 acks (W=2) — accepted at version " + w2.version);
  assert(w2.acks === 2, "one replica down must not sink the write — allSettled, count the fulfilled (got " + w2.acks + ")");
  assert(w2.version === 2 && w2.version > w1.version, "versions must be monotonic per store — got " + w1.version + " then " + w2.version);

  reps[1].up = true;                               // stale B returns…
  reps[0].up = false;                              // …and fresh A goes away
  const r = await store.get("cart");
  log('read with A down hits stale B (v1) + fresh C (v2) -> "' + (r && r.value) + '"');
  assert(r && r.value === "v2" && r.version === 2, "R+W>N forced C into the read quorum — the HIGHEST version must win, not the first or loudest reply");

  // W unreachable: the write must THROW, not half-succeed silently.
  reps[2].up = false;                              // only B is up now
  let werr = null;
  try { await store.put("other", "x"); } catch (e) { werr = e; }
  assert(werr, "1 ack < W=2 — the write must throw, not pretend it stuck");
  log("write with 1/3 up threw: " + werr.message);

  // R unreachable: same rule on the read side.
  let rerr = null;
  try { await store.get("cart"); } catch (e) { rerr = e; }
  assert(rerr, "1 reply < R=2 — the read must throw rather than answer from too few replicas");
  log("read with 1/3 up threw: " + rerr.message);

  // STRENGTHEN: a replica applies last-writer-wins by version — late, out-of-order
  // delivery of an OLD record must not roll the value back.
  const solo = new Replica("S");
  await solo.put("k", { value: "new", version: 5 });
  await solo.put("k", { value: "old", version: 3 });
  const kept = solo.peek("k");
  log('replica got version 5 then a late version 3 — kept "' + kept.value + '"');
  assert(kept.value === "new" && kept.version === 5, "a stale record overwrote a newer one — replicas must keep the highest version");

  // STRENGTHEN: down means silence, and peek bypasses the network.
  solo.up = false;
  let derr = null;
  try { await solo.get("k"); } catch (e) { derr = e; }
  assert(derr, "a down replica must throw — not answer null, not answer stale");
  assert(solo.peek("k") && solo.peek("k").value === "new", "peek is test-only and skips the network — it must still see the data while the replica is down");
  log("down replica threw on get; peek still saw the data");

  return "the write survived a down replica, the read overlapped it and returned the newest version, and sub-quorum ops refused to lie";
});
