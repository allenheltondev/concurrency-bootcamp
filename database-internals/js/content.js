"use strict";
/* Database Internals Bootcamp — authored content: course config, module
   registry, quiz, drills, flashcards, spot-the-bug cards, write-it exercises,
   lessons, cross-links.

   CONTENT PACKS: js/packs/*.js load AFTER this file and BEFORE the shared
   engine (../js/app.js). A pack appends content by pushing into these
   collections (LESSONS, QUIZ, DRILLS.<module>, CARDS, BUGHUNT, WRITE, MODULES)
   and cross-links live here against FINAL indices.

   LESSON PLAN (final indices — the lesson packs MUST keep this order):
     content.js  0-3   foundations
     pack 10     4-8   storage engines (WAL, B-tree, LSM, B-tree vs LSM, buffer pool)
     pack 20     9-13  indexing (cost, leftmost prefix, covering, selectivity, sargability)
     pack 30     14-20 transactions (ACID, MVCC, anomalies, ladder, locks, deadlocks, OCC)
     pack 40     21-25 operations (pooling, N+1, query plans, migrations, replication lag)
   Pack 50 appends BUGHUNT + WRITE; pack 60 splices the postgres-map sheet. */

/* course config: the engine reads storage keys and defaults here */
const COURSE = {
  id: "database-internals",
  storagePrefix: "dbi",
};

const MODULES = [
  { id:"learn", label:"lessons", type:"learn" },
  { id:"model", label:"predict", type:"lesson",
    eyebrow:"module 00", title:"Predict the outcome", conceptLesson:0,
    cardNote:"predict the outcome",
    poolTitle:"Predict what the database does", poolQuestion:"What actually happens?",
    lead:`Two axioms generate everything under <b style="color:var(--text)">BEGIN&hellip;COMMIT</b>: the disk can <b style="color:var(--text)">fail between any two writes</b>, and readers and writers <b style="color:var(--text)">overlap in time</b>. Every scenario below is one of those axioms wearing a production incident. Predict the outcome before you tap.`,
    sub:`One at a time — commit to an answer, read why, then step on. These are the calls you make in design reviews and 2 a.m. incidents.` },
  { id:"primitives", label:"primitives", type:"drills",
    eyebrow:"module 01", title:"Build the storage engine",
    lead:`The write-ahead log, B-tree splits, the LSM read path, bloom filters, MVCC visibility, row-lock queues, deadlock detection, version CAS. Each is a small rule that keeps a database correct while the disk fails and transactions collide. Choose the correct line at each decision point, then run the reference to watch the invariant hold on a simulated engine.` },
  { id:"isosim", label:"isolation sim", type:"sim", renderFn:"renderIsoSimModule",
    eyebrow:"module 02", title:"The anomaly simulator", conceptLesson:17 },
  { id:"tradeoffs", label:"trade-offs", type:"cards",
    eyebrow:"module 03", title:"Trade-offs", conceptLesson:7,
    lead:`No code here — just the judgment calls that separate running a database from designing on top of one. Tap to flip, then advance. Rehearse until they're reflexive.` },
  { id:"bank", label:"problem bank", type:"drills",
    eyebrow:"module 04", title:"Problem bank",
    lead:`The failures the primitives exist to prevent — crash recovery, lost updates, write skew, phantoms, migration ordering, N+1, pool exhaustion, stale replicas. Each one names a production symptom; state the invariant in your head before you choose.` },
  { id:"bughunt", label:"spot the bug", type:"bugs",
    eyebrow:"module 05", title:"Spot the bug",
    lead:`A full component — the commit path, the visibility check, the pool wrapper, the retry loop — with one scenario describing how it misbehaves in production and one subtle fault hiding in the implementation. Read the whole thing, tap the buggy line(s), then check.`,
    sub:`Reading real code and finding the fault is the actual job. One implementation at a time — read the scenario, scan the code, pick the line(s), then check.` },
  { id:"write", label:"write it", type:"write",
    eyebrow:"module 06", title:"Write it",
    lead:`No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the implementation, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.`,
    sub:`This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. A runaway loop just times out — the sandbox can't freeze the page.` },
  { id:"test", label:"test yourself", type:"test",
    eyebrow:"test yourself", title:"Test mode",
    lead:`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`,
    sub:`Prep tip: once you can pass these cold, rebuild each pattern in a blank file while talking it through out loud — that's the skill the interview actually grades.` },
];

