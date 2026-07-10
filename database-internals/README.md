# Database Internals Bootcamp

A mobile-first, dependency-free web app for learning and practicing **database
internals** — built from the course pattern extracted in
`../docs/COURSE_PATTERN.md`, sharing the root course's engine, styles, and
animations. Everything runs in the browser: every drill's ▶ button executes a
**real simulated storage engine** (a disk with an fsync boundary, a WAL that
replays, MVCC snapshots, row-lock queues, a lagging replica) against its
invariant, and every write-it build actually runs in a sandboxed worker.

It opens with an illustrated **Lessons** primer (26 stepped chapters with
animated HTML/CSS/SVG diagrams — tap ▶ replay to watch each sequence step
through), starting with a four-lesson **foundations** arc built on the two
axioms that generate the whole field — the disk can fail between any two
writes, and readers and writers overlap in time — through the page/heap-file
model of a table, sequential vs random I/O, and what a commit actually
guarantees (durability is the WAL fsync, not the data-page write). Then arcs
on **storage engines** (the write-ahead log and crash recovery, B-trees and
leaf splits, LSM trees with memtables/SSTables/bloom filters/compaction,
B-tree vs LSM as "pick your amplification", and the buffer pool with the
cold-cache restart problem), **indexing** (what an index buys and costs on
every write, composite indexes and the leftmost-prefix rule, covering indexes
and index-only scans with the visibility-map fine print, selectivity and why
the planner ignoring your index is usually correct, and the predicates that
can't use an index at all), **transactions** (what ACID actually promises,
MVCC with xmin/xmax and snapshots, the anomaly zoo with a money-losing
scenario per anomaly, the isolation ladder and exactly which anomaly each
level kills — Postgres semantics, with the MySQL InnoDB differences named —
row locks and `SELECT … FOR UPDATE`, deadlocks and the wait-for cycle, and
optimistic vs pessimistic concurrency), and **operations** (connection
pooling and why max_connections isn't throughput, the N+1 problem, reading a
query plan and hunting the rows-estimate lie, zero-downtime migrations via
expand–contract, and replication lag with read-your-writes routing).

Then the hands-on modules, one concept per animated lesson and one drill per
concept: **predict the outcome** (a scenario-first quiz — commits vs power
loss, racing refunds, planner choices, deadlocks), **primitives**
(tap-to-choose drills that run real reference code — WAL commit path, B-tree
leaf split, LSM read path, bloom filter, MVCC visibility, row-lock queue,
deadlock detector, version CAS), the **isolation-anomaly simulator** (two
concurrent transactions on a tiny bank ledger — pick lost update / write skew
/ inconsistent read, flip the isolation level, and step through the
interleaving watching which anomaly corrupts the invariant, driven by a real
snapshot + first-updater-wins + SSI model), **trade-offs** flashcards, a
**problem bank** (crash-recovery replay, lost update, write skew, phantom
inserts, expand–contract ordering, N+1, pool exhaustion, read-your-writes
routing), **spot-the-bug** (full implementations, one subtle fault — an ack
before the fsync, a `>` on a snapshot boundary, a release outside the
finally — tap the line), **write it** (assemble each implementation from a
shuffled line bank — graded by actually running it against assertions in a
sandboxed worker), a **Postgres map** reference sheet (every concept mapped
to the construct that embodies it — pg_wal, shared_buffers, EXPLAIN ANALYZE,
pgbouncer, CONCURRENTLY, pg_last_wal_replay_lsn — each with an interview
bridge line), and **test mode** (quick test / full test / 25-minute interview
sim, each ending in a build round; missed questions persist to a review
list).

Finally, `practice/` takes it off the phone and into your editor: seven
blank-file pattern skeletons (write-ahead log with replay + checkpoint,
B-tree node search/insert/split, LSM store with tombstones + compaction,
bloom filter, MVCC store with snapshot visibility, lock manager with FIFO
hand-off + deadlock detection, connection pool) with runnable Node tests and
reference solutions — `node practice/wal.test.mjs`, implement until green,
diff against the solution, redo from blank tomorrow.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup + all CSS (same design system as the root course). No build step. |
| `js/core.js` | Helpers, the simulated storage-engine reference implementations, and the demo runners. |
| `js/content.js` | Course config + authored content: modules, quiz, drills, cards, bugs, write-it, lessons 1–4, cross-links. |
| `js/sim.js` | The isolation-anomaly simulator module. |
| `js/packs/10-…, 20-…, 30-…, 40-…` | Lesson packs: storage engines, indexing, transactions, operations arcs. |
| `js/packs/50-hunt-build.js` | The rest of spot-the-bug and write-it. |
| `js/packs/60-postgres-map.js` | The Postgres map sheet and four flashcards. |
| `../js/app.js` | The shared course engine (see `../docs/COURSE_PATTERN.md`). |
| `practice/` | Blank-file pattern reps with runnable Node tests. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-first PWA shell, scoped to this directory. |

## Validate

From the repo root:

```bash
node tools/validate-content.mjs --root database-internals
node tools/test-solutions.mjs   --root database-internals
```

Both run in CI; a drill demo that fails its invariant, a write-it reference
that fails its own tests, or a broken practice pair cannot merge.

Progress is saved to `localStorage` under the `dbi:` prefix — independent of
the other courses. No accounts required, no tracking; installable and fully
offline after first load, same as the root course.
