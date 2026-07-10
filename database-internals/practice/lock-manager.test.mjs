import { suite, sleep } from "./_harness.mjs";
import { LockManager, DeadlockError } from "./lock-manager.mjs";

suite("lock manager — FIFO hand-off, no barging, deadlock detected not served", async ({ log, assert }) => {
  const lm = new LockManager();

  // Free row: immediate grant. Same tx again: already yours.
  await lm.acquire("t1", "R");
  assert(lm.holderOf("R") === "t1", "acquiring a free row must record the holder");
  await lm.acquire("t1", "R");   // must not deadlock against itself

  // Two waiters park FIFO; a release hands off directly.
  const grants = [];
  const w2 = lm.acquire("t2", "R").then(() => grants.push("t2"));
  const w3 = lm.acquire("t3", "R").then(() => grants.push("t3"));
  await sleep(0);
  assert(grants.length === 0, "waiters must PARK while the row is held — nothing resolves early");

  lm.release("t1", "R");
  assert(lm.holderOf("R") === "t2",
    "release with waiters must hand off to the HEAD waiter synchronously — the lock is never " +
    "observably free while a waiter exists (holder was " + lm.holderOf("R") + ")");

  // A newcomer arriving in the hand-off instant must queue behind t3, not barge.
  const w4 = lm.acquire("t4", "R").then(() => grants.push("t4"));
  await sleep(0);
  assert(grants.join(",") === "t2", "only the head waiter may run after one release, got [" + grants + "]");
  lm.release("t2", "R");
  await sleep(0);
  lm.release("t3", "R");
  await Promise.all([w2, w3, w4]);
  assert(grants.join(",") === "t2,t3,t4",
    "grants must be FIFO — t4 arrived during the hand-off and must not barge past t3, got [" + grants + "]");
  lm.release("t4", "R");

  // THE deadlock: t1 holds A, t2 holds B; t1 waits for B; t2 asks for A.
  await lm.acquire("t1", "A");
  await lm.acquire("t2", "B");
  let t1HasB = false;
  const t1WaitsB = lm.acquire("t1", "B").then(() => { t1HasB = true; });
  await sleep(0);
  assert(!t1HasB, "t1 must wait for B — t2 still holds it");

  let boom = null;
  try {
    await lm.acquire("t2", "A");
  } catch (e) {
    boom = e;
  }
  assert(boom !== null,
    "t2 waiting for A while t1 (holder of A) waits for B (held by t2) is a wait-for CYCLE — " +
    "granting the wait means both hang forever; it must throw instead");
  assert(boom instanceof DeadlockError,
    "the cycle must be reported as a DeadlockError, got " + (boom && boom.name));
  assert((lm.locks.get("A") || { queue: [] }).queue.length === 0,
    "a deadlocked request must NOT be queued — parking it would leave a waiter nobody can ever wake");

  // The victim aborts: t2 releases B, and t1's parked acquire completes.
  lm.release("t2", "B");
  await t1WaitsB;
  assert(t1HasB && lm.holderOf("B") === "t1",
    "after the victim releases its lock, the survivor's parked acquire must be granted — " +
    "deadlock detection saves the OTHER transaction");

  log("FIFO grants [" + grants + "]; the A/B cycle threw DeadlockError; the survivor got B after the abort");
  return "no barging, no starvation, and the wait-for cycle threw instead of hanging";
});