/* ---- model module: predict-the-outcome quiz ---- */
const QUIZ = [
  { code:`-- the app logs "payment 4831 committed" at 14:02:11.
-- at 14:02:12 the rack loses power. the data page holding
-- the payment row was never written to disk.
-- after restart: SELECT * FROM payments WHERE id = 4831;`,
    options:["one row — recovery replays the WAL from the last checkpoint and rebuilds the page; COMMIT meant the log records were fsynced, not the page",
             "zero rows — the page never reached disk, so the write is gone; the app must re-submit",
             "depends on whether the background writer got to the page in time — it's a race"],
    answer:0,
    whys:[
      "Right. Durability lives in the write-ahead log: COMMIT returned only after the WAL records (including the commit record) were fsynced. On restart, redo replay reapplies them to the stale page. The data-page write is an optimization deferred to the background — it was never the promise.",
      "That's the mental model that makes engineers add app-level double-writes and 'verify after commit' reads. The page IS gone — and it doesn't matter, because the log survived and recovery's whole job is rebuilding pages from it.",
      "There is no race, by design: the WAL-before-ack ordering makes the background writer's timing irrelevant to durability. If commit's fsync happened, the row is recoverable, full stop. If commit hadn't returned, the app couldn't have logged success."] },

  { code:`-- two support agents refund the same $100 order at once.
-- each handler runs (READ COMMITTED, the default):
--   bal = SELECT balance FROM merchants WHERE id = 9   -- both read 500
--   UPDATE merchants SET balance = $app_computed        -- 500 - 100
--   COMMIT`,
    options:["final balance 400 — one refund's debit is silently gone; each UPDATE wrote an app-computed value from a stale read",
             "final balance 300 — READ COMMITTED makes the second UPDATE wait, re-read, and recompute",
             "the second COMMIT fails with a serialization error and must be retried"],
    answer:0,
    whys:[
      "Right. This is the lost update. The second UPDATE does wait for the first's row lock — but then it just writes the value YOUR code computed from the pre-refund read. Nothing re-runs your arithmetic. Fix: SET balance = balance - 100 (the database re-evaluates against the current row), or SELECT ... FOR UPDATE, or a version-column CAS.",
      "READ COMMITTED re-reads the row for the UPDATE's own WHERE clause and expressions — it cannot reach into your application variable. balance = balance - 100 would land at 300; balance = $stale_value lands wherever the stale math says.",
      "Serialization errors (40001) are a REPEATABLE READ / SERIALIZABLE mechanism. READ COMMITTED never raises one for this — it resolves the conflict by silently letting the second write win. That silence is the bug."] },

  { code:`-- users(email) has a B-tree index. the query:
SELECT * FROM users
WHERE email LIKE '%@gmail.com';
-- 40M rows, ~30% match. what does the planner do?`,
    options:["sequential scan — a B-tree seeks by sorted prefix, and '%@gmail.com' has no left anchor; there's nothing to seek to",
             "index scan — LIKE on an indexed column always uses the index",
             "index scan, but only if you rebuild the index with a higher fillfactor"],
    answer:0,
    whys:[
      "Right. The index is sorted by email from the FIRST character; a pattern starting with % matches entries scattered everywhere in that order. No contiguous run to seek — so the planner reads the heap. (A left-anchored 'ann%' can seek; a suffix search wants a reversed-column expression index or trigram index.)",
      "The index stores emails in sorted order — useful exactly when the predicate pins down a sorted range. '%@gmail.com' pins nothing: 'a@gmail.com' and 'z@gmail.com' live at opposite ends. The planner knows and won't pretend otherwise.",
      "fillfactor changes page packing density, not the fundamental problem: there is no prefix to seek on. No storage parameter makes an unanchored pattern seekable."] },

  { code:`-- POST /profile saves the new bio to the primary,
-- then redirects to GET /profile, which load-balances
-- reads across two async replicas.
-- the user's browser follows the redirect in 40ms.`,
    options:["the user may see their OLD bio — the replica serving the GET hasn't replayed the write yet; refresh 'fixes' it",
             "the user always sees the new bio — replication is synchronous within a transaction",
             "the GET fails with an error until the replicas catch up"],
    answer:0,
    whys:[
      "Right. Async replicas acknowledge nothing at commit time; they replay WAL when it arrives. 40ms is routinely inside the lag window. The fix is read-your-writes routing: pin post-write reads to the primary for a beat, or track the commit LSN and only use replicas that have replayed past it.",
      "Only if you configured synchronous replication (and even synchronous_commit=on with a sync standby guarantees the WAL is RECEIVED, not applied — remote_apply is the level that makes reads see it). Default streaming replication is asynchronous.",
      "Replicas happily answer with the data they have — that's the whole problem. Nothing marks their answer as stale; the read succeeds, convincingly, with old data."] },

  { code:`-- index: CREATE INDEX ON events (customer_id, created_at);
-- query:
SELECT * FROM events
WHERE created_at > now() - interval '1 hour';`,
    options:["the index can't seek this — created_at is the SECOND column; without a customer_id predicate the matches are scattered across the whole index",
             "the index works fine — created_at is in the index, order doesn't matter",
             "the index works if you add ORDER BY created_at to the query"],
    answer:0,
    whys:[
      "Right. The composite index is sorted by customer_id first; within each customer, by created_at. Last hour's events exist inside EVERY customer's section — there's no single contiguous run. Leftmost prefix rule: you need a separate (created_at) index, or index (created_at, customer_id) if this query dominates.",
      "Order is the entire data structure. (customer_id, created_at) is a phone book sorted by last name then first — 'everyone named with first name Ann' can't be looked up, only scanned.",
      "ORDER BY changes what order results come back in, not whether the index can locate the matching rows. The seek problem is in the WHERE clause."] },

  { code:`-- a nightly analytics transaction has been open for 6 hours.
-- meanwhile the app UPDATEs the same hot table constantly,
-- and autovacuum runs on schedule.
-- table size: growing steadily. why?`,
    options:["the old snapshot pins the cleanup horizon — vacuum cannot remove row versions the 6-hour transaction might still read, so dead versions accumulate",
             "autovacuum is broken and needs a manual VACUUM FULL",
             "UPDATEs grow a table by design; size only shrinks on TRUNCATE"],
    answer:0,
    whys:[
      "Right. Every UPDATE creates a new row version; the old ones are only reclaimable once NO live snapshot can see them. A 6-hour transaction holds a 6-hour-old snapshot, so vacuum politely skips everything newer — bloat, index bloat, and xid-wraparound pressure follow. Long transactions are a whole-cluster tax.",
      "Autovacuum is running fine — and truthfully reporting it can't remove tuples 'yet'. Killing the long transaction releases the horizon and the next vacuum reclaims the backlog. VACUUM FULL is a lock-everything rewrite you almost never want on a hot table.",
      "Steady-state UPDATE churn on a vacuumed table reuses freed space and stays roughly flat. Unbounded growth under churn means reclamation stopped — and the usual reason is a snapshot nobody closed."] },

  { code:`-- worker A:                     worker B:
BEGIN;                          BEGIN;
UPDATE accts SET .. WHERE id=1; UPDATE accts SET .. WHERE id=2;
UPDATE accts SET .. WHERE id=2; UPDATE accts SET .. WHERE id=1;
COMMIT;                         COMMIT;`,
    options:["a deadlock: each waits for the other's row; after deadlock_timeout (~1s) the detector aborts one with 40P01 and the other commits",
             "both block forever — the DBA must kill one session by hand",
             "the second worker's UPDATEs are automatically reordered to match the first's"],
    answer:0,
    whys:[
      "Right. A holds row 1 and wants 2; B holds 2 and wants 1 — a cycle in the wait-for graph. Postgres checks for cycles after deadlock_timeout and cancels one victim ('deadlock detected', SQLSTATE 40P01). Your job: retry the victim, and prevent recurrence by locking rows in one canonical order (ORDER BY id).",
      "That was life before deadlock detectors. Every serious engine breaks the cycle itself — the pathology isn't the hang, it's that the app treats 40P01 as a crash instead of a retry.",
      "The database executes your statements in the order you send them. Nothing rewrites your transaction's access order — that discipline (sort the ids before you lock) is exactly what the application owes."] },

  { code:`-- rule: an account pair may overdraw one side if the
-- combined balance stays >= 0. both txs run REPEATABLE READ:
-- T1: reads checking=60, savings=60 -> 120 >= 100 -> checking -= 100
-- T2: reads checking=60, savings=60 -> 120 >= 100 -> savings  -= 100
-- both COMMIT. combined balance?`,
    options:["-80 — write skew: the reads overlapped but the writes touched different rows, so snapshot isolation sees no conflict and both commit",
             "20 — the second commit fails the first-updater-wins check and retries",
             "-80 is impossible — REPEATABLE READ guarantees the invariant"],
    answer:0,
    whys:[
      "Right. Snapshot isolation's conflict check fires only when two transactions write the SAME row. Here each wrote its own row; the constraint they jointly violated lived in what they READ. That's write skew — the anomaly snapshot isolation is famous for missing. SERIALIZABLE (SSI) detects the read-write cycle and aborts one.",
      "First-updater-wins compares write sets. checking vs savings — no overlap, no error. The check you're thinking of would have saved you if both had debited the same row; that's the lost-update case, one rung down the ladder.",
      "REPEATABLE READ guarantees your READS are stable, not that your constraints hold across concurrent transactions. The isolation level that actually promises 'as if one at a time' is SERIALIZABLE — and it keeps the promise by aborting."] },

  { code:`-- p99 latency is climbing under load. the team raises the
-- app's connection pool from 100 to 300 against one Postgres
-- (16 cores). throughput...`,
    options:["drops, and p99 gets worse — 300 active backends on 16 cores buys context-switching, lock contention, and buffer thrash, not throughput",
             "triples — three times the connections, three times the parallelism",
             "is unchanged, but now nothing ever queues"],
    answer:0,
    whys:[
      "Right. A Postgres connection is a backend process; past a small multiple of core count, added concurrency just makes every query slower while holding locks longer — a feedback loop. Queue in the APP (small pool + waiters) instead of inside the database. The classic sizing start: cores × 2-ish, then measure.",
      "Parallelism is bounded by cores and I/O, not by connection count. The extra 200 connections don't add capacity; they add schedulers fighting, shared_buffers churn, and longer lock hold times — which is why p99 was climbing in the first place.",
      "The queue doesn't disappear — it moves inside the database, where waiting is far more expensive (each waiter is a full process holding memory and possibly locks). An app-side queue is cheap; a DB-side pileup is the incident."] },

  { code:`-- 200M-row users table, live traffic. the deploy runs:
CREATE UNIQUE INDEX users_email_idx ON users (email);
-- what happens to the app while it builds (~20 min)?`,
    options:["every INSERT/UPDATE/DELETE on users blocks for the whole build — plain CREATE INDEX takes a lock that allows reads but not writes",
             "nothing — index builds are always online operations",
             "reads block too; the table is fully locked"],
    answer:0,
    whys:[
      "Right. Plain CREATE INDEX holds a SHARE lock: reads proceed, writes queue for 20 minutes — which at web traffic means every request that touches users piles up until timeouts cascade. Online path: CREATE UNIQUE INDEX CONCURRENTLY (slower, can't run in a transaction block, leaves an INVALID index to drop and retry if it fails).",
      "Only with CONCURRENTLY, which exists precisely because the default is not online. It's a deliberate trade: the concurrent build scans the table twice and waits out every transaction, so it's slower — but the app stays up.",
      "Reads are fine under SHARE — that's the trap, actually: the deploy 'looks okay' in a read-heavy staging test, then melts production write traffic."] },

  { code:`-- flash sale, last unit of sku 77. two checkouts race:
-- both run: stock = SELECT stock WHERE id=77   -- both read 1
--           if (stock > 0)
--             UPDATE skus SET stock = 0 WHERE id = 77
-- (READ COMMITTED, no FOR UPDATE, no version column)`,
    options:["both checkouts succeed and you sold 2 of the last unit — the check-then-write raced; each UPDATE happily set 0",
             "the second UPDATE fails because stock is already 0",
             "the second transaction deadlocks with the first"],
    answer:0,
    whys:[
      "Right. Both handlers passed the app-side check against stock=1, and 'SET stock = 0' succeeds regardless of the current value. This is check-then-act with the check outside the database's protection. Fixes, pick one: UPDATE ... SET stock = stock - 1 WHERE id = 77 AND stock > 0 (check the rowcount!), SELECT ... FOR UPDATE before deciding, or a version-column CAS.",
      "SET stock = 0 doesn't examine the current value — an UPDATE isn't an assertion. Move the guard into the statement (AND stock > 0) and check rows-affected; 0 rows means you lost the race, honestly.",
      "A deadlock needs two locks acquired in conflicting order. Here there's one row: the second UPDATE simply waits for the first's lock, then applies. It works perfectly; it's just wrong."] },

  { code:`-- orders has 5M rows; status='active' matches ~92% of them.
-- there's an index on (status). EXPLAIN shows:
--   Seq Scan on orders (rows=4.6M)   -- planner skips the index
-- is the planner wrong?`,
    options:["no — reading 92% of the table via index means a random heap hop per row; the sequential scan reads fewer pages, in order, and wins",
             "yes — an index is always faster than reading the whole table; the stats are stale",
             "yes — it should have used an index-only scan"],
    answer:0,
    whys:[
      "Right. An index scan pays a random page fetch per matching row: ~4.6M scattered reads dwarf one pass over the table's pages. Indexes win on SELECTIVE predicates (rules of thumb start around single-digit percents). The planner is doing page math, and its math is right — put your energy into queries that select less.",
      "Stale stats produce wrong ROW ESTIMATES; the estimate here (4.6M of 5M) is plainly sane. 'Index always faster' is the single most expensive folk belief in database performance — selectivity decides, not the existence of the index.",
      "An index-only scan needs the query's columns to live in the index (this is SELECT *) and the visibility map to be current — and it would still visit ~92% of the index plus most heap pages. The scan shape isn't the problem; the predicate keeps almost everything."] },
];

