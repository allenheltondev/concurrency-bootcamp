# Database Internals Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview and
the design review actually ask for: **writing the pattern from a blank file,
test-driven, in a real editor.**

No dependencies. Node ≥ 20. Plain ESM. Nothing here imports anything you have
to install, and there is no server to start — everything is simulated
in-process and deterministic. "The disk" is an array of records, "a page" is
an object with a sorted keys array, "a transaction id" is an integer, "a
connection" is a string. No Postgres install, no wall-clock time, no
randomness: the same run every time, so a red test is always YOUR bug.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes** (run from the `database-internals/`
   directory):
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read the
   failure, it is written to teach ("committed means a commit record exists in
   the log — nothing else counts").
5. **Diff against the reference** once you pass:
   ```
   diff <(sed -n '/./p' practice/<name>.mjs) practice/solutions/<name>.mjs
   ```
   or just open `solutions/<name>.mjs` side by side. Note the ONE thing you
   missed or did the long way.
6. **Reset and re-do from blank tomorrow.** `git checkout practice/<name>.mjs`
   restores the skeleton. A pattern you can only assemble is not yet a pattern
   you can write; a pattern you can write cold, twice, on two different days,
   is yours.

Run the whole pack at once:

```bash
for f in practice/*.test.mjs; do node "$f"; done
```

## Layout

```
practice/
  README.md              this file
  _harness.mjs           sleep, deferred, and the suite() runner
  <name>.mjs             the skeleton you write into (signature + spec + "implement me")
  <name>.test.mjs        the runnable spec: node practice/<name>.test.mjs
  solutions/<name>.mjs   the reference — for diffing AFTER you pass, not before
```

The harness prints each `log` line, then `✓ PASS — <verdict>` or
`✗ FAIL — <message>`, sets a non-zero exit code on failure, and fails any
suite that hangs past 5s with a deadlock message. A skeleton you haven't
touched fails cleanly with a "not implemented yet" line — no stack-trace mess.

## The patterns, in learning order

Learn them **durability → storage structures → concurrency → operations**:
first make a crash survivable, then organize data so reads are cheap, then let
transactions share the data without seeing each other's mess, then share the
database itself.

### Durability — the log is the database

- **wal** — write-ahead log with replay and checkpoint: `recover()` applies a
  transaction's writes only if a commit record exists anywhere in the log — a
  tx that began and wrote but never committed leaves no trace (that is
  atomicity), and a checkpoint compacts history without changing what
  recovery answers.

### Storage structures — sorted data, split pages, layered tables

- **btree-node** — a sorted leaf page: binary-searchable keys, insert in
  place, and the split — upper half moves to a new right sibling, the
  separator is the right node's smallest key, and no key is ever lost or
  duplicated.
- **lsm-store** — memtable + SSTables newest-first: the first table that
  contains a key decides, deletes are tombstones that shadow older values,
  and compaction merges everything down without changing a single `get()`
  answer.
- **bloom-filter** — k hash positions per key, `mightContain` true only if
  ALL are set: "maybe here" can lie, "definitely not here" never does — no
  false negatives, ever.

### Concurrency — who sees what, who waits for whom

- **mvcc-store** — snapshot visibility: a version is visible if you wrote it
  yourself, or its creator committed before your snapshot and wasn't
  in-progress at snapshot time. The snapshot decides, not read time — a
  commit that lands mid-transaction changes nothing you see.
- **lock-manager** — async row locks with FIFO hand-off and deadlock
  detection: the lock is never observably free while a waiter exists, and a
  request that would close a wait-for cycle throws `DeadlockError` instead of
  hanging forever.

### Operations — sharing the database itself

- **connection-pool** — a fixed set of connections, FIFO waiters, direct
  hand-off: a released connection reaches the oldest waiter before it ever
  returns to idle, and `stats()` stays exact through an acquire/release storm.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an
empty editor, because assembling from a line bank hides the two hardest steps:
recalling the *shape* and typing the *load-bearing detail* (the commit-record
scan BEFORE replay, the `Math.ceil(keys.length / 2)` split point, the
newest-first probe order, the `xmin < snapshot.xmax` comparison, the hand-off
that names the new holder before its promise resolves). The test is your pair;
the blank file is the interview.
