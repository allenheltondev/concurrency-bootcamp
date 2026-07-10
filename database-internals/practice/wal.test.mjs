import { suite } from "./_harness.mjs";
import { WAL } from "./wal.mjs";

suite("WAL — replay equals the committed history, before and after checkpoint", ({ log, assert }) => {
  const w = new WAL();

  // Two interleaved transactions; only t1 has committed so far. recover() here
  // answers "what would a crash at this instant leave behind?" — t2 stays open.
  w.begin("t1");
  w.begin("t2");
  w.set("t1", "a", 1);
  w.set("t2", "b", 2);          // t2 wrote to the log...
  w.set("t1", "c", 3);
  w.commit("t1");               // ...but only t1 has a commit record

  const crash1 = w.recover();
  log("crash with an uncommitted tail -> recovered { " +
    [...crash1].map(([k, v]) => k + ":" + v).join(", ") + " }");
  assert(crash1 instanceof Map, "recover() must return a Map of the committed state");
  assert(crash1.get("a") === 1 && crash1.get("c") === 3,
    "every write of a COMMITTED tx must survive replay — durability is the whole point of the log");
  assert(!crash1.has("b"),
    "t2 never committed — committed means a commit record exists in the log, nothing else counts; " +
    "an uncommitted tx must leave no trace (atomicity)");

  const before = w.records.length;
  w.recover();
  assert(w.records.length === before,
    "recover() must not mutate the log — recovery is a read, and it can happen twice");

  // Checkpoint: compact the log without changing what recovery answers —
  // and without discarding t2, which is still in flight.
  const beforeCp = w.records.length;
  w.checkpoint();
  assert(w.records[0].op === "checkpoint",
    "checkpoint() must put the {op:\"checkpoint\", state} snapshot at the head of the log");
  assert(w.records.length < beforeCp,
    "checkpoint() must compact — the committed history folds into the snapshot");
  assert(w.records.some((r) => r.tx === "t2"),
    "t2 was still OPEN at the checkpoint — its records must survive the compaction, or its " +
    "later commit silently loses every pre-checkpoint write");
  const afterCp = w.recover();
  assert(afterCp.get("a") === 1 && afterCp.get("c") === 3 && !afterCp.has("b"),
    "recover() must answer identically before and after checkpoint — compaction changes cost, never truth");

  // The in-flight tx commits AFTER the checkpoint: its pre-checkpoint writes must land.
  w.commit("t2");
  const late = w.recover();
  assert(late.get("b") === 2,
    "t2 wrote before the checkpoint and committed after it — the checkpoint may fold in only " +
    "the COMMITTED past, never a transaction that might still commit");

  // Life goes on after the checkpoint: t3 commits, t4 crashes mid-flight.
  w.begin("t3");
  w.set("t3", "a", 9);          // overwrites the checkpointed value
  w.set("t3", "d", 4);
  w.commit("t3");
  w.begin("t4");
  w.set("t4", "e", 5);          // t4 never commits — this IS the crash

  const crash2 = w.recover();
  log("post-checkpoint commit + uncommitted tail -> recovered { " +
    [...crash2].map(([k, v]) => k + ":" + v).join(", ") + " }");
  assert(crash2.get("a") === 9,
    "a tx committing after the checkpoint must replay ON TOP of the snapshot — newest committed write wins");
  assert(crash2.get("c") === 3 && crash2.get("d") === 4 && crash2.get("b") === 2,
    "the checkpointed state, the tx that straddled the checkpoint, and the post-checkpoint " +
    "commits must ALL survive");
  assert(!crash2.has("e"),
    "t4 began and wrote after the checkpoint but never committed — atomicity does not expire at a checkpoint");

  return "replay rebuilt exactly the committed history — through interleaving, a checkpoint, and two crashes";
});