/* ---- drill definitions (fill the blank) ---- */
const DRILLS = {
  primitives:[
    { id:"walwrite", title:"WAL Commit Path", why:"the disk can fail between any two writes — order yours accordingly", demo:demoWalWrite,
      pre:`// the client is waiting on COMMIT. tx.changes = [{key, val}].
// disk.append() buffers; disk.fsync() makes buffered records durable;
// pages.set() updates the (volatile until flushed) data page cache.
function commit(tx) {`,
      blank:{ q:"Power can fail after ANY line. Which ordering lets you tell the client \"committed\" and still be right after every possible crash?",
        options:[
`  for (const w of tx.changes)
    disk.append({ txid: tx.id, ...w });
  disk.append({ txid: tx.id, commit: true });
  disk.fsync();
  ack(tx.id);
  for (const w of tx.changes)
    pages.set(w.key, w.val);   // lazily, later`,
`  for (const w of tx.changes)
    pages.set(w.key, w.val);
  ack(tx.id);
  disk.append({ txid: tx.id, commit: true });
  disk.fsync();                // background, eventually`,
`  for (const w of tx.changes)
    disk.append({ txid: tx.id, ...w });
  disk.append({ txid: tx.id, commit: true });
  ack(tx.id);
  disk.fsync();`],
        answer:0,
        whys:["Right. Log the intent, log the commit record, fsync, and only then ack — the data pages can wait forever, because replay can rebuild them from the durable log. One sequential fsync is the entire synchronous cost of the commit.",
              "Ack against volatile page-cache state: a crash after the ack and before the background fsync silently erases a confirmed commit. Your customer saw 'payment confirmed'; recovery has never heard of them. This exact ordering bug is why WAL-first exists.",
              "So close — the records are appended but ack fires BEFORE fsync, and appended-not-synced lives in the OS write cache. Power loss in that window loses an acknowledged commit. The fsync is the promise; everything before it is intention."] },
      post:`}` },

    { id:"btreesplit", title:"B-tree Leaf Split", why:"the tree stays balanced because splits go UP, never down", demo:demoBtreeSplit,
      pre:`// insert has landed in the right leaf and it's now over
// capacity (order = max keys). the leaf must split.
function splitLeaf(leaf) {`,
      blank:{ q:"The leaf holds [10,20,25,30,40] at order 4. Which split keeps every key findable by a parent that routes k ≥ separator to the right child?",
        options:[
`  const mid = Math.ceil(leaf.keys.length / 2);
  const right = { keys: leaf.keys.slice(mid) };
  leaf.keys = leaf.keys.slice(0, mid);
  return { sep: right.keys[0], right };`,
`  const right = { keys: [leaf.keys.pop()] };
  return { sep: right.keys[0], right };`,
`  const mid = Math.ceil(leaf.keys.length / 2);
  const right = { keys: leaf.keys.slice(mid) };
  leaf.keys = leaf.keys.slice(0, mid);
  return { sep: leaf.keys[0], right };`],
        answer:0,
        whys:["Right. Halve the keys, hand the upper half to a new sibling, and push the right sibling's FIRST key up as the separator. The parent's rule 'k ≥ sep goes right' now finds every key, and both halves have room to absorb future inserts.",
              "Splitting off only the largest key produces a lopsided tree that re-splits on nearly every insert to that leaf — the classic append-workload degeneration. Half-and-half is what buys the amortized O(1) splits and the guaranteed fill factor.",
              "The separator is the LEFT leaf's first key here — so the parent routes k ≥ 10 to the right child, which doesn't hold 10, 20, or 25. Every key in the left half just became unreachable. The separator must be the smallest key of the RIGHT node."] },
      post:`}` },

    { id:"lsmread", title:"LSM Read Path", why:"a key lives in many tables — only one answer is current", demo:demoLsmRead,
      pre:`// writes went to the memtable; full memtables were flushed as
// immutable SSTables. this.sstables[0] is the NEWEST (flush
// unshifts). deletes are TOMBSTONE values. now read:
get(key) {`,
      blank:{ q:"user:7 was written in an old SSTable, overwritten in a newer one, and other keys were deleted since. Which body always returns the current truth?",
        options:[
`  if (this.memtable.has(key))
    return live(this.memtable.get(key));
  for (const t of this.sstables)      // newest -> oldest
    if (t.has(key)) return live(t.get(key));
  return undefined;`,
`  let found;
  for (const t of this.sstables)      // collect from all tables
    if (t.has(key)) found = t.get(key);
  if (this.memtable.has(key))
    found = this.memtable.get(key);
  return live(found);`,
`  for (const t of this.sstables)
    if (t.has(key)) return live(t.get(key));
  if (this.memtable.has(key))
    return live(this.memtable.get(key));
  return undefined;`],
        answer:0,
        whys:["Right. Memtable first (the newest possible version), then SSTables newest-to-oldest, and the FIRST hit wins — newer versions and tombstones shadow everything beneath them. Stop at the first hit and correctness comes free.",
              "This walks the array from index 0 (newest) and keeps OVERWRITING found — so the oldest table that has the key wins. Every overwrite reverts, every delete resurrects. (And it probes every table even after finding the answer — read amplification for free, on top of being wrong.)",
              "SSTables before the memtable means a key you wrote milliseconds ago reads as its old flushed value — read-your-own-write breaks. The memtable is the newest data in the system; it goes first, always."] },
      post:`}
// live(v): v === TOMBSTONE ? undefined : v` },

    { id:"bloom", title:"Bloom Filter Check", why:"\"definitely not here\" lets a read skip a whole file", demo:demoBloom,
      pre:`// one filter per SSTable. add(key) set k = 3 bit positions:
//   bits[hash(key, i) % m] = 1   for i in 0..2
// the read path skips the SSTable when this returns false:
mightContain(key) {`,
      blank:{ q:"A false positive costs one wasted probe. A false negative loses a row forever. Which check is the one you can ship?",
        options:[
`  for (let i = 0; i < this.k; i++)
    if (this.bits[hash(key, i) % this.m] === 0)
      return false;
  return true;`,
`  for (let i = 0; i < this.k; i++)
    if (this.bits[hash(key, i) % this.m] === 1)
      return true;
  return false;`,
`  return this.bits[hash(key, 0) % this.m] === 1;`],
        answer:0,
        whys:["Right. Membership requires ALL k bits: add() set every one of them, so a single zero proves the key was never added — a guaranteed no. All-ones means 'maybe' (other keys may have set them), which costs at most a wasted probe. That asymmetry is the entire contract.",
              "ANY-of-k inverts the logic: with a filter even moderately full, almost every absent key has SOME bit set somewhere, so nearly everything answers 'maybe'. No false negatives, technically — but the filter stops filtering, and every read probes every SSTable again.",
              "Checking one hash function throws away the other two bits of evidence: the false-positive rate balloons from (fill)^3 to (fill)^1. Still no false negatives, but you've paid 3 bits per key for 1 bit of discrimination — filters earn their RAM by using every hash."] },
      post:`}` },

    { id:"mvccvis", title:"MVCC Visibility", why:"the snapshot decides what you see — not the clock", demo:demoMvccVis,
      pre:`// snapshot = { xmax: first xid NOT yet assigned at snapshot
//              time, inProgress: Set of xids running then }
// xidVisible(xid): committed AND xid < snap.xmax
//                  AND !snap.inProgress.has(xid)
// a row version: { value, xmin: creator, xmax: deleter | null }
function versionVisible(v, snap, status) {`,
      blank:{ q:"A version was created by tx 7 and deleted by tx 9, which is still running. Your snapshot predates neither. Which body shows you the right versions?",
        options:[
`  if (!xidVisible(v.xmin, snap, status)) return false;
  if (v.xmax == null) return true;
  return !xidVisible(v.xmax, snap, status);`,
`  if (!xidVisible(v.xmin, snap, status)) return false;
  return v.xmax == null;`,
`  if (status.get(v.xmin) !== "committed") return false;
  if (v.xmax == null) return true;
  return status.get(v.xmax) !== "committed";`],
        answer:0,
        whys:["Right. Two questions, both answered BY THE SNAPSHOT: is the creator visibly committed (yes → the version exists for me), and is the deleter visibly committed (yes → it's gone for me). Tx 9's in-progress delete is invisible, so the version still reads as alive — readers never wait on writers.",
              "Treating ANY xmax as death makes rows vanish the moment someone merely STARTS deleting them — and stay vanished even if that delete rolls back. Uncommitted and aborted deleters must not count; that's the same visibility question as the creator, asked again.",
              "Checking raw commit status without the snapshot bounds means a commit that lands mid-transaction changes your answers between two reads of the same row — the non-repeatable read MVCC exists to kill. Committed isn't enough; it must be committed *within my snapshot*."] },
      post:`}` },

    { id:"rowlock", title:"Row-Lock Queue", why:"the lock is never observably free while a waiter exists", demo:demoRowLock,
      pre:`// UPDATE takes the row's exclusive lock until COMMIT.
// locks: Map row -> { holder, queue: [{tx, d /*deferred*/}] }
release(tx, row) {
  const l = this.locks.get(row);
  if (!l || l.holder !== tx) return;`,
      blank:{ q:"t1 commits while t2 waits — and t9's fresh UPDATE arrives in the same instant. Which release keeps the grant order honest?",
        options:[
`  const next = l.queue.shift();
  if (next) { l.holder = next.tx; next.d.resolve(); }
  else this.locks.delete(row);`,
`  this.locks.delete(row);
  const next = l.queue.shift();
  if (next) next.d.resolve();`,
`  for (const w of l.queue) w.d.resolve();
  l.queue = [];
  this.locks.delete(row);`],
        answer:0,
        whys:["Right. Ownership transfers directly: the head waiter IS the holder before anyone else can look. t9 sees a held lock and queues behind t2. The invariant, said out loud: the lock is never observably free while a waiter exists.",
              "Deleting the entry first opens a window where the row looks free — t9's acquire barges in and grants itself the lock, then t2's wakeup fires and BOTH believe they hold it. Two UPDATEs interleave on one row: the counter double-applies, rarely, under load, unreproducibly.",
              "Waking the whole queue grants the lock to every waiter simultaneously — it's not a lock anymore, it's a starting gun. Exclusive means one: hand off to the head, the rest keep waiting."] },
      post:`}` },

    { id:"waitfor", title:"Deadlock Detector", why:"a deadlock is a cycle in who-waits-for-whom", demo:demoWaitFor,
      pre:`// deadlock_timeout fired. waitFor: Map tx -> the tx it
// waits for. find a cycle (the deadlock) or return null.
function findCycle(waitFor) {
  for (const start of waitFor.keys()) {`,
      blank:{ q:"t1→t2→t3→t1 must be found; a long-but-draining chain must not be; and the detector itself must never hang. Which walk?",
        options:[
`    const seen = new Set([start]);
    const path = [start];
    let cur = waitFor.get(start);
    while (cur != null) {
      path.push(cur);
      if (cur === start) return path;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = waitFor.get(cur);
    }`,
`    if (waitFor.get(waitFor.get(start)) === start)
      return [start, waitFor.get(start), start];`,
`    const path = [start];
    let cur = waitFor.get(start);
    while (cur != null) {
      path.push(cur);
      if (cur === start) return path;
      cur = waitFor.get(cur);
    }`],
        answer:0,
        whys:["Right. Follow the chain; returning to start is a deadlock, and the seen-set bails out of loops that don't pass through start (a tail feeding someone else's cycle). Every walk terminates, every cycle is found from one of its own members.",
              "This only catches 2-cycles (A↔B). Production deadlocks routinely involve three or more transactions — T1 holds what T2 wants, T2 holds what T3 wants, T3 holds what T1 wants — and this detector stares straight through them while the system sits frozen.",
              "No seen-set: start from t9 where t9→t1→t2→t1... and the walk orbits the t1-t2 loop forever. The deadlock detector deadlocks — the one component that must always terminate, spinning at 100% while every victim waits for its verdict."] },
      post:`  }
  return null;
}` },

    { id:"versioncas", title:"Optimistic Version CAS", why:"detect the conflict at write time; retry instead of waiting", demo:demoVersionCas,
      pre:`// rows carry a version column. casUpdate issues:
//   UPDATE ... SET value=$3, version=version+1
//   WHERE id=$1 AND version=$2      -- returns rows matched
async function withCasRetry(table, id, fn, max = 5) {`,
      blank:{ q:"Two handlers race on the same row and one CAS must lose. Which loop turns the loss into a retry instead of a lie?",
        options:[
`  for (let a = 1; a <= max; a++) {
    const row = table.get(id);
    const n = table.casUpdate(id, row.version, fn(row.value));
    if (n === 1) return a;
  }
  throw new Error("contention: retries exhausted");`,
`  const row = table.get(id);
  for (let a = 1; a <= max; a++) {
    const n = table.casUpdate(id, row.version, fn(row.value));
    if (n === 1) return a;
  }
  throw new Error("contention: retries exhausted");`,
`  for (let a = 1; a <= max; a++) {
    const row = table.get(id);
    table.casUpdate(id, row.version, fn(row.value));
    return a;
  }`],
        answer:0,
        whys:["Right. Every attempt is a fresh read-compute-CAS: re-read the row (new version, new value), recompute, and let the WHERE version clause arbitrate. 0 rows means you lost — loop. 1 row means your write is based on the value it replaced.",
              "The read is hoisted out of the loop, so every retry replays the SAME stale version — casUpdate returns 0 forever and the loop exhausts, guaranteed, the very first time there's real contention. The retry must retry the READ; that's the half that went stale.",
              "The rowcount is never checked — a CAS that matched 0 rows falls through and returns 'success' on attempt 1. The write silently didn't happen: sold-out inventory oversells, and you find out from the warehouse, not the logs."] },
      post:`}` },
  ],

  bank:[
    { id:"crashreplay", title:"Crash Recovery Replay", why:"atomicity is a filter over the log", demo:demoCrashReplay,
      pre:`// the server just restarted. the durable log (since the last
// checkpoint) holds interleaved records:
//   {txid, key, val}       -- a write
//   {txid, commit: true}   -- a commit record
function recover(records) {
  const state = new Map(checkpointState);`,
      blank:{ q:"t7's transfer committed; t8 wrote one leg and crashed. Which replay reconstructs a state where money moved entirely or not at all?",
        options:[
`  const committed = new Set(
    records.filter(r => r.commit).map(r => r.txid));
  for (const r of records)
    if (!r.commit && committed.has(r.txid))
      state.set(r.key, r.val);
  return state;`,
`  for (const r of records)
    if (!r.commit) state.set(r.key, r.val);
  return state;`,
`  const committed = new Set();
  for (const r of records) {
    if (r.commit) { committed.add(r.txid); continue; }
    if (committed.has(r.txid)) state.set(r.key, r.val);
  }
  return state;`],
        answer:0,
        whys:["Right. Two passes: first learn which transactions have a commit record, then replay only their writes. t8 wrote debit-without-credit and died before committing — the filter erases it wholesale. Atomicity, implemented as a Set.",
              "Replaying every write resurrects t8's half-finished transfer: one account debited, the other never credited. The books are off by exactly one crash — the corruption WAL exists to make impossible, reintroduced by the recovery code itself.",
              "One pass means a write is applied only if its commit record already went by — but commit records come AFTER a transaction's writes in the log, always. This replays nothing at all: every committed change is skipped, and 'recovery succeeded' with an empty database."] },
      post:`}` },

    { id:"lostupdate", title:"Lost Update", why:"the database can't re-run arithmetic it never saw", demo:demoLostUpdate,
      pre:`-- two refund handlers race on merchant 9 (balance 500).
-- both run at READ COMMITTED (the default).
-- handler pseudocode:
--   r = query("SELECT balance FROM merchants WHERE id=9")`,
      blank:{ q:"Both handlers read 500 and each must subtract its refund. Which write survives the race — both debits landing, no error required?",
        options:[
`--   query("UPDATE merchants
--            SET balance = balance - $1
--          WHERE id = 9", [refund])`,
`--   query("UPDATE merchants
--            SET balance = $1
--          WHERE id = 9", [r.balance - refund])`,
`--   query("BEGIN");
--   query("UPDATE merchants SET balance = $1
--          WHERE id = 9", [r.balance - refund]);
--   query("COMMIT");`],
        answer:0,
        whys:["Right. Move the arithmetic INTO the statement. The second UPDATE waits for the first's row lock, and at READ COMMITTED it then re-reads the current row — 'balance - 100' evaluates against 400, not the stale 500. Both debits land: 300, no error, no retry.",
              "The app computed 400 from a read taken before the other refund. The UPDATE waits its turn politely — and then overwrites 400 over the other handler's 400. One refund evaporated with zero errors. This is THE lost update, and it's the default behavior.",
              "Wrapping the same stale write in BEGIN/COMMIT changes nothing — a transaction isn't a time machine; the value in $1 was computed from the old read either way. At READ COMMITTED you'd need FOR UPDATE on the read (or the in-statement arithmetic) to make the wait actually refresh your math."] },
      post:`-- (a version-column CAS or SELECT ... FOR UPDATE also
--  work — pick per lesson 21's contention model)` },

    { id:"writeskew", title:"Write Skew", why:"disjoint writes can still break a shared invariant", demo:demoWriteSkew,
      pre:`-- invariant: checking + savings >= 0 for the account pair.
-- each withdrawal tx: read BOTH balances, check the sum,
-- then debit ONE account. two run concurrently and the
-- naive run at REPEATABLE READ ends at -80.`,
      blank:{ q:"Which change actually restores the invariant under concurrency?",
        options:[
`-- run both at SERIALIZABLE and wrap the whole
-- transaction in retry-on-40001: SSI detects the
-- overlapping read/write dependency and aborts one`,
`-- keep REPEATABLE READ but re-check the sum right
-- before COMMIT inside the same transaction`,
`-- keep REPEATABLE READ; it takes a snapshot, so
-- each tx already sees a consistent pair of balances`],
        answer:0,
        whys:["Right. Serializable is the level whose PROMISE is 'equivalent to some one-at-a-time order'. Postgres keeps it via SSI: it notices T1 read what T2 wrote and vice versa, aborts one with 40001, and your retry re-runs against the survivor's debit — sum check fails, withdrawal refused. (Locking the rows you read with FOR UPDATE also works, by brute force.)",
              "The re-check reads from the SAME snapshot that made the original check pass — it cannot see the concurrent debit no matter when you run it. A check inside the transaction is bound by the transaction's view of the world; that view is exactly what's stale.",
              "Each tx DOES see a consistent snapshot — that's the trap. Both snapshots honestly showed 120, both decisions were locally sound, and the two writes touched different rows so no conflict check fired. Consistent reads don't compose into a consistent outcome; that composition is what serializability is."] },
      post:`-- write skew is why "we use REPEATABLE READ, we're
-- safe" is a sentence that should scare you.` },

    { id:"phantom", title:"Phantom Insert", why:"you can't lock rows that don't exist yet", demo:demoPhantom,
      pre:`-- meeting-room booking. each tx runs:
--   SELECT count(*) FROM bookings
--    WHERE room = 4 AND slot && '[11:00,12:00)'
--   -- count = 0 for BOTH -> both INSERT their booking
-- result: room 4 double-booked, no error raised.`,
      blank:{ q:"Which guard actually prevents the double booking?",
        options:[
`-- declare it: an EXCLUDE USING gist constraint on
-- (room WITH =, slot WITH &&) — the second INSERT
-- fails no matter how the transactions interleave
-- (scalar = in gist needs btree_gist;
--  or: run both at SERIALIZABLE + retry)`,
`-- SELECT ... FOR UPDATE on the overlap query, so
-- the check locks what it read before deciding`,
`-- re-run the count() a second time just before
-- COMMIT and abort if it changed`],
        answer:0,
        whys:["Right. The conflicting row doesn't exist yet, so the guard must live where inserts collide: a constraint the database enforces at write time (EXCLUDE for ranges, UNIQUE for exact keys), or SERIALIZABLE, whose predicate-level SSI tracking catches the read-then-insert cycle and aborts one tx. Declare invariants; don't re-derive them per request.",
              "FOR UPDATE locks the rows the SELECT RETURNED — and it returned zero rows. There is nothing to lock; both transactions lock nothing, both proceed, both insert. Locking reads cannot defend a predicate against rows that will be born into it. (MySQL InnoDB's gap locks under RR are a real, engine-specific exception — name that difference, don't assume it.)",
              "The re-check reads the same snapshot (REPEATABLE READ) or a still-racy instant (READ COMMITTED — the other INSERT may commit one microsecond after your recount). Check-then-act keeps the same hole no matter how many times you re-check before acting."] },
      post:`-- constraints are the only guards that hold for
-- writers who never read your application code.` },

    { id:"expandcontract", title:"Expand–Contract Migration", why:"old code and new code run at the same time — the schema must serve both", demo:demoExpandContract,
      pre:`-- goal: users.email_verified becomes a required column on a
-- 200M-row table, zero downtime. during the rollout, OLD app
-- code (which never writes the column) keeps serving traffic.
-- steps, in SOME order:
--   A. ALTER TABLE users ADD COLUMN email_verified boolean;  -- nullable
--   B. deploy code that writes email_verified on every insert/update
--   C. backfill existing rows in bounded batches
--   D. add CHECK ... NOT NULL NOT VALID; VALIDATE; SET NOT NULL`,
      blank:{ q:"Old code inserts rows between every step. Which order never fails a live write and ends fully constrained?",
        options:[
`-- A -> B -> C -> D
-- expand, move the code, move the data, constrain`,
`-- A -> D -> B -> C
-- constrain early so no bad rows can sneak in`,
`-- A -> C -> D -> B
-- backfill, constrain, then deploy the writer`],
        answer:0,
        whys:["Right. Nullable column first (instant, metadata-only), THEN the dual-writing code, THEN the batched backfill (which can now never race a NULL-writing insert), and the constraint last — validated online via NOT VALID + VALIDATE once no NULLs can exist. Every instant of the rollout serves both code versions.",
              "Constrain while the OLD code is still deployed and its very next INSERT — which doesn't set the column — violates NOT NULL and fails. You just took down signups with a 'safe' migration. The constraint must come after no running code can produce a NULL, which means after B, and after C clears history.",
              "Backfill before the new code deploys and the old code keeps inserting fresh NULLs behind the backfill's back; VALIDATE then fails (or the NOT NULL blocks the old writers, same outage as the other trap). Data can't be 'done' while code still produces the old shape — code moves before data."] },
      post:`-- contract (drop old columns/paths) ships one deploy
-- LATER, once nothing can still read the old shape.` },

    { id:"nplusone", title:"N+1 Queries", why:"the query count should follow the query shape, not the data", demo:demoNPlusOne,
      pre:`// page load: 20 orders, each with its line items.
const orders = await db.query(
  "SELECT * FROM orders WHERE user_id = $1 LIMIT 20", [uid]);`,
      blank:{ q:"Each round trip costs ~2ms and a pool checkout. Which child-load keeps that cost constant as the order list grows?",
        options:[
`const items = await db.query(
  "SELECT * FROM line_items WHERE order_id = ANY($1)",
  [orders.map(o => o.id)]);
const byOrder = Map.groupBy(items, i => i.order_id);`,
`for (const o of orders)
  o.items = await db.query(
    "SELECT * FROM line_items WHERE order_id = $1", [o.id]);`,
`const items = await Promise.all(orders.map(o =>
  db.query(
    "SELECT * FROM line_items WHERE order_id = $1", [o.id])));`],
        answer:0,
        whys:["Right. One batched query for all children, grouped in the app: 2 round trips total whether the page shows 20 orders or 200. (A JOIN or JSON aggregation gets there too — the invariant is queries-per-request stays O(1).)",
              "1 + 20 sequential round trips — ~40ms of pure network latency at 2ms each, before the database does any work. And it's invisible in dev against localhost, then dominates in production where the RTT is real. The query count is following the DATA; that's the definition of N+1.",
              "Promise.all hides the latency (they overlap) but still issues 20 queries: 20 pool checkouts at once from THIS one request. A few concurrent page loads and the pool is drained by line-item lookups — you traded visible latency for invisible pool pressure and 20× the per-query overhead."] },
      post:`` },

    { id:"poolexhaust", title:"Pool Exhaustion", why:"pool demand = arrival rate × HELD time", demo:demoPoolExhaust,
      pre:`// checkout handler. pool of 20. the payment API call
// takes ~800ms at p99. under load, requests start timing
// out waiting for a connection — while the DATABASE is idle.
async function checkout(order) {`,
      blank:{ q:"The database is bored and the pool is starved. Which handler shape fixes it?",
        options:[
`  const paid = await paymentApi.charge(order);  // no conn held
  const conn = await pool.acquire();
  try {
    await conn.query("INSERT INTO orders ...", [order, paid.ref]);
  } finally {
    pool.release(conn);
  }`,
`  const conn = await pool.acquire();
  try {
    const paid = await paymentApi.charge(order); // conn held 800ms
    await conn.query("INSERT INTO orders ...", [order, paid.ref]);
  } finally {
    pool.release(conn);
  }`,
`  const conn = await pool.acquire();
  const paid = await paymentApi.charge(order);
  await conn.query("INSERT INTO orders ...", [order, paid.ref]);
  pool.release(conn);`],
        answer:0,
        whys:["Right. Acquire late, release early: the connection is held for the ~2ms INSERT, not the 800ms external call. Held time drops 400×, so the same pool of 20 serves 400× the arrival rate. Pool sizing math only works on code shaped like this.",
              "The connection idles for 800ms as a hostage to someone else's latency. 20 connections ÷ 0.8s hold = 25 req/s ceiling — everything past that queues on acquire, which is exactly the symptom. The database being idle while the pool starves is this shape's signature.",
              "Held-across-the-API AND no finally: the first payment error leaks the connection forever. After a bad hour, the pool is empty, every request hangs on acquire, and the dashboard shows a perfectly healthy database serving nothing."] },
      post:`}` },

    { id:"readyourwrites", title:"Read-Your-Writes Routing", why:"the replica isn't wrong — it's earlier", demo:demoReadYourWrites,
      pre:`// after POST /profile writes to the primary, the app
// records the commit LSN in the user's session:
//   session.lastWriteLsn = result.commitLsn
// GET /profile normally reads a replica. route it:
function routeRead(session, replica) {`,
      blank:{ q:"The user just saved and immediately reloads. Which routing never shows them the past — without pinning every read to the primary?",
        options:[
`  if (replica.replayedLsn() >= session.lastWriteLsn)
    return replica;      // caught up past MY write
  return primary;        // not yet — read the source`,
`  return replica;        // replicas converge in ~50ms,
                         // faster than a human can reload`,
`  await sleep(200);      // give replication a moment
  return replica;`],
        answer:0,
        whys:["Right. Compare positions, not clocks: the replica is safe for THIS session exactly when its replay position has passed the session's last write. Fresh writers hit the primary briefly; everyone else keeps enjoying the replicas. This is read-your-writes, implemented with two numbers.",
              "Normally, yes — and 'normally' is the trap. Lag spikes with load, vacuum, and long replica queries, precisely when the most users are writing. The bug report is unbeatable: 'I saved, it vanished, I refreshed, it came back.' Guarantees per-session, not vibes per-cluster.",
              "A sleep is a guess wearing a number: 200ms is too long for every normal request (you just added 200ms to p50) and too short for the lag spike that caused the ticket. If you find yourself sleeping to 'let data arrive', you're reinventing the LSN comparison, badly."] },
      post:`}` },
  ],
};

