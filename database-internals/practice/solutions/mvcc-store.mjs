/* MVCC store — reference solution. */
"use strict";

export class MVCC {
  constructor() {
    this.nextXid = 1;
    this.versions = [];
    this.status = new Map();
    this.active = new Set();
  }

  begin() {
    const xid = this.nextXid++;
    this.status.set(xid, "in-progress");
    this.active.add(xid);
    const inProgress = new Set(this.active);
    inProgress.delete(xid);                      // the OTHER active xids
    const snapshot = { xmax: this.nextXid, inProgress };
    return { xid, snapshot };
  }

  write(tx, key, val) {
    this.versions.push({ key, val, xmin: tx.xid });
  }

  commit(tx) {
    this.status.set(tx.xid, "committed");
    this.active.delete(tx.xid);
  }

  abort(tx) {
    this.status.set(tx.xid, "aborted");
    this.active.delete(tx.xid);
  }

  visible(tx, v) {
    if (v.xmin === tx.xid) return true;          // your own writes
    return this.status.get(v.xmin) === "committed"
      && v.xmin < tx.snapshot.xmax               // assigned before the snapshot
      && !tx.snapshot.inProgress.has(v.xmin);    // and not in-flight back then
  }

  read(tx, key) {
    for (let i = this.versions.length - 1; i >= 0; i--) {   // newest visible wins
      const v = this.versions[i];
      if (v.key === key && this.visible(tx, v)) return v.val;
    }
    return undefined;
  }
}
