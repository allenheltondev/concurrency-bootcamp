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

  // Hand-off must RE-POINT the surviving waiters' edges at the new holder —
  // stale edges at the old holder fake cycles that aren't there and hide real ones.
  const lm2 = new LockManager();
  await lm2.acquire("t3", "S");                       // t3 holds S first
  await lm2.acquire("t1", "R");
  const h2 = lm2.acquire("t2", "R");                  // t2 waits on t1
  const h3 = lm2.acquire("t3", "R");                  // t3 waits on t1 (while holding S)
  lm2.release("t1", "R");                             // hand-off: t2 holds R; t3 must now wait on t2
  await h2;

  // false-positive check: t1 -> S(held by t3); the truthful chain t3 -> t2 ends at
  // a non-waiter — a STALE t3 -> t1 edge would close a phantom cycle and throw here
  let sGranted = false;
  const h1S = lm2.acquire("t1", "S").then(() => { sGranted = true; });
  await sleep(0);
  assert(!sGranted && (lm2.locks.get("S") || { queue: [] }).queue.length === 1,
    "t1 waiting on S is a plain chain (t1->t3->t2, and t2 waits on nobody) — a DeadlockError here " +
    "means release() left t3's wait-for edge pointing at the OLD holder");

  // missed-real-cycle check: t2 (new holder of R) -> S(held by t3) while t3 -> R(held by t2)
  let boom2 = null;
  try {
    await lm2.acquire("t2", "S");
  } catch (e) {
    boom2 = e;
  }
  assert(boom2 instanceof DeadlockError,
    "t2->t3 (S) while t3->t2 (R, after the hand-off) IS a cycle — missing it here means the " +
    "wait-for graph still shows t3 waiting on t1; both transactions would hang forever");

  lm2.release("t2", "R");                             // victim aborts: t3 gets R…
  await h3;
  lm2.release("t3", "S");                             // …finishes, releases S: t1 gets it
  await h1S;
  assert(sGranted && lm2.holderOf("S") === "t1", "the parked chain must drain cleanly after the abort");

  log("FIFO grants [" + grants + "]; the A/B cycle threw DeadlockError; the survivor got B after the abort");
  log("hand-off re-pointed the wait-for edges: no phantom cycle for t1, the real t2/t3 cycle caught");
  return "no barging, no starvation, honest wait-for edges — cycles throw instead of hanging";
});