/* ---- flashcards: the judgment calls ---- */
const CARDS = [
  ["B-tree vs LSM — the one-line trade?","Pick your amplification. B-tree: one tree, cheap bounded reads, writes rewrite pages in place (plus WAL). LSM: writes are sequential appends, reads probe a stack of tables (bloom filters + compaction keep it sane), and compaction re-buys the write cost in the background. Put the workload's hot operation on the engine's cheap path."],
  ["When do you NOT add the index?","When the write tax outruns the read win: every INSERT/UPDATE maintains every index, the predicate isn't selective enough for the planner to ever choose it, or it duplicates a leftmost prefix of an existing composite. Check pg_stat_user_indexes before adding — and after: an unused index is pure tax."],
  ["UUIDv4 vs sequential primary key — what's the storage argument?","Random UUIDs scatter inserts across the whole B-tree: every insert dirties a random leaf, cache locality dies, and page splits multiply. Sequential keys append to the rightmost leaf — warm pages, tight packing. If you need UUIDs, prefer time-ordered ones (UUIDv7); if you have v4, know you're paying for it in write amplification."],
  ["Which isolation level do you actually run?","READ COMMITTED by default, with the lost-update discipline (in-statement arithmetic, FOR UPDATE, or version CAS) applied at every read-modify-write. Escalate to SERIALIZABLE for flows whose invariants span rows (write skew shaped) — and only with retry-on-40001 wrapped around them. REPEATABLE READ is the odd middle: great for consistent reports, still skew-prone for writes."],
  ["SELECT FOR UPDATE vs a version-column CAS — how do you pick?","By contention and by who waits. Frequent conflicts on hot rows: pessimistic (FOR UPDATE) — waiting once beats retry storms. Rare conflicts: optimistic — no locks held, losers retry. Absolute rule: never hold a row lock across user think-time or an external call; that territory is optimistic-only (or a status column that models the reservation explicitly)."],
  ["Why are long-running transactions poison?","Three taxes at once: their snapshot pins the vacuum horizon (dead versions accumulate table- and cluster-wide), their locks are held to commit (queues form behind them, including DDL that then blocks everyone), and on replicas they conflict with WAL replay. Keep transactions to milliseconds; move slow work outside BEGIN…COMMIT."],
  ["Pool sizing — the counterintuitive rule?","Smaller than you think: throughput peaks near cores × 2-ish active connections, and MORE connections make each query slower (context switches, contention) while holding locks longer. Size = arrival rate × held time, then shrink held time (acquire late, release early) before you ever raise the size. Queue in the app, never in the database."],
  ["Read replica vs cache — when each?","A replica gives you the full query surface (SQL, indexes, joins) at near-real-time staleness with almost no invalidation logic — right for read-heavy query variety. A cache gives you microsecond hits for hot, simple lookups — right for high-QPS point reads — but you now own invalidation, the hardest problem in the stack. Many systems want the replica first; the cache is earned by a measured hot spot."],
  ["Unique constraint vs app-level uniqueness check — why is this not a style question?","The app-level check (SELECT then INSERT) races: two requests both see 'absent' and both insert. The constraint is enforced at write time inside the engine, atomically, against writers who have never read your code — including tomorrow's batch job. Do both if you want a friendly error message; only one of them is the actual guarantee."],
  ["Soft delete (deleted_at) vs hard DELETE — the hidden costs?","Soft delete keeps every 'deleted' row in every index and every scan — tables grow forever, every query needs the WHERE deleted_at IS NULL guard (partial indexes help), and unique constraints break (deleted rows still occupy the key). Hard delete costs you recovery stories and audit trails. Pick per table: audit-heavy data wants soft + partial indexes; high-churn data wants hard + an archive table."],
  ["When is a sequential scan the right answer?","When the predicate keeps a large fraction of the table (double-digit percents), when the table is small enough to live in a few pages, or when you're reading most rows anyway (analytics). An index scan pays a random heap fetch per row; sequential reads are the disk's favorite access pattern. Respect the planner's page math before overriding it."],
  ["What makes a transaction safe to auto-retry on 40001/40P01?","It must be a pure function of its reads: re-runnable from the top (reads included — never reuse values read before the abort), side-effect-free outside the database until commit (no emails, no charges mid-transaction), and bounded (attempt cap + backoff). Serializable without a retry wrapper isn't a stricter isolation level; it's a new error page."],
  ["Covering index / INCLUDE — when is it worth the fat?","When one hot query's columns can all ride in the index, turning every execution into an index-only scan (verify 'Heap Fetches' stays low — the visibility map must be current, so vacuum matters). Cost: a bigger index and more write amplification on every change to included columns. Cover the top-3 queries by total time, not everything that might benefit."],
  ["'The database is slow.' Your first three looks?","(1) pg_stat_statements — which statements dominate total time, and did a plan change (rows est vs actual in EXPLAIN ANALYZE)? (2) Waits and locks — pg_stat_activity wait events; is everything queued behind one long transaction or a lock? (3) Cache hit ratio and I/O — did the working set outgrow memory, or did a deploy/restart cold-start the buffer pool? Slow is usually one of: bad plan, blocked, or cold."],
];

