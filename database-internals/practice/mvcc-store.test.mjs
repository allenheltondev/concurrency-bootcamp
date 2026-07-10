import { suite } from "./_harness.mjs";
import { MVCC } from "./mvcc-store.mjs";

suite("MVCC — the snapshot decides what you see, not read time", ({ log, assert }) => {
  const db = new MVCC();

  // Baseline: t0 writes and commits before anyone else begins.
  const t0 = db.begin();
  assert(t0.xid === 1 && typeof t0.snapshot === "object",
    "begin() must return { xid, snapshot } with xids assigned from nextXid");
  db.write(t0, "balance", 100);
  assert(db.read(t0, "balance") === 100, "a tx must see its OWN uncommitted writes");
  db.commit(t0);

  // THE edge: T1 begins, then T2 writes and commits — T1 must not notice.
  const t1 = db.begin();
  assert(t1.snapshot.xmax === 3,
    "the snapshot's xmax is the first UNASSIGNED xid at begin() — for the 2nd tx that is 3, got " + t1.snapshot.xmax);
  assert(db.read(t1, "balance") === 100, "t0 committed before t1's snapshot — its write must be visible");

  const t2 = db.begin();
  db.write(t2, "balance", 40);
  assert(db.read(t1, "balance") === 100, "t2 is uncommitted — no one else may see its write (no dirty reads)");
  db.commit(t2);

  assert(db.read(t1, "balance") === 100,
    "t1 reads AFTER t2's commit but t2's xid (" + t2.xid + ") >= t1's snapshot.xmax (" + t1.snapshot.xmax + ") — " +
    "the snapshot decides, not read time. Seeing 40 here is a non-repeatable read.");
  const t3 = db.begin();
  assert(db.read(t3, "balance") === 40,
    "a FRESH tx begins after t2's commit — its snapshot includes t2, so it must see 40");

  // Own writes shadow, but only for the writer.
  db.write(t1, "balance", 75);
  assert(db.read(t1, "balance") === 75, "a tx's own write is its newest visible version");
  assert(db.read(t3, "balance") === 40, "t1's uncommitted write must be invisible to everyone else");

  // Abort: the versions stay in the array; visibility hides them forever.
  db.abort(t1);
  const t4 = db.begin();
  assert(db.read(t4, "balance") === 40,
    "an aborted tx's versions are never visible — MVCC atomicity is a visibility rule, not an undo pass");

  // In-progress-at-snapshot: committed is necessary but NOT sufficient.
  const t5 = db.begin();
  db.write(t5, "quota", 9);
  const t6 = db.begin();          // t5 is active — it lands in t6's inProgress set
  assert(t6.snapshot.inProgress.has(t5.xid),
    "a snapshot must record the OTHER xids active at begin() — t5 belongs in t6's inProgress set");
  assert(!t6.snapshot.inProgress.has(t6.xid), "a tx is not in-progress to ITSELF — never snapshot your own xid");
  db.commit(t5);
  assert(db.read(t6, "quota") === undefined,
    "t5 committed and t5.xid < t6.snapshot.xmax — but t5 was IN PROGRESS when t6 began, " +
    "so its write stays invisible: all three visibility clauses must hold, not two");
  const t7 = db.begin();
  assert(db.read(t7, "quota") === 9, "a tx beginning after t5's commit sees it — the snapshot moved on");

  log("t1 kept reading 100 through t2's commit; t3 saw 40; t6 never saw the tx that was in flight when it began");
  return "own writes visible, uncommitted/aborted/post-snapshot writes never — the snapshot decided every read";
});
