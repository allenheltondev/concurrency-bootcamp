import { suite } from "./_harness.mjs";
import { LSM, TOMBSTONE } from "./lsm-store.mjs";

suite("LSM store — newest-first reads, tombstones shadow, compaction changes nothing", ({ log, assert }) => {
  const db = new LSM(2);   // flush every 2 memtable entries

  db.put("a", 1);
  db.put("b", 2);          // memtable hits 2 -> auto-flush
  assert(db.sstables.length === 1 && db.memtable.size === 0,
    "put() must auto-flush when the memtable reaches flushAt entries");

  db.put("a", 10);         // overwrite spanning flushes — both versions now exist
  db.put("c", 3);          // -> second auto-flush
  assert(db.sstables.length === 2, "two flushes must stack two SSTables (index 0 = newest)");

  assert(db.get("a") === 10,
    "reads probe NEWEST-first — the old a:1 in the older table must be shadowed by a:10");
  assert(db.get("b") === 2,
    "a key present only in the OLDEST table must still be found — the probe walks all the way down");
  assert(db.get("nope") === undefined, "a key in no table reads as undefined");

  db.del("b");             // a delete is a WRITE of TOMBSTONE
  assert(db.memtable.get("b") === TOMBSTONE,
    "del() must WRITE the exported TOMBSTONE into the memtable — deleting the key locally would let " +
    "the old b:2 in a lower layer come back from the dead");
  assert(db.get("b") === undefined,
    "a tombstone in a newer layer must shadow the live b:2 below it — deletes cannot just remove the key, " +
    "the older tables still remember it");
  db.put("d", 4);          // memtable (tombstone + d) hits 2 -> third flush
  assert(db.sstables.length === 3 && db.memtable.size === 0, "the tombstone flushes like any other entry");

  db.put("e", 5);          // one memtable entry — must survive compaction untouched
  const answers = ["a", "b", "c", "d", "e", "nope"].map((k) => db.get(k));

  db.compact();
  log("compacted 3 SSTables -> " + db.sstables.length + ", memtable untouched (" + db.memtable.size + " entry)");
  assert(db.sstables.length === 1, "compact() must merge ALL SSTables into one");
  assert(db.memtable.size === 1 && db.memtable.get("e") === 5,
    "compact() works on SSTables only — the memtable must be untouched");

  const after = ["a", "b", "c", "d", "e", "nope"].map((k) => db.get(k));
  assert(answers.join("|") === after.join("|"),
    "get() must answer identically before and after compact() — compaction is an optimization, " +
    "not a semantic event. before [" + answers + "] after [" + after + "]");
  assert(db.get("a") === 10, "the newest version must win the merge — a:1 resurfacing means the merge ran oldest-last");
  assert(!db.sstables[0].has("b"),
    "a key whose surviving value is TOMBSTONE must be dropped ENTIRELY — after the merge there is " +
    "nothing left to shadow, and immortal tombstones are a storage leak");
  assert(db.sstables[0].get("c") === 3 && db.sstables[0].get("d") === 4,
    "live keys from every layer must survive the merge");

  return "newest write shadowed older ones, the tombstone deleted across layers, and compaction changed no answer";
});