/* ---- spot-the-bug: real code, one broken scenario, tap the faulty line(s) ---- */
const BUGHUNT = [
  { id:"bug_wal", title:"Commit path", why:"the fsync IS the promise", lesson:3,
    scenario:"After a rack power failure, a handful of customers who saw \"payment confirmed\" have no payment rows — but only customers from the final second before the crash. Every test passes, and no error was ever logged. Which line makes the confirmation a lie?",
    lines:[
      "class CommitLog {",
      "  constructor(disk) {",
      "    this.disk = disk;       // append() buffers in the OS cache;",
      "    this.pages = new Map(); // fsync() makes appended records durable",
      "  }",
      "",
      "  commit(tx) {",
      "    for (const w of tx.writes)",
      "      this.disk.append({ txid: tx.id, key: w.key, val: w.val });",
      "    this.disk.append({ txid: tx.id, commit: true });",
      "    ack(tx.id);                    // tell the client: committed",
      "    this.disk.fsync();",
      "    for (const w of tx.writes)",
      "      this.pages.set(w.key, w.val);",
      "  }",
      "}",
    ],
    bug:[10],
    explain:"Line 11 acks before line 12's fsync. Appended-but-unsynced records live in the OS write cache — power loss in that window erases them, and with them a commit the client was already told about. The window is milliseconds wide, which is why only the final second's customers are affected and why no test ever catches it: it takes a power cut, not a bug report. The order is non-negotiable: append, append commit record, fsync, THEN ack. (Line 13's late page write is the decoy — it's correct: data pages may be written whenever, because replay rebuilds them from the durable log.)" },

  { id:"bug_mvcc", title:"Visibility check", why:"the snapshot boundary is exclusive", lesson:15,
    scenario:"A nightly reconciliation transaction (REPEATABLE READ) occasionally reports totals that include orders placed AFTER the report began — a fraction of a second after, every time, and only under heavy write traffic. Re-running the report gives the correct total. Which line lets the future leak in?",
    lines:[
      "// snapshot = { xmax: the first xid NOT yet assigned when",
      "//              the snapshot was taken,",
      "//              inProgress: xids running at snapshot time }",
      "function xidVisible(xid, snap, status) {",
      "  if (xid == null) return false;",
      "  if (status.get(xid) !== \"committed\") return false;",
      "  if (xid > snap.xmax) return false;",
      "  if (snap.inProgress.has(xid)) return false;",
      "  return true;",
      "}",
      "",
      "function versionVisible(v, snap, status) {",
      "  if (!xidVisible(v.xmin, snap, status)) return false;",
      "  if (v.xmax == null) return true;",
      "  return !xidVisible(v.xmax, snap, status);",
      "}",
    ],
    bug:[6],
    explain:"Line 7 uses `xid > snap.xmax` where the rule is `xid >= snap.xmax` must be invisible — equivalently, visible requires `xid < snap.xmax`. snap.xmax is the first xid NOT yet assigned at snapshot time, so the transaction with xid exactly equal to snap.xmax started after the snapshot — and with `>` it slips through the moment it commits. Under heavy traffic there's always such a transaction, which is why the report drifts by 'just-after' orders and only under load. Off-by-one on an exclusive boundary: `<` on the visible side, not `<=`. (Line 15's double-negative deleter check is the decoy — it's the correct 'deleter not visibly committed means the row is still alive for me' rule.)" },

  { id:"bug_pool", title:"Pool checkout wrapper", why:"every acquired connection needs an unconditional way home", lesson:21,
    scenario:"During an incident where ~5% of queries failed for twenty minutes, the app slowly ground to a halt: every request began hanging on \"waiting for connection\" — and stayed that way AFTER the database recovered, until someone restarted the app. The database itself shows nearly zero active sessions. Which line starves the pool?",
    lines:[
      "async function withConnection(pool, fn) {",
      "  const conn = await pool.acquire();",
      "  const result = await fn(conn);",
      "  pool.release(conn);",
      "  return result;",
      "}",
      "",
      "// used everywhere:",
      "//   await withConnection(pool, (c) =>",
      "//     c.query(\"SELECT ...\", params));",
      "//",
      "// pool.acquire() parks the caller in a FIFO queue",
      "// when no connection is idle.",
    ],
    bug:[3],
    explain:"Line 4 only runs when fn resolves. Every time fn throws — every failed query during the incident — the function unwinds past the release and that connection is checked out forever. At a 5% failure rate a 20-connection pool leaks to empty in a few hundred requests; afterwards every acquire parks in the waiter queue for a connection that no longer exists, which is why recovery required a restart while the database sat idle. Release must be unconditional: wrap fn in try { return await fn(conn); } finally { pool.release(conn); }. The subtlety worth saying in review: `return await` inside the try is load-bearing — plain `return fn(conn)` runs the finally — and the release — before the query's promise settles, so an in-flight connection goes back to the pool and gets handed to another request. (Synchronous throws are covered either way; the `await` is what makes the release wait for the settle.)" },

  { id:"bug_cas", title:"Optimistic seat reservation", why:"a CAS that ignores its rowcount is just a write that sometimes doesn't happen", lesson:20,
    scenario:"A ticketing system with a version column on seats still occasionally sells one seat to two buyers — always two requests within the same few milliseconds. The UPDATE statement itself is textbook-correct optimistic locking. Which line loses the race anyway?",
    lines:[
      "async function reserveSeat(db, seatId, userId) {",
      "  const seat = await db.get(",
      "    \"SELECT status, version FROM seats WHERE id = $1\",",
      "    [seatId]);",
      "  if (seat.status !== \"free\")",
      "    return { ok: false, reason: \"taken\" };",
      "",
      "  const res = await db.run(",
      "    \"UPDATE seats SET status = 'held', held_by = $1,\" +",
      "    \"       version = version + 1 \" +",
      "    \"WHERE id = $2 AND version = $3\",",
      "    [userId, seatId, seat.version]);",
      "",
      "  return { ok: true, seat: seatId };",
      "}",
    ],
    bug:[13],
    explain:"Line 14 returns success unconditionally — res.rowCount is never checked. The UPDATE's WHERE version = $3 clause did its job: when a rival reservation commits first, the version has moved and this UPDATE matches 0 rows. But 0 rows isn't an error; it's a return value. The function reports { ok: true } for a write that didn't happen, and the second buyer gets a confirmation email for an unreserved seat. The CAS contract has two halves — the guarded UPDATE (lines 8-12, which are correct — that's the decoy) and acting on its rowcount: `if (res.rowCount === 0) return { ok: false, reason: \"conflict\" }` (or loop back and retry from the fresh read)." },
];

