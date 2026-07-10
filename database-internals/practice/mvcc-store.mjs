/* MVCC store — snapshot visibility: the snapshot decides, not read time.

   begin(): assign xid = this.nextXid++, mark it "in-progress" in status and
   add it to active, then take the snapshot:
     { xmax: this.nextXid,                    // first UNASSIGNED xid
       inProgress: new Set(<the OTHER active xids>) }
   Return { xid, snapshot }.

   write(tx, key, val): push a version { key, val, xmin: tx.xid } — versions
   are never updated in place, only stacked.

   commit(tx) / abort(tx): set status to "committed" / "aborted" and drop the
   xid from active. Nothing is deleted — visibility does the hiding.

   read(tx, key): the NEWEST version of key visible to tx, or undefined.
   A version v is visible iff
     v.xmin === tx.xid                        // your own writes
   OR ( status of v.xmin is "committed"
        AND v.xmin < tx.snapshot.xmax         // assigned before your snapshot
        AND !tx.snapshot.inProgress.has(v.xmin) )  // and not in-flight then

   INVARIANT: a tx sees its own writes; it never sees uncommitted, aborted,
   or post-snapshot commits. A commit that lands AFTER your begin() changes
   nothing you read — the snapshot decides, not read time.
   EDGE: T1 begins; T2 begins, writes, commits; T1 reading AFTER T2's commit
   still sees the old value — while a fresh T3 sees the new one. And a tx
   that was in-progress when you began stays invisible even after it
   commits. */
"use strict";

export class MVCC {
  constructor() {
    this.nextXid = 1;
    this.versions = [];          // [{ key, val, xmin }] in write order
    this.status = new Map();     // xid -> "in-progress" | "committed" | "aborted"
    this.active = new Set();     // xids currently in progress
  }

  begin() {
    throw new Error("implement me");
  }

  write(tx, key, val) {
    throw new Error("implement me");
  }

  commit(tx) {
    throw new Error("implement me");
  }

  abort(tx) {
    throw new Error("implement me");
  }

  read(tx, key) {
    throw new Error("implement me");
  }
}
