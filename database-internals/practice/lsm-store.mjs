/* LSM store — memtable, SSTables newest-first, tombstones, compaction.

   Writes land in an in-memory Map (the memtable). When the memtable reaches
   flushAt entries it is flushed: frozen into an immutable SSTable pushed to
   the FRONT of this.sstables (index 0 is newest). A delete is a write of
   TOMBSTONE — it must shadow older values in older tables, so it cannot just
   remove the key.

   get(key): check the memtable first, then the sstables NEWEST-FIRST — the
   first table that contains the key decides, full stop. A value of TOMBSTONE
   reads as undefined. If no table has the key, undefined.

   compact(): merge ALL sstables into one — the newest version of each key
   wins; any key whose surviving value is TOMBSTONE is dropped entirely (the
   shadowed older values are gone, so the tombstone has nothing left to
   shadow). The memtable is untouched.

   INVARIANT: get() answers identically before and after compact(); the
   newest write always shadows older ones.
   EDGE: an overwrite spanning flushes (both values live in different
   tables); delete then compact then get; a key present only in the OLDEST
   table. */
"use strict";

export const TOMBSTONE = Symbol("tombstone");

export class LSM {
  constructor(flushAt) {
    this.flushAt = flushAt;
    this.memtable = new Map();
    this.sstables = [];   // [Map, ...] — index 0 is the NEWEST table
  }

  put(key, val) {
    throw new Error("implement me");
  }

  del(key) {
    throw new Error("implement me");
  }

  flush() {
    throw new Error("implement me");
  }

  get(key) {
    throw new Error("implement me");
  }

  compact() {
    throw new Error("implement me");
  }
}
