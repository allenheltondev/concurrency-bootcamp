/* Write-ahead log — reference solution. */
"use strict";

export class WAL {
  constructor() {
    this.records = [];
  }

  begin(tx) {
    this.records.push({ tx, op: "begin" });
  }

  set(tx, key, val) {
    this.records.push({ tx, op: "set", key, val });
  }

  commit(tx) {
    this.records.push({ tx, op: "commit" });
  }

  recover() {
    const committed = new Set();                 // scan for commit records FIRST
    for (const r of this.records) {
      if (r.op === "commit") committed.add(r.tx);
    }
    const state = new Map();
    for (const r of this.records) {              // then replay, in order
      if (r.op === "checkpoint") {
        for (const [k, v] of r.state) state.set(k, v);
      } else if (r.op === "set" && committed.has(r.tx)) {
        state.set(r.key, r.val);                 // committed writes only
      }
    }
    return state;
  }

  checkpoint() {
    const state = this.recover();                // the committed past folds into the snapshot…
    const committed = new Set();
    for (const r of this.records) {
      if (r.op === "commit") committed.add(r.tx);
    }
    const inFlight = this.records.filter(        // …but open transactions must keep their
      (r) => r.tx !== undefined && !committed.has(r.tx));  // records — they may still commit
    this.records = [{ op: "checkpoint", state }, ...inFlight];
  }
}