/* ===========================================================
   WRITE IT — assemble the implementation from a shuffled line
   bank. Grading is honest: the assembled code actually RUNS
   against assertions in a sandboxed worker.
   =========================================================== */
const WRITE = [
  { id:"w-wal", title:"Crash recovery — write it", why:"replay committed transactions; erase the rest", lesson:4,
    spec:"Write walRecover(records): records are {txid, key, val} writes and {txid, commit: true} commit records, in log order. Return a Map of the recovered state — apply the writes of transactions that have a commit record ANYWHERE in the log, in log order; a transaction without a commit record contributes nothing.",
    pre:`function walRecover(records) {`,
    post:`}`,
    lines:[
      "  const committed = new Set();",
      "  for (const r of records)",
      "    if (r.commit) committed.add(r.txid);",
      "  const state = new Map();",
      "  for (const r of records)",
      "    if (!r.commit && committed.has(r.txid))",
      "      state.set(r.key, r.val);",
      "  return state;",
    ],
    distractors:[
      { code:"    if (!r.commit) state.set(r.key, r.val);",
        why:"Applies every write, committed or not — the half-finished transaction that died mid-transfer replays its debit without its credit. Recovery just reintroduced the corruption the WAL exists to prevent." },
      { code:"  const committed = new Set(records.map(r => r.txid));",
        why:"Every txid that appears at all counts as committed — the commit record stops meaning anything. Same corruption as applying everything, wearing a Set as a disguise." },
      { code:"    if (r.commit && committed.has(r.txid))",
        why:"Applies only commit records (which carry no key/val) and skips every actual write — recovery 'succeeds' into an empty state. The filter belongs on writes, keyed by membership in the committed set." },
    ],
    test:`const log1 = [
  { txid: "t1", key: "alice", val: 40 },
  { txid: "t1", key: "bob", val: 160 },
  { txid: "t2", key: "alice", val: 0 },     // began before t1 committed…
  { txid: "t1", commit: true },
  { txid: "t3", key: "carol", val: 7 },
  { txid: "t3", commit: true },
];                                            // …t2 never committed (crash)
const s = walRecover(log1);
log("recovered: " + JSON.stringify([...s]));
assert(s.get("alice") === 40, "t1's write must survive - it committed (alice expected 40, got " + s.get("alice") + ")");
assert(s.get("bob") === 160, "BOTH of t1's writes replay - atomicity is all-or-nothing");
assert(s.get("carol") === 7, "a later committed tx (t3) must replay too");
assert(s.size === 3, "t2 wrote alice=0 but never committed - it must contribute NOTHING, size is " + s.size);
const s2 = walRecover([{ txid: "t9", key: "x", val: 1 }]);
assert(s2.size === 0, "a lone uncommitted write recovers to an empty state");
const s3 = walRecover([
  { txid: "a", key: "k", val: 1 }, { txid: "a", commit: true },
  { txid: "b", key: "k", val: 2 }, { txid: "b", commit: true },
]);
assert(s3.get("k") === 2, "log order rules: the later committed write wins, got " + s3.get("k"));`,
    pass:"committed transactions replayed whole; the crashed one left no trace",
    takeaway:"Atomicity is a filter over the log: learn who committed (pass one), replay only them (pass two). The commit record is the transaction's entire existence.",
    hint:"Two passes. First: collect txids of records with commit:true into a Set. Second: for each non-commit record whose txid is in the set, state.set(key, val). Return the Map." },

  { id:"w-mvcc", title:"MVCC visibility — write it", why:"the snapshot decides, not the clock", lesson:15,
    spec:"Write versionVisible(v, snap, status): a version {value, xmin, xmax|null} is visible iff its creator xmin is visibly committed under the snapshot, AND it has no deleter — or its deleter is NOT visibly committed under the snapshot. xidVisible (given) answers \"is this xid committed, from before my snapshot, and not in-flight when I started?\".",
    pre:`// snap = { xmax: first xid NOT yet assigned at snapshot time,
//          inProgress: Set of xids running at snapshot time }
function xidVisible(xid, snap, status) {
  return xid != null
      && status.get(xid) === "committed"
      && xid < snap.xmax
      && !snap.inProgress.has(xid);
}
function versionVisible(v, snap, status) {`,
    post:`}`,
    lines:[
      "  if (!xidVisible(v.xmin, snap, status)) return false;",
      "  if (v.xmax == null) return true;",
      "  return !xidVisible(v.xmax, snap, status);",
    ],
    distractors:[
      { code:"  return xidVisible(v.xmax, snap, status);",
        why:"Inverted: this shows rows exactly when their deleter IS visible — you see only deleted data, and every live row vanishes. The deleter's visibility argues AGAINST the row." },
      { code:"  if (v.xmax != null) return false;",
        why:"Any deleter kills the row — including an uncommitted one and one that later aborts. A rolled-back DELETE leaves the row permanently invisible to this check, and rows flicker out the instant someone merely starts deleting them." },
      { code:"  if (status.get(v.xmin) === \"committed\") return true;",
        why:"Committed-at-read-time isn't committed-in-my-snapshot: a transaction that commits mid-query makes its rows pop into existence between two reads of the same table — the non-repeatable read MVCC exists to kill. The snapshot bounds are the whole point." },
    ],
    test:`const status = new Map([[5, "committed"], [7, "committed"], [9, "in-progress"], [11, "aborted"], [12, "committed"]]);
const snapDuring7 = { xmax: 10, inProgress: new Set([7, 9]) };  // taken while 7 ran
const snapAfter7  = { xmax: 10, inProgress: new Set([9]) };     // taken after 7 committed
const v100 = { value: 100, xmin: 5, xmax: 7 };     // deleted by 7
const v70  = { value: 70,  xmin: 7, xmax: null };  // created by 7
const v0   = { value: 0,   xmin: 9, xmax: null };  // 9 still running
const vAb  = { value: -1,  xmin: 11, xmax: null }; // creator aborted
const vFut = { value: 999, xmin: 12, xmax: null }; // 12 committed but xid >= snap.xmax
assert(versionVisible(v100, snapDuring7, status) === true,  "7's delete was in-flight at snapshot time - the old version is still alive for me");
assert(versionVisible(v70,  snapDuring7, status) === false, "7's insert was in-flight at snapshot time - invisible");
assert(versionVisible(v100, snapAfter7, status) === false,  "after 7 committed, its delete counts - the old version is gone");
assert(versionVisible(v70,  snapAfter7, status) === true,   "after 7 committed, its version is the one I read");
assert(versionVisible(v0,   snapAfter7, status) === false,  "an uncommitted creator is never visible");
assert(versionVisible(vAb,  snapAfter7, status) === false,  "an aborted creator is never visible - MVCC atomicity");
assert(versionVisible(vFut, snapAfter7, status) === false,  "xid 12 >= snap.xmax began after my snapshot - committed or not, it is my future");
log("both snapshots read a consistent past; nobody blocked");`,
    pass:"two snapshots, two consistent pasts — creator visible, deleter not",
    takeaway:"One helper asked twice: the creator must be visibly committed (the row exists for me), the deleter must not be (the row still exists for me). Everything else — no dirty reads, stable reads, readers never blocking — falls out.",
    hint:"Three lines: creator not visible → false. No deleter → true. Otherwise return NOT xidVisible(deleter)." },

  { id:"w-bloom", title:"Bloom filter — write it", why:"a wasted probe is fine; a lost row is not", lesson:6,
    spec:"Write add(key) and mightContain(key) for a bloom filter with m bits and k hash functions. add sets bits[hash(key, i) % m] for every i in 0..k-1. mightContain returns true only if ALL k positions are set — one zero bit is proof of absence. The invariant: no false negatives, ever.",
    pre:`function hash(key, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
class Bloom {
  constructor(m, k) { this.m = m; this.k = k; this.bits = new Array(m).fill(0); }`,
    post:`}`,
    lines:[
      "  add(key) {",
      "    for (let i = 0; i < this.k; i++)",
      "      this.bits[hash(key, i) % this.m] = 1;",
      "  }",
      "  mightContain(key) {",
      "    for (let i = 0; i < this.k; i++)",
      "      if (this.bits[hash(key, i) % this.m] === 0)",
      "        return false;",
      "    return true;",
      "  }",
    ],
    distractors:[
      { code:"      this.bits[hash(key, 0) % this.m] = 1;",
        why:"Sets only the seed-0 bit while mightContain demands all k — every added key fails the check at its unset bits. False negatives: the read path skips SSTables that really hold the key, and rows silently \"disappear\" until someone disables the filter." },
      { code:"      if (this.bits[hash(key, i) % this.m] === 1)\n        return true;",
        why:"ANY-of-k membership: in a filter with a few keys, nearly every probe finds SOME set bit, so almost everything answers \"maybe\". No false negatives — but the false-positive rate explodes and the filter stops paying for its RAM." },
      { code:"      if (this.bits[hash(key, i) % this.m] === 0)\n        return true;",
        why:"Inverted verdict: a zero bit — the proof of ABSENCE — returns \"maybe here\", and fully-set keys fall through to false. Present keys read as absent: false negatives by construction, data loss by lunchtime." },
    ],
    test:`const f = new Bloom(256, 3);
const present = [];
for (let i = 0; i < 20; i++) present.push("user:" + i);
for (const k of present) f.add(k);
for (const k of present)
  assert(f.mightContain(k) === true, "false negative on " + k + " - the one answer a bloom filter must never give");
log("20 keys added - zero false negatives");
let fp = 0;
for (let i = 0; i < 60; i++)
  if (f.mightContain("ghost:" + i)) fp++;
log(fp + "/60 absent keys answered maybe (false positives - wasted probes, not wrong answers)");
assert(fp < 30, "the filter must actually filter - " + fp + "/60 false positives means it barely discriminates");
const empty = new Bloom(256, 3);
assert(empty.mightContain("anything") === false, "an empty filter contains nothing");`,
    pass:"every present key answers maybe; absence is proven by a single zero bit",
    takeaway:"The bloom contract is asymmetric by design: \"no\" is a guarantee, \"maybe\" is a hint. add sets all k bits; mightContain requires all k — break either half and the read path loses data or loses the point.",
    hint:"add: loop i in 0..k-1, set bits[hash(key, i) % m] = 1. mightContain: same loop; any zero bit → return false; after the loop → true." },

  { id:"w-lru", title:"LRU buffer pool — write it", why:"recency is the cache's memory of what matters", lesson:8,
    spec:"Write fetch(pageId) for a buffer pool of `capacity` pages using LRU eviction over a Map (a JS Map iterates in insertion order — re-inserting a key moves it to the back, so the FRONT is the least recently used). On a hit: refresh the page's recency and return {page, hit: true}. On a miss: count a disk read, evict the least-recently-used page if the pool is full, cache the loaded page, return {page, hit: false}.",
    pre:`class BufferPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.pages = new Map();   // insertion order = recency order
    this.diskReads = 0;
  }`,
    post:`}`,
    lines:[
      "  fetch(pageId) {",
      "    if (this.pages.has(pageId)) {",
      "      const page = this.pages.get(pageId);",
      "      this.pages.delete(pageId);",
      "      this.pages.set(pageId, page);   // re-insert: most recent",
      "      return { page, hit: true };",
      "    }",
      "    this.diskReads++;",
      "    if (this.pages.size >= this.capacity) {",
      "      const lru = this.pages.keys().next().value;",
      "      this.pages.delete(lru);",
      "    }",
      "    const page = \"page:\" + pageId;",
      "    this.pages.set(pageId, page);",
      "    return { page, hit: false };",
      "  }",
    ],
    distractors:[
      { code:"      return { page: this.pages.get(pageId), hit: true };",
        why:"A hit that never refreshes recency: the Map's order stays insertion order, so the hottest page in the database — read every millisecond since startup — sits at the FRONT and is the first thing evicted. The cache forgets what 'used' means." },
      { code:"      const lru = [...this.pages.keys()].pop();",
        why:"Evicts the BACK of the Map — the most recently used page, quite possibly the one the current query is iterating. Hit rate collapses to near-zero under any looping access pattern; the pool churns its own working set." },
      { code:"    if (this.pages.size >= this.capacity) return { page: null, hit: false };",
        why:"Refusing to cache when full means the pool never learns anything new after warm-up: yesterday's working set is pinned forever and today's queries all go to disk. Eviction isn't a failure mode — it's the mechanism." },
    ],
    test:`const bp = new BufferPool(3);
assert(bp.fetch(1).hit === false, "cold pool - first read of page 1 is a miss");
bp.fetch(2); bp.fetch(3);
assert(bp.diskReads === 3, "three cold misses hit the disk, counted " + bp.diskReads);
assert(bp.fetch(1).hit === true, "page 1 is cached - a hit (and it must refresh recency)");
assert(bp.diskReads === 3, "a hit must not touch the disk");
bp.fetch(4);                       // full: someone must go
assert(bp.fetch(1).hit === true, "page 1 was touched most recently - it must survive the eviction");
assert(bp.fetch(2).hit === false, "page 2 was the least recently used - it should have been evicted");
log("evicted the LRU page (2), kept the recently-touched page (1)");
const before = bp.diskReads;
bp.fetch(1); bp.fetch(1);
assert(bp.diskReads === before, "repeated hits cost zero disk reads");
assert(bp.pages.size <= 3, "the pool must never exceed its capacity, holds " + bp.pages.size);`,
    pass:"hits refreshed recency, the coldest page took the eviction, capacity held",
    takeaway:"LRU in one move: a hit deletes and re-inserts, so the Map's front is always the coldest page. This tiny loop is why a restart hurts — diskReads is exactly what an empty Map costs.",
    hint:"Hit: get, delete, set again (moves to back), return hit:true. Miss: diskReads++, if size >= capacity delete this.pages.keys().next().value (the front = LRU), then set and return hit:false." },
];

