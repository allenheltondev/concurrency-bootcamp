/* Write-ahead log — replay, atomicity, checkpoint.

   The log is an ordered array of plain records:
     { tx, op: "begin" } / { tx, op: "set", key, val } / { tx, op: "commit" }
     { op: "checkpoint", state }   // state is a Map — the committed snapshot

   INVARIANT: recover() returns a Map equal to exactly the committed history —
   replay records in order, applying a "set" ONLY if its transaction has a
   commit record ANYWHERE in the log. Committed means a commit record exists
   in the log — nothing else counts. A tx that began and wrote but never
   committed leaves no trace (atomicity). recover() must not mutate the log:
   recovery is a read, and it can happen twice.

   checkpoint() compacts: compute the committed state, then replace
   this.records with a single { op: "checkpoint", state } record — so a later
   recover() replays the snapshot first, then any transactions that committed
   after the checkpoint on top of it.

   EDGE: interleaved transactions; writes appended after a checkpoint by a tx
   that commits later; recover() while an uncommitted tail is still present —
   that IS the crash. */
"use strict";

export class WAL {
  constructor() {
    this.records = [];
  }

  begin(tx) {
    throw new Error("implement me");
  }

  set(tx, key, val) {
    throw new Error("implement me");
  }

  commit(tx) {
    throw new Error("implement me");
  }

  recover() {
    throw new Error("implement me");
  }

  checkpoint() {
    throw new Error("implement me");
  }
}