/* ===========================================================
   LESSONS — foundations arc (0-3). Storage engines, indexing,
   transactions, and operations are appended by the lesson
   packs; see the LESSON PLAN at the top of this file.
   =========================================================== */
const LESSONS = [
  { eb:"lesson 01 · foundations", title:"The two axioms", html:`
    <p class="big">Everything a database does — logs, trees, snapshots, locks — is generated by two brutal facts. <b class="hl">Axiom one: the disk can fail between any two writes.</b> <b class="hl">Axiom two: readers and writers overlap in time.</b> Master the consequences of those and the rest of this course is derivation, not memorization.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">two axioms &rarr; the whole field</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">axiom 1</div><div class="lstep bad seq" style="--i:0">power dies between write A and write B &mdash; the disk keeps A, loses B, forever</div>
        <div class="lanehead seq" style="--i:1">therefore</div><div class="lstep good seq" style="--i:1">the write-ahead log &middot; fsync-then-ack &middot; crash recovery &middot; checkpoints &middot; replication</div>
        <div class="lanehead seq" style="--i:2">axiom 2</div><div class="lstep bad seq" style="--i:2">your SELECT runs WHILE someone's UPDATE is half-done &mdash; there is no "quiet moment"</div>
        <div class="lanehead seq" style="--i:3">therefore</div><div class="lstep good seq" style="--i:3">MVCC &middot; snapshots &middot; isolation levels &middot; row locks &middot; deadlock detection</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">the trap this course exists to remove</div>
        <p style="margin:4px 0 0">Most working engineers treat everything under <code>BEGIN&hellip;COMMIT</code> as folklore &mdash; "the database handles it." The database handles exactly what its defaults handle. Lost updates, write skew, stale replicas, and 20-minute lock queues are all <b class="hl">defaults doing exactly what they promise</b>, to someone who didn't know the promise.</p>
      </div>
      <div class="dnote seq" style="--i:5">A database is not a magic hash map. It is a <b style="color:var(--ordered)">crash-safe data structure</b> wrapped in a <b style="color:var(--ordered)">concurrency protocol</b> &mdash; and both halves are inspectable, ordinary engineering.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Axiom one is stricter than "disks crash." A single logical write &mdash; one UPDATE &mdash; becomes several physical writes: a heap page, two index pages, the log. The failure can land <b class="hl">between any two of them</b>, and the machine restarts with a mix of old and new bytes. Whatever the engine does must make that mixed state <b class="hl">recoverable into something consistent</b>.</p>
    <p>Axiom two is stricter than "users are concurrent." It means <b class="hl">every read you take is potentially mid-someone-else's-write</b>, and every value you compute from a read is potentially stale by the time you write it back. The database's isolation machinery decides which of those overlaps you're allowed to observe &mdash; and the default setting lets you observe more than most engineers assume.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the whole course in one comment block</div>
      <pre class="code"><span class="cm">// axiom 1: the disk can fail between any two writes</span>
<span class="cm">//   -> never depend on multi-write atomicity you didn't build</span>
<span class="ok">//   -> log the intent first, fsync, ack, fix the pages later</span>
<span class="cm">// axiom 2: readers and writers overlap in time</span>
<span class="cm">//   -> every read is a snapshot of SOME moment, not "the" state</span>
<span class="ok">//   -> know which anomalies your isolation level lets through</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> when production misbehaves, these axioms are the diagnostic fork: data missing or duplicated after a restart &rarr; axiom one, go read the commit path. Money or inventory that doesn't add up with zero errors logged &rarr; axiom two, go read the isolation level. Two axioms, two lesson arcs, and a career's worth of incidents that suddenly have shapes.</p>` },

  { eb:"lesson 02 · foundations", title:"A table is pages", html:`
    <p class="big">"The database" is not an abstraction living in the SQL. A table is a <b class="hl">heap file</b>: an array of fixed-size <b class="hl">pages</b> (8 KB in Postgres), each holding a few dozen row versions called <b class="hl">tuples</b>. Every query, however clever, bottoms out in <b class="hl">reading and writing pages</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">one table on disk &middot; a row's address is (page, slot)</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="8" y="26" width="94" height="112" rx="9" fill="#11131c" stroke="#2c3350" stroke-width="1.2"/>
        <text x="55" y="18" fill="#8b90ab" font-size="8" text-anchor="middle">page 0 &middot; 8 KB</text>
        <rect x="116" y="26" width="94" height="112" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="163" y="18" fill="#8e86f0" font-size="8" text-anchor="middle">page 1 &middot; 8 KB</text>
        <rect x="224" y="26" width="94" height="112" rx="9" fill="#11131c" stroke="#2c3350" stroke-width="1.2"/>
        <text x="271" y="18" fill="#8b90ab" font-size="8" text-anchor="middle">page 2 &middot; 8 KB</text>
        <rect x="16" y="36" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <rect x="16" y="54" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <rect x="16" y="72" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <rect x="124" y="36" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <rect x="124" y="54" width="78" height="14" rx="4" fill="#11131c" stroke="#57e0b0" stroke-width="1.3"/>
        <text x="163" y="64.5" fill="#57e0b0" font-size="7.5" text-anchor="middle">tuple (1,2) &middot; ada&hellip;</text>
        <rect x="124" y="72" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <rect x="232" y="36" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <rect x="232" y="54" width="78" height="14" rx="4" fill="#181c2b" stroke="#2c3350"/>
        <text x="163" y="132" fill="#8b90ab" font-size="7.5" text-anchor="middle">header &middot; slot array &middot; tuples grow from the end</text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.3;0.5;1" keyPoints="0;1;1;1" path="M 20 146 L 163 100"/>
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.3;0.36;1" values="1;1;0;0"/>
        </circle>
        <text x="20" y="147" fill="#8e86f0" font-size="8">ctid (1,2) &mdash; "page 1, slot 2"</text>
        <text x="240" y="147" fill="#57e0b0" font-size="8" opacity="0">1 page read &#10003;
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.4;0.46;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">a row</div><div class="lstep seq" style="--i:0">a tuple: header (xmin, xmax &mdash; lesson 16 lives here) + your columns</div>
        <div class="lanehead seq" style="--i:1">its address</div><div class="lstep seq" style="--i:1">the TID <code>(page, slot)</code> &mdash; what every index actually stores as its "pointer"</div>
        <div class="lanehead seq" style="--i:2">a read</div><div class="lstep good seq" style="--i:2">fetch ONE 8 KB page, walk its slot array &mdash; you never read "a row" off disk, only its whole page</div>
        <div class="lanehead seq" style="--i:3">a full scan</div><div class="lstep bad seq pop" style="--i:3">5M rows &asymp; 40k+ pages, every one loaded &mdash; "why is SELECT * slow" starts here</div>
      </div>
      <div class="dnote seq" style="--i:4">The unit of I/O is the <b style="color:var(--ordered)">page</b>, never the row. Every cost you will ever read in a query plan is denominated in pages.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Between your query and those pages sits one more layer: the <b class="hl">buffer pool</b>, a cache of pages in RAM (lesson 09). Reads check it first; writes dirty pages <i>in it</i> and let background processes write them out. So the live truth of your table at any instant is <b class="hl">RAM pages + disk pages + the log</b> &mdash; which is exactly why axiom one needs careful handling: the disk copy alone is usually <i>behind</i>.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; see the physical layer from SQL</div>
      <pre class="code"><span class="cm">-- every row will show you its physical address:</span>
SELECT <span class="ok">ctid</span>, id, email FROM users LIMIT 3;
<span class="cm">--  ctid  | id | email          -- (page, slot)</span>
<span class="cm">-- (0,1)  |  1 | ada@&hellip;</span>
<span class="cm">-- (0,2)  |  2 | lin@&hellip;</span>
<span class="cm">-- table size in pages:</span>
SELECT relpages, reltuples::bigint FROM pg_class
 WHERE relname = 'users';</pre>
    </div>
    <p><b class="hl">Why it matters:</b> page-thinking converts hand-wavy performance talk into arithmetic. "Is this query fast?" becomes "how many pages does it touch, and are they hot?" &mdash; a question with an answer. Indexes (arc three) are just smaller page collections that let you touch fewer of the big ones; the buffer pool (lesson 09) decides what "hot" means.</p>` },

  { eb:"lesson 03 · foundations", title:"Sequential vs random I/O", html:`
    <p class="big">Storage has a personality: it <b class="hl">loves streams and hates hops</b>. A disk read that continues where the last one ended is orders of magnitude cheaper than one that lands somewhere random. Every storage engine ever built is a strategy for <b class="hl">converting the I/O you need into the I/O the disk likes</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">same 10,000 rows &middot; two access patterns</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="10" y="16" fill="#57e0b0" font-size="8.5">sequential &middot; one long run</text>
        <rect x="10" y="24" width="320" height="18" rx="5" fill="#11131c" stroke="#2c3350"/>
        <rect x="12" y="26" width="0" height="14" rx="4" fill="#57e0b0" opacity=".85">
          <animate attributeName="width" dur="5.5s" repeatCount="indefinite" keyTimes="0;0.35;1" values="0;316;316"/>
        </rect>
        <text x="10" y="66" fill="#ff9a6b" font-size="8.5">random &middot; a hop per row</text>
        <rect x="10" y="74" width="320" height="18" rx="5" fill="#11131c" stroke="#2c3350"/>
        <circle r="5" fill="#ff9a6b" stroke="#11131c" stroke-width="1">
          <animateMotion dur="5.5s" repeatCount="indefinite" calcMode="linear"
            path="M 40 83 L 290 83 L 90 83 L 240 83 L 60 83 L 300 83 L 140 83 L 200 83 L 30 83 L 270 83"/>
        </circle>
        <text x="10" y="116" fill="#8b90ab" font-size="8">HDD: ~5-10 ms per seek vs ~200 MB/s streaming &mdash; roughly a million-fold gap per byte</text>
        <text x="10" y="130" fill="#8b90ab" font-size="8">NVMe SSD: no head to move, but 4 KB random reads still lose to streaming &mdash;</text>
        <text x="10" y="143" fill="#8b90ab" font-size="8">and random 8 KB WRITES pay read-modify-erase on flash blocks</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">loves streams</div><div class="lstep good seq" style="--i:0">the WAL (append-only) &middot; seq scans &middot; SSTable flushes &amp; compaction &middot; replication shipping</div>
        <div class="lanehead seq" style="--i:1">hates hops</div><div class="lstep bad seq" style="--i:1">index scan &rarr; heap fetch per row &middot; random-UUID inserts &middot; B-tree leaf updates at scale</div>
        <div class="lanehead seq" style="--i:2">the pivot</div><div class="lstep seq" style="--i:2">this one asymmetry decides lesson 13's "planner ignores your index" and lesson 08's B-tree-vs-LSM</div>
      </div>
      <div class="dnote seq" style="--i:3">Rule of thumb the planner literally encodes: a random page read costs ~<b style="color:var(--race)">4&times;</b> a sequential one (<code>random_page_cost</code> = 4 vs <code>seq_page_cost</code> = 1; ~1.1 on SSDs). Everything it decides is this ratio, multiplied out.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This is why the commit path (next lesson) is shaped the way it is: the changes your transaction makes touch <b class="hl">random pages</b> all over the heap and its indexes &mdash; but the WAL converts them into <b class="hl">one sequential append</b> at commit time, and defers the random writes to a background process that can sort, batch, and coalesce them. Sequential now, random later, at leisure: the single most profitable trade in storage.</p>
    <p>It's also why <b class="hl">both</b> major engine families exist. The B-tree (lesson 06) accepts scattered page writes to keep reads bounded and sorted. The LSM (lesson 07) refuses random writes entirely &mdash; everything is an append or a sequential merge &mdash; and pays for it on the read path. Neither "solved" I/O; they picked different sides of this lesson.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the ratio, straight from the planner's config</div>
      <pre class="code"><span class="cm">-- the planner's own model of this lesson:</span>
SHOW seq_page_cost;      <span class="cm">-- 1.0</span>
SHOW <span class="ok">random_page_cost</span>;   <span class="cm">-- 4.0 (default; tune ~1.1 for SSD/NVMe)</span>
<span class="cm">-- an index scan returning 400k scattered rows is costed as</span>
<span class="cm">-- ~400k x random_page_cost — which is why, past a few percent</span>
<span class="cm">-- selectivity, the sequential scan wins the auction (lesson 13).</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> half the "database mysteries" engineers carry are this lesson unrecognized: why the planner "refuses" an index, why random UUID keys hurt, why bulk-loading in key order is fast, why the WAL is append-only, why compaction exists at all. When a storage decision seems arbitrary, ask which side of the stream/hop divide it's protecting &mdash; there's almost always an answer.</p>` },

  { eb:"lesson 04 · foundations", title:"What a commit actually guarantees", html:`
    <p class="big">When <code>COMMIT</code> returns, exactly one thing has certainly happened: <b class="hl">your transaction's log records &mdash; ending in a commit record &mdash; were fsynced to durable storage</b>. Not the table. Not the indexes. The data pages holding your row are, right now, probably <b class="hl">dirty in RAM only</b> &mdash; and that's correct.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the commit timeline &middot; where the promise attaches</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1 &middot; execute</div><div class="lstep seq" style="--i:0">UPDATE dirties heap + index pages <b>in the buffer pool</b> &middot; log records describe each change</div>
        <div class="lanehead seq" style="--i:1">2 &middot; commit</div><div class="lstep seq" style="--i:1">append the commit record &middot; <b>fsync the WAL</b> &mdash; the only synchronous disk wait in the whole path</div>
        <div class="lanehead seq" style="--i:2">3 &middot; ack</div><div class="lstep good seq pop" style="--i:2">"COMMIT" returns &mdash; the promise is now unbreakable &#10003;</div>
        <div class="lanehead seq" style="--i:3">4 &middot; later</div><div class="lstep wait seq" style="--i:3">checkpointer / background writer flushes the dirty pages &mdash; minutes later is fine</div>
        <div class="lanehead seq" style="--i:4">crash?</div><div class="lstep bad seq" style="--i:4">power dies between 3 and 4 &rarr; pages lost &rarr; <b>replay the log</b> &rarr; pages rebuilt &middot; nothing acked is lost</div>
      </div>
      <div class="qbox macro seq" style="--i:5">
        <div class="dlabel">the fine print worth knowing by name</div>
        <p style="margin:4px 0 0"><code>synchronous_commit = off</code> moves the fsync off the commit path: acks return early and a crash can lose the <b class="hl">last few hundred milliseconds of acked commits</b> (bounded, no corruption). Legitimate for metrics and logs; unconscionable for payments. The knob exists because the fsync is measurably THE cost of commit.</p>
      </div>
      <div class="dnote seq" style="--i:6">Say the invariant out loud: <b style="color:var(--ordered)">nothing is acknowledged until the log that can reproduce it is durable</b>. Everything else in the engine is allowed to be lazy because this one thing never is.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Notice what this buys, in axiom-three terms &mdash; sorry, axiom <i>one</i> terms: the transaction's scattered, random page writes became <b class="hl">one sequential append + one fsync</b> (lesson 03's favorite trade), and group commit amortizes even that fsync across concurrent transactions. Durability isn't slow; durability done write-in-place would be slow. The log is what makes it cheap.</p>
    <p>And notice what it does NOT promise: that anyone else can <i>see</i> your commit in any particular order relative to theirs (that's isolation, arc four), or that a replica has it (that's lesson 26). Durability is exactly one fsync wide. The rest of the guarantees are negotiated separately &mdash; which is why they can fail separately.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; where each guarantee physically lives (Postgres)</div>
      <pre class="code"><span class="cm">-- the log itself: pg_wal/ — 16 MB segments, append-only</span>
<span class="cm">-- the sync policy:</span>
SHOW synchronous_commit;   <span class="cm">-- on = fsync before ack (the default)</span>
SHOW wal_sync_method;      <span class="cm">-- how fsync is issued (fdatasync…)</span>
<span class="cm">-- watch commits wait on exactly one thing:</span>
SELECT wait_event FROM pg_stat_activity
 WHERE wait_event_type = 'IO';   <span class="ok">-- WALSync, right at commit</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the interview question hiding inside every durability discussion &mdash; "COMMIT returned and the machine died before any table page was written; is the data safe?" The senior answer is <i>yes, and here's the ordering</i>. It's also the on-call diagnostic: slow commits mean a slow WAL device or a checkpoint storm, not "the table is big." The next lesson follows the log into its day job: crash recovery.</p>` },
];

/* ---- lesson <-> skill cross-links ----
   Lessons teach a concept; the matching skill checks comprehension from a
   different angle. Indices reference the FINAL lesson order (see the LESSON
   PLAN at the top of this file) — packs 10-40 fill in lessons 4-25. */
// skill (drill) id -> the lesson whose concept it tests (0-based index)
const DRILL_LESSON = {
  walwrite:3, btreesplit:5, lsmread:6, bloom:6, mvccvis:15, rowlock:18, waitfor:19, versioncas:20,
  crashreplay:4, lostupdate:16, writeskew:17, phantom:16, expandcontract:24, nplusone:22, poolexhaust:21, readyourwrites:25,
};
// lesson index -> where to go practice it { mod, drill? }
const LESSON_PRACTICE = {
  0:{mod:"model"}, 1:{mod:"model"}, 2:{mod:"tradeoffs"}, 3:{mod:"primitives",drill:"walwrite"},
  4:{mod:"bank",drill:"crashreplay"}, 5:{mod:"primitives",drill:"btreesplit"}, 6:{mod:"primitives",drill:"lsmread"},
  7:{mod:"tradeoffs"}, 8:{mod:"write"}, 9:{mod:"tradeoffs"}, 10:{mod:"write"}, 11:{mod:"model"},
  12:{mod:"model"}, 13:{mod:"model"}, 14:{mod:"tradeoffs"}, 15:{mod:"primitives",drill:"mvccvis"},
  // 11 (covering indexes) points at tradeoffs: the INCLUDE/covering card probes it
  16:{mod:"bank",drill:"lostupdate"}, 17:{mod:"isosim"}, 18:{mod:"primitives",drill:"rowlock"},
  19:{mod:"primitives",drill:"waitfor"}, 20:{mod:"primitives",drill:"versioncas"}, 21:{mod:"bank",drill:"poolexhaust"},
  22:{mod:"bank",drill:"nplusone"}, 23:{mod:"model"}, 24:{mod:"bank",drill:"expandcontract"}, 25:{mod:"bank",drill:"readyourwrites"},
};
