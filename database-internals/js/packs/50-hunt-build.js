"use strict";
/* Database Internals Bootcamp — pack 50: spot-the-bug + write-it.
   Appends 5 BUGHUNT cards and 7 WRITE exercises: serializable retries,
   online migrations, LSM compaction and bloom filters, row-lock managers,
   deadlock detection, optimistic CAS, connection pooling, batched
   backfills, and the leftmost-prefix rule. Loads after content.js and the
   lesson packs, before the shared engine — everything pushed here is a
   first-class citizen of progress, test mode, and review. */
(function () {

/* ---- spot-the-bug: five full implementations, one subtle fault each ---- */
BUGHUNT.push(
  { id:"bug_retry", title:"Serializable retry wrapper", why:"retry the whole transaction, reads included", lesson:17,
    scenario:"A funds-transfer endpoint runs at SERIALIZABLE with retries, and the books almost balance. Overdrafts cluster overwhelmingly on transfers whose logs contain a serialization-retry entry — first-attempt transfers are almost never affected — and load tests without contention pass forever. Which line?",
    lines:[
      "async function transferWithRetry(db, from, to, amount) {",
      "  const src = await db.get(",
      "    \"SELECT balance FROM accounts WHERE id = $1\", [from]);",
      "",
      "  for (let attempt = 1; attempt <= 3; attempt++) {",
      "    try {",
      "      await db.query(\"BEGIN ISOLATION LEVEL SERIALIZABLE\");",
      "      if (src.balance < amount) {",
      "        await db.query(\"ROLLBACK\");",
      "        return { ok: false, reason: \"insufficient\" };",
      "      }",
      "      await db.query(",
      "        \"UPDATE accounts SET balance = $1 WHERE id = $2\",",
      "        [src.balance - amount, from]);",
      "      await db.query(",
      "        \"UPDATE accounts SET balance = balance + $1 WHERE id = $2\",",
      "        [amount, to]);",
      "      await db.query(\"COMMIT\");",
      "      return { ok: true };",
      "    } catch (err) {",
      "      await db.query(\"ROLLBACK\");",
      "      if (err.code !== \"40001\") throw err;  // only serialization failures retry",
      "    }",
      "  }",
      "  throw new Error(\"transfer: retries exhausted\");",
      "}",
    ],
    bug:[1,2],
    explain:"Lines 2–3 read the source balance ONCE, before the retry loop — outside every transaction the loop will ever run. A first attempt usually gets away with it (the stale window is one network hop); but when SERIALIZABLE aborts with 40001, the retry re-runs only the WRITES against the original read: another transaction drained the account between attempts, src.balance is stale, the insufficient-funds check passes on dead data, and the debit UPDATE stores a balance computed from a world that no longer exists — which is why overdrafts cluster on retried transfers. Retrying a serialization failure means re-running the WHOLE transaction, reads included: move the SELECT inside the loop, after BEGIN, so every attempt decides from fresh data (which also closes the small first-attempt gap). The catch block is the decoy and it is exactly right — ROLLBACK first, then rethrow anything that isn't 40001." },

  { id:"bug_migration", title:"Deploy migration script", why:"an index build can block every write", lesson:24,
    scenario:"The migration was rehearsed on staging and took 40 seconds. In production, the moment step 3 starts, every INSERT and UPDATE on users hangs — for the ~20 minutes the build needs on the 200M-row table — p99 explodes, queues back up through the API, and on-call aborts the deploy. Reads were fine the whole time. Which line?",
    lines:[
      "async function migrate(db) {",
      "  // never queue forever behind a long-running transaction",
      "  await db.query(\"SET lock_timeout = '3s'\");",
      "",
      "  // step 1: expand — nullable, no default: metadata-only, instant",
      "  await db.query(",
      "    \"ALTER TABLE users ADD COLUMN email_normalized text\");",
      "",
      "  // step 2: backfill in bounded batches, one short tx each",
      "  let filled;",
      "  do {",
      "    const res = await db.query(",
      "      \"UPDATE users SET email_normalized = lower(email) \" +",
      "      \"WHERE id IN (SELECT id FROM users \" +",
      "      \" WHERE email_normalized IS NULL LIMIT 5000)\");",
      "    filled = res.rowCount;",
      "  } while (filled > 0);",
      "",
      "  // step 3: enforce uniqueness on the normalized value",
      "  await db.query(",
      "    \"CREATE UNIQUE INDEX users_email_normalized_idx \" +",
      "    \"ON users (email_normalized)\");",
      "}",
    ],
    bug:[20],
    explain:"Line 21 builds the unique index with a plain CREATE INDEX, which takes a SHARE lock on users for the entire build — reads proceed, but every INSERT, UPDATE, and DELETE blocks until the index is finished, and on 200M rows that is the whole deploy window. The fix is CREATE UNIQUE INDEX CONCURRENTLY: it builds without blocking writes, at the price of scanning the table twice, it CANNOT run inside a transaction block, and on failure it leaves an INVALID index behind — drop it and retry. The batched backfill loop above is the decoy and it is correct: bounded batches, one short transaction each, terminating on zero rows. Note that the lock_timeout on line 3 can't save you here — the index build acquires its lock instantly; it's the twenty minutes it spends HOLDING it that hurts." },

  { id:"bug_compaction", title:"SSTable compaction", why:"newest wins the merge — tombstones too", lesson:6,
    scenario:"Reads are correct all day. Every night after the compaction job fires, support tickets arrive in a batch: customer edits from the last few days have reverted, and records deleted last week are back. The write path, the WAL, and the flush code have all been audited clean. Which line?",
    lines:[
      "const TOMBSTONE = \"__tombstone__\";",
      "",
      "// entries: sorted arrays of [key, value]; newer shadows older",
      "function mergeSSTables(newer, older) {",
      "  const out = [];",
      "  let i = 0, j = 0;",
      "  while (i < newer.length && j < older.length) {",
      "    if (newer[i][0] < older[j][0]) {",
      "      out.push(newer[i]); i++;",
      "    } else if (newer[i][0] > older[j][0]) {",
      "      out.push(older[j]); j++;",
      "    } else {",
      "      out.push(older[j]);          // same key in both tables",
      "      i++; j++;",
      "    }",
      "  }",
      "  while (i < newer.length) out.push(newer[i++]);",
      "  while (j < older.length) out.push(older[j++]);",
      "  return out;",
      "}",
    ],
    bug:[12],
    explain:"Line 13 resolves the equal-keys case by keeping the OLDER table's entry — compaction discards exactly what it exists to preserve. The shadowing invariant of an LSM is that the newest version wins the merge, always: this line replaces recent edits with their pre-edit values every night, and deletes are worse — the tombstone lives in the NEWER table, so it is dropped and the older live value it was shadowing walks out of the merge alive. The fix is out.push(newer[i]) (still advancing both pointers). And notice what is NOT a bug: keeping tombstones with no special-case drop is correct here — a tombstone may only be discarded when the merge reaches the bottom level, where nothing older can hide beneath it. The tail drains on lines 17–18 are fine too." },

  { id:"bug_bloom", title:"SSTable bloom filter", why:"a bloom filter may lie yes, never no", lesson:6,
    scenario:"Reads intermittently return not-found for rows flushed hours ago — while the SSTable file on disk provably contains them, and the same key sometimes reads fine minutes later. Disabling the bloom-filter check makes every read correct (and slow). Which line?",
    lines:[
      "// hash(key, seed) -> uint32; seeded hash, provided by the engine",
      "class BloomFilter {",
      "  constructor(m, k) {",
      "    this.m = m;                      // bits in the array",
      "    this.k = k;                      // hash functions per key",
      "    this.bits = new Uint8Array(m);",
      "  }",
      "",
      "  add(key) {",
      "    this.bits[hash(key, 0) % this.m] = 1;",
      "  }",
      "",
      "  mightContain(key) {",
      "    for (let i = 0; i < this.k; i++) {",
      "      if (this.bits[hash(key, i) % this.m] === 0)",
      "        return false;                // definitely not here",
      "    }",
      "    return true;                     // maybe here",
      "  }",
      "}",
      "",
      "// read path: the filter's \"no\" skips the disk probe entirely",
      "function readSSTable(table, key) {",
      "  if (!table.bloom.mightContain(key)) return undefined;",
      "  return diskProbe(table, key);",
      "}",
    ],
    bug:[9],
    explain:"Line 10 sets a single bit — hash(key, 0) only — while mightContain demands all k bits. The bits for seeds 1 through k−1 were never set, so a key that IS in the table reads a zero at some seed and the filter answers false: a FALSE NEGATIVE, the one answer a bloom filter is never allowed to give. The read path takes 'definitely not here' at its word and never opens the file — an intermittent not-found for data that provably exists, which 'heals' whenever some other key happens to set the missing bits. add() must loop exactly like the check does: for i in 0..k−1, set bits[hash(key, i) % m] = 1. The all-k loop in mightContain is the decoy — requiring every bit on the read side is exactly right: a false positive costs one wasted disk probe, a false negative costs the data." },

  { id:"bug_lockmgr", title:"Row-lock manager", why:"release hands off — it never unlocks into the void", lesson:18,
    scenario:"Under production load a balance occasionally double-applies one update — two workers both swear they held the row lock. It never reproduces in tests, and adding logging around acquire/release makes it vanish entirely. Which line?",
    lines:[
      "class RowLockManager {",
      "  #locks = new Map();  // rowId -> { holder, queue: [{ tx, resolve }] }",
      "",
      "  acquire(rowId, tx) {",
      "    const lock = this.#locks.get(rowId);",
      "    if (!lock) {",
      "      // fast path: nobody holds this row",
      "      this.#locks.set(rowId, { holder: tx, queue: [] });",
      "      return Promise.resolve();",
      "    }",
      "    return new Promise((resolve) => {",
      "      lock.queue.push({ tx, resolve });  // park, FIFO per row",
      "    });",
      "  }",
      "",
      "  release(rowId, tx) {",
      "    const lock = this.#locks.get(rowId);",
      "    if (!lock || lock.holder !== tx) return;",
      "    if (lock.queue.length === 0) {",
      "      this.#locks.delete(rowId);       // no waiters — the row is free",
      "      return;",
      "    }",
      "    const next = lock.queue.shift();",
      "    this.#locks.delete(rowId);         // free the row, then wake the waiter",
      "    next.resolve();",
      "  }",
      "}",
    ],
    bug:[23],
    explain:"Line 24 frees the row and THEN wakes the waiter: after the delete, the lock is observably free for the gap between release and the woken waiter's microtask. An acquire arriving inside that gap finds no entry, takes the fast path, and grants immediately — then the woken waiter proceeds too: two transactions inside the same row's critical section, one double-applied update, at a rate low enough that adding logging perturbs the timing and 'fixes' it. Say the invariant out loud: the lock must never be observably free while a waiter exists — release is a HAND-OFF, not an unlock. Keep the entry and transfer ownership before resolving: lock.holder = next.tx; next.resolve(). The delete on line 20 is the decoy and it is correct — with an empty queue there is nobody to hand to, and the row really is free." },
);

/* ---- write-it: seven implementations, assembled and actually run ---- */
WRITE.push(
  { id:"w-lsm", title:"LSM read path — write it", why:"memtable first, then newest-first — first hit decides", lesson:6,
    spec:"Write put() and get(). put(key, val) sets into the memtable and flushes once the memtable reaches flushAt entries. get(key) checks the memtable first, then the SSTables in array order — index 0 is newest, because flush() unshifts — and the FIRST table that has the key decides: TOMBSTONE means the key is deleted, return undefined. Older versions below the first hit are shadowed, not gone.",
    pre:`const TOMBSTONE = "__tombstone__";
class LSM {
  constructor(flushAt) {
    this.memtable = new Map();
    this.sstables = [];        // index 0 = newest (flush unshifts)
    this.flushAt = flushAt;
  }
  flush() {
    if (this.memtable.size === 0) return;
    this.sstables.unshift(new Map(this.memtable));
    this.memtable.clear();
  }`,
    post:`}`,
    lines:[
      "  put(key, val) {",
      "    this.memtable.set(key, val);",
      "    if (this.memtable.size >= this.flushAt) this.flush();",
      "  }",
      "  get(key) {",
      "    if (this.memtable.has(key)) {",
      "      const v = this.memtable.get(key);",
      "      return v === TOMBSTONE ? undefined : v;",
      "    }",
      "    for (const t of this.sstables) {",
      "      if (t.has(key)) {",
      "        const v = t.get(key);",
      "        return v === TOMBSTONE ? undefined : v;",
      "      }",
      "    }",
      "    return undefined;",
      "  }",
    ],
    distractors:[
      { code:"    for (let i = this.sstables.length - 1; i >= 0; i--) {\n      const t = this.sstables[i];\n      if (t.has(key)) {\n        const v = t.get(key);\n        return v === TOMBSTONE ? undefined : v;\n      }\n    }",
        why:"Walks the SSTables oldest-first, so the first table that has the key serves the OLDEST version — after every flush, overwrites revert and deleted rows resurrect. Index 0 is newest because flush() unshifts; the walk starts there and stops at the first hit." },
      { code:"  get(key) {\n    for (const t of this.sstables) {\n      if (t.has(key)) {\n        const v = t.get(key);\n        return v === TOMBSTONE ? undefined : v;\n      }\n    }\n    const v = this.memtable.get(key);\n    return v === TOMBSTONE ? undefined : v;\n  }",
        why:"Checks the flushed tables before the memtable — a key written moments ago keeps reading its pre-flush value until the next flush. Read-your-own-write breaks: the memtable holds the newest data and must answer first." },
      { code:"  put(key, val) {\n    this.memtable.set(key, val);\n  }",
        why:"No flush trigger: the memtable grows without bound and nothing ever reaches an SSTable — RAM climbs until the process dies, and since the memtable is memory, the on-disk state is one crash away from being nothing but a WAL replay of the entire history." },
    ],
    test:`const db = new LSM(2);
db.put("a", 1); db.put("b", 1);      // flush 1: {a:1, b:1}
db.put("a", 2); db.put("c", 1);      // flush 2: {a:2, c:1}
db.put("a", 3); db.put("x", 9);      // flush 3: {a:3, x:9}
assert(db.sstables.length === 3, "flushAt=2 must have flushed three times, got " + db.sstables.length);
assert(db.get("a") === 3, "a was overwritten across two flushes - the NEWEST version must win, got " + db.get("a"));
assert(db.get("b") === 1, "b lives only in the oldest sstable and must still be found");
log("a -> " + db.get("a") + " (newest of three versions); b -> " + db.get("b") + " (found in the oldest table)");
db.put("b", TOMBSTONE);
assert(db.get("b") === undefined, "a tombstone in the memtable must hide the older value on disk");
db.put("z", 5);                      // flush 4 carries the tombstone
assert(db.get("b") === undefined, "a flushed tombstone must keep shadowing the older value");
assert(db.get("z") === 5, "z flushed normally and must still read back");
log("delete-by-tombstone: b reads undefined before and after the flush");
db.put("m", 7);
assert(db.get("m") === 7, "an unflushed memtable write must be visible immediately");
assert(db.get("nope") === undefined, "a key never written reads undefined");
log("read path holds: memtable, then sstables newest-first, first hit wins");`,
    pass:"memtable first, newest table wins, tombstones shadow — the read path holds",
    takeaway:"An LSM never updates in place — a key can exist in many tables at once, so correctness is a search order: memtable, then SSTables newest-first, and the FIRST hit decides (tombstones included).",
    hint:"put(): set into the memtable, then flush() when size >= flushAt. get(): memtable first (TOMBSTONE -> undefined); then for (const t of this.sstables) in array order — index 0 is newest because flush() unshifts — return on the first table that has() the key, mapping TOMBSTONE to undefined; fall through to undefined." },

  { id:"w-waitfor", title:"Deadlock detector — write it", why:"a deadlock is a ring in the wait-for graph", lesson:19,
    spec:"Write the cycle detector. For each transaction as a start node, walk the waits-for chain (each tx waits for at most one other), collecting the path and a seen-set. If the walk returns to its start, that path IS the deadlock — return it. If the chain ends (a tx that waits for nothing) or revisits a node seen this walk, move to the next start. No cycle from any start: return null.",
    pre:`function findCycle(waitFor) {  // Map: txId -> the txId it waits for`,
    post:`}`,
    lines:[
      "  for (const start of waitFor.keys()) {",
      "    const seen = new Set([start]);",
      "    const path = [start];",
      "    let cur = waitFor.get(start);",
      "    while (cur !== undefined) {",
      "      if (cur === start) return path;   // the walk came home",
      "      if (seen.has(cur)) break;         // joins a loop that skips start",
      "      seen.add(cur);",
      "      path.push(cur);",
      "      cur = waitFor.get(cur);",
      "    }",
      "  }",
      "  return null;",
    ],
    distractors:[
      { code:"  for (const [tx, waitsOn] of waitFor)\n    if (waitsOn === tx) return [tx];\n  return null;",
        why:"Only catches a transaction waiting on itself. A real deadlock is almost always a ring of two or more transactions — this detector reports null while both sit blocked forever, until a lock_timeout reaper or an angry human intervenes." },
      { code:"    let cur = waitFor.get(start);\n    while (cur !== undefined) {\n      if (cur === start) return path;\n      path.push(cur);\n      cur = waitFor.get(cur);\n    }",
        why:"No seen-set: a walk that enters a cycle NOT passing through its start orbits it forever — the deadlock detector itself deadlocks, pinning a core at 100% while the transactions it was meant to rescue stay stuck." },
      { code:"      if (path.length > waitFor.size) return path;",
        why:"A long chain is not a ring. This aborts a victim in a perfectly healthy convoy of waiters — killing live transactions — while the real test is geometric: only a walk that returns to its start proves no member can ever proceed." },
    ],
    test:`const chain = new Map([["t1","t2"],["t2","t3"]]);
assert(findCycle(chain) === null, "a straight chain t1->t2->t3 is waiting, not deadlock");
log("chain of three: no cycle reported");
const ring = new Map([["t1","t2"],["t2","t3"],["t3","t1"]]);
const c1 = findCycle(ring);
assert(Array.isArray(c1), "t1->t2->t3->t1 is a deadlock - the walk must come home");
assert(c1.length === 3, "the cycle has exactly three members, got " + c1.length);
for (const t of ["t1","t2","t3"])
  assert(c1.indexOf(t) !== -1, "the reported cycle must contain " + t + ", got [" + c1.join(",") + "]");
log("ring detected: [" + c1.join(" -> ") + "] -> back to " + c1[0]);
const tail = new Map([["t4","t1"],["t1","t2"],["t2","t1"]]);
const c2 = findCycle(tail);
assert(Array.isArray(c2), "the t1<->t2 ring must be found even though t4 only feeds into it");
assert(c2.indexOf("t1") !== -1 && c2.indexOf("t2") !== -1, "the cycle is t1<->t2, got [" + c2.join(",") + "]");
assert(c2.indexOf("t4") === -1, "t4 waits ON the cycle but is not IN it, got [" + c2.join(",") + "]");
log("tail-into-cycle terminated (no infinite orbit) and reported [" + c2.join(" <-> ") + "]");
assert(findCycle(new Map()) === null, "an empty wait-for graph has no deadlock");`,
    pass:"chains cleared, rings caught, tails terminated — the detector never spins",
    takeaway:"A deadlock is not a timeout — it is a cycle in the wait-for graph, and the proof is geometric: the walk returned to where it started, so no member of the ring can ever proceed. That is exactly what Postgres runs after deadlock_timeout before aborting one victim with 40P01.",
    hint:"Outer loop over waitFor.keys(). Per start: seen = new Set([start]), path = [start], cur = waitFor.get(start). While cur !== undefined: cur === start -> return path; seen.has(cur) -> break; otherwise add cur to seen, push it onto path, advance cur = waitFor.get(cur). After all starts fail: return null." },

  { id:"w-cas", title:"Optimistic CAS loop — write it", why:"read, compute, CAS — a miss means re-read, not re-send", lesson:20,
    spec:"Write the optimistic loop. Each attempt: re-read the row, refuse with { ok: false, reason: \"insufficient\" } when stock < qty, then compare-and-set — the UPDATE only matches while version is still the one you read. One row matched: return { ok: true, attempts }. Zero rows: someone committed in between — loop back to a FRESH read. Budget spent: throw.",
    pre:`// db.get(id) -> Promise<{ stock, version }>
// db.casUpdate(id, expectedVersion, newStock) -> Promise<0|1>
//   UPDATE items SET stock = $3, version = version + 1
//   WHERE id = $1 AND version = $2      -- rows matched: 0 or 1
async function decrementStock(db, id, qty, maxAttempts = 5) {`,
    post:`}`,
    lines:[
      "  for (let a = 1; a <= maxAttempts; a++) {",
      "    const row = await db.get(id);        // fresh read, EVERY attempt",
      "    if (row.stock < qty)",
      "      return { ok: false, reason: \"insufficient\" };",
      "    const n = await db.casUpdate(id, row.version, row.stock - qty);",
      "    if (n === 1) return { ok: true, attempts: a };",
      "  }",
      "  throw new Error(\"contention: retries exhausted\");",
    ],
    distractors:[
      { code:"  const row = await db.get(id);\n  for (let a = 1; a <= maxAttempts; a++) {",
        why:"The read sits outside the loop, so every retry replays the same stale version number — the CAS matches 0 rows forever and the call exhausts its budget the moment there is any contention at all. A CAS miss means reality changed; the retry must begin by re-reading reality." },
      { code:"    const n = await db.query(\"UPDATE items SET stock = $2 WHERE id = $1\", [id, row.stock - qty]);",
        why:"No version predicate — this is a plain read-modify-write: two buyers of the last unit both read stock 1, both write 0, both report success. That is the lost update this entire pattern exists to kill; the WHERE version = $2 clause is the whole mechanism." },
      { code:"    await db.casUpdate(id, row.version, row.stock - qty);\n    return { ok: true, attempts: a };",
        why:"Reports success without checking rows-matched. A CAS that hit 0 rows is a silent no-op, and this returns ok anyway — a silent oversell, discovered by the warehouse when the shelf is empty, not by the code." },
    ],
    test:`let store = { stock: 10, version: 1 };
let injected = false;
const db = {
  async get() { return { stock: store.stock, version: store.version }; },
  async casUpdate(id, expectedVersion, newStock) {
    if (!injected) {
      injected = true;
      // a concurrent buyer takes 3 units first - this CAS will miss
      store = { stock: store.stock - 3, version: store.version + 1 };
    }
    if (expectedVersion !== store.version) return 0;
    store = { stock: newStock, version: store.version + 1 };
    return 1;
  },
};
const r = await decrementStock(db, "sku", 2);
assert(r.ok === true, "the retry must eventually win, got ok=" + r.ok);
assert(r.attempts === 2, "first CAS misses (concurrent write), the re-read wins - attempts must be 2, got " + r.attempts);
assert(store.stock === 5, "10 - 3 (concurrent) - 2 (ours) = 5, got " + store.stock + " - was the retry computed from a stale read?");
log("CAS missed once, re-read, applied: stock " + store.stock + " at version " + store.version);
const db2 = {
  async get() { return { stock: 1, version: 1 }; },
  async casUpdate() { throw new Error("must not attempt the update when stock is short"); },
};
const r2 = await decrementStock(db2, "sku", 2);
assert(r2.ok === false && r2.reason === "insufficient", "1 in stock, 2 wanted: refuse before touching the row");
log("insufficient stock refused without a write");
let gets = 0;
const db3 = {
  async get() { gets++; return { stock: 10, version: 1 }; },
  async casUpdate() { return 0; },
};
let threw = false;
try { await decrementStock(db3, "sku", 1, 3); } catch (e) { threw = true; }
assert(threw, "an exhausted retry budget must throw, never return quietly");
assert(gets === 3, "every attempt must RE-READ: 3 attempts = 3 gets, got " + gets);
log("always-losing CAS: 3 fresh reads, 3 misses, then the contention error surfaced");`,
    pass:"a CAS miss re-read the world, retried once, and the ledger added up",
    takeaway:"Optimistic concurrency is compare-and-set at the row: the version predicate turns 'last write wins' into 'stale write loses' — and every retry must restart from a fresh read, because the version you just lost with is dead forever.",
    hint:"for (let a = 1; a <= maxAttempts; a++): await db.get(id) INSIDE the loop; if row.stock < qty return the refusal; n = await db.casUpdate(id, row.version, row.stock - qty); if n === 1 return { ok: true, attempts: a }. After the loop, throw — exhaustion is an error, not a result." },

  { id:"w-pool", title:"Connection pool — write it", why:"a released conn is handed off, never dropped in the lobby", lesson:21,
    spec:"Write acquire() and release(). acquire(): an idle conn resolves immediately — and is REMOVED from idle; otherwise create a promise, park its resolve on the waiters queue, and return the promise. release(conn): if anyone is waiting, hand the conn DIRECTLY to the oldest waiter — it never touches the idle list — otherwise push it back to idle.",
    pre:`class Pool {
  constructor(conns) {
    this.idle = conns.slice();
    this.waiters = [];
  }`,
    post:`}`,
    lines:[
      "  acquire() {",
      "    if (this.idle.length > 0)",
      "      return Promise.resolve(this.idle.pop());",
      "    return new Promise((resolve) => {",
      "      this.waiters.push({ resolve });   // park, FIFO",
      "    });",
      "  }",
      "  release(conn) {",
      "    if (this.waiters.length > 0)",
      "      this.waiters.shift().resolve(conn);  // direct hand-off",
      "    else",
      "      this.idle.push(conn);",
      "  }",
    ],
    distractors:[
      { code:"      this.waiters.pop().resolve(conn);   // serve the most recent",
        why:"LIFO: the newest arrival is served first, so under sustained load the request that has waited LONGEST keeps losing — it starves past its HTTP timeout while newcomers breeze through. A queue in front of a scarce resource is FIFO: shift()." },
      { code:"    this.idle.push(conn);\n    if (this.waiters.length > 0)\n      this.waiters.shift().resolve(this.idle.pop());",
        why:"For a moment the conn sits in idle while a waiter exists — an acquire() landing between the push and the pop takes the fast path and steals it, and the waiter gets the same connection. One conn granted to two requests interleaves their transactions on a single session. Hand off directly; a released conn must never be observably idle while anyone waits." },
      { code:"      return Promise.resolve(this.idle[0]);",
        why:"Reads the head without removing it — two back-to-back acquires resolve with the SAME connection, and both requests interleave statements on one session: transaction state cross-contaminates immediately. Acquisition IS removal: pop()." },
    ],
    test:`const p = new Pool(["c1", "c2"]);
const a = await p.acquire();
const b = await p.acquire();
assert(a !== b, "two acquires must receive two DIFFERENT connections, both got " + a);
assert((a === "c1" || a === "c2") && (b === "c1" || b === "c2"), "handed-out conns must come from the pool");
assert(p.idle.length === 0, "both conns are out - idle must be empty, has " + p.idle.length);
let got = null;
p.acquire().then((c) => { got = c; });
await sleep(0);
assert(got === null, "a third acquire on an empty pool must wait, but it resolved with " + got);
log("two conns handed out; the third caller parked in the queue");
p.release("c1");
await sleep(0);
assert(got === "c1", "the released conn must go to the WAITER, got " + got);
assert(p.idle.length === 0, "a handed-off conn must never touch the idle list, idle has " + p.idle.length);
log("release handed c1 straight to the waiter - idle stayed empty");
let w1 = null, w2 = null;
p.acquire().then((c) => { w1 = c; });
p.acquire().then((c) => { w2 = c; });
await sleep(0);
p.release("A");
p.release("B");
await sleep(0);
assert(w1 === "A", "FIFO: the FIRST waiter takes the first release, got w1=" + w1);
assert(w2 === "B", "FIFO: the second waiter takes the second release, got w2=" + w2);
log("two queued waiters served strictly in arrival order");`,
    pass:"drained, queued, handed off in arrival order — and idle never lied",
    takeaway:"The pool has two invariants: acquisition is removal (a conn is never in idle and in a request's hands at once), and release is a direct hand-off — a conn must never be observably idle while a waiter exists. The same hand-off rule as a row-lock queue, one layer up the stack.",
    hint:"acquire(): this.idle.length > 0 ? Promise.resolve(this.idle.pop()) : new Promise((resolve) => this.waiters.push({ resolve })). release(conn): this.waiters.length > 0 ? this.waiters.shift().resolve(conn) : this.idle.push(conn). shift, not pop — the queue is FIFO." },

  { id:"w-retry", title:"Serialization-failure retry — write it", why:"40001 is an instruction: run it again", lesson:17,
    spec:"Write the loop. Call runTx(attempt) and return its result. On error: 40001 (serialization failure) and 40P01 (deadlock victim) mean the WHOLE transaction should run again — loop. Any other error propagates immediately, unretried. When the attempt budget runs out, throw an exhaustion error — never return silently.",
    pre:`// SERIALIZABLE aborts are the mechanism, not a malfunction —
// 40001 means: run the WHOLE transaction again, from the top.
async function withSerializableRetry(runTx, maxAttempts = 3) {`,
    post:`}`,
    lines:[
      "  for (let attempt = 1; attempt <= maxAttempts; attempt++) {",
      "    try {",
      "      return await runTx(attempt);",
      "    } catch (err) {",
      "      if (err.code !== \"40001\" && err.code !== \"40P01\") throw err;",
      "    }",
      "  }",
      "  throw new Error(\"serialization retries exhausted after \" + maxAttempts + \" attempts\");",
    ],
    distractors:[
      { code:"    } catch (err) {\n      // transient, probably - retry\n    }",
        why:"Retries EVERY failure: a unique-key violation or a plain bug in the transaction body gets re-run three times — you just re-executed a payment insert three times — and then surfaces as a misleading 'retries exhausted'. Only 40001 and 40P01 mean run-me-again; everything else means stop, now." },
      { code:"      if (!err.message.includes(\"serialize\")) throw err;",
        why:"Matching the message text is driver- and locale-fragile: a deadlock victim says 'deadlock detected' and is NOT retried, a pooled driver may rewrap the text, a non-English server locale changes it entirely. SQLSTATE is the contract — compare err.code against 40001/40P01." },
      { code:"  return undefined;   // out of attempts",
        why:"Exhaustion reads as success: the caller awaits, gets undefined, and carries on — the transfer silently never happened, and nobody finds out until the ledger is audited. Running out of retries is a failure and must throw." },
    ],
    test:`let calls = 0;
const flaky = async () => {
  calls++;
  if (calls < 3) { const e = new Error("could not serialize access"); e.code = "40001"; throw e; }
  return "done";
};
const r = await withSerializableRetry(flaky);
assert(r === "done", "the third attempt succeeds and its value must come back, got " + r);
assert(calls === 3, "two 40001 aborts then success = exactly 3 calls, got " + calls);
log("two serialization aborts retried; the third attempt committed");
calls = 0;
const victim = async () => {
  calls++;
  if (calls === 1) { const e = new Error("deadlock detected"); e.code = "40P01"; throw e; }
  return "ok";
};
const r2 = await withSerializableRetry(victim);
assert(r2 === "ok" && calls === 2, "a 40P01 deadlock victim retries once and succeeds - the survivor already committed");
log("deadlock victim (40P01) retried and won on attempt 2");
calls = 0;
let caught = null;
try {
  await withSerializableRetry(async () => { calls++; const e = new Error("duplicate key"); e.code = "23505"; throw e; });
} catch (e) { caught = e; }
assert(caught !== null && caught.code === "23505", "a unique violation is NOT retryable and must propagate as itself");
assert(calls === 1, "non-retryable errors must surface after exactly 1 call, got " + calls);
log("23505 propagated immediately - no blind re-run of a broken insert");
calls = 0;
caught = null;
try {
  await withSerializableRetry(async () => { calls++; const e = new Error("could not serialize access"); e.code = "40001"; throw e; });
} catch (e) { caught = e; }
assert(caught !== null && caught.message.indexOf("exhausted") !== -1, "an always-aborting tx must surface the exhaustion error, got " + (caught && caught.message));
assert(calls === 3, "the default budget is 3 attempts, got " + calls);
log("always-40001: 3 attempts, then exhaustion thrown honestly");`,
    pass:"retried the retryable, propagated the rest, and exhaustion threw",
    takeaway:"Under SERIALIZABLE (and among deadlock victims) aborts are the mechanism working, so the retry filter is a whitelist of exactly two SQLSTATEs — 40001 and 40P01 — and running out of budget is an error, never a shrug.",
    hint:"for (attempt = 1..maxAttempts): try { return await runTx(attempt); } catch (err) { if (err.code !== \"40001\" && err.code !== \"40P01\") throw err; }. After the loop, throw the exhaustion error — the return-on-success inside try is what ends the happy path." },

  { id:"w-backfill", title:"Batched backfill — write it", why:"many short transactions, one bored observer", lesson:24,
    spec:"Write the driver loop. Repeatedly claim a batch — each claimBatch call is one short transaction on the database side — counting batches and rows as you go. A claim that returns 0 means the table is done: stop and return { batches, rows }. Every claimed row must be counted, including the final partial batch.",
    pre:`// One giant UPDATE is an incident: a single hours-long transaction
// pins the xmin horizon (vacuum can't clean ANYTHING while it runs),
// spikes WAL and replication lag, and holds every touched row's lock
// until the one commit at the end. Claim small batches instead.
// db.claimBatch(limit) -> Promise<number>
//   fills up to \`limit\` unfilled rows in ONE short transaction,
//   returns the number of rows it filled (0 = nothing left)
async function backfill(db, batchSize) {`,
    post:`}`,
    lines:[
      "  let batches = 0, rows = 0;",
      "  for (;;) {",
      "    const n = await db.claimBatch(batchSize);",
      "    if (n === 0) break;      // the table said: done",
      "    batches++;",
      "    rows += n;",
      "  }",
      "  return { batches, rows };",
    ],
    distractors:[
      { code:"    const n = await db.claimAll();   // one statement, simpler",
        why:"The incident verbatim: one transaction rewrites 200M rows — hours of held row locks, a pinned snapshot that freezes vacuum for the whole database, and a WAL burst that puts every replica minutes behind. The entire point of the driver is many short transactions." },
      { code:"    if (n === 0) continue;",
        why:"The terminator never fires: when the table is done, claimBatch returns 0 and the loop just asks again, forever — the deploy job spins at 100% re-querying an empty result until someone kills it. Zero rows means finished: break." },
      { code:"    if (n < batchSize) break;\n    batches++;\n    rows += n;",
        why:"Stops on the first partial batch WITHOUT counting it — the final rows are claimed in the database but missing from the report, monitoring says the backfill came up short, and someone re-runs the whole job or 'fixes' the data by hand." },
    ],
    test:`let unfilled = 25, claims = 0, maxClaim = 0;
const db = {
  async claimBatch(limit) {
    claims++;
    const n = Math.min(limit, unfilled);
    maxClaim = Math.max(maxClaim, n);
    unfilled -= n;
    return n;
  },
};
const r = await backfill(db, 10);
assert(r.batches === 3, "25 rows at batch size 10 = 3 batches (10+10+5), got " + r.batches);
assert(r.rows === 25, "every claimed row counts, INCLUDING the final partial batch, got " + r.rows);
assert(maxClaim <= 10, "no single transaction may touch more than batchSize rows, saw " + maxClaim);
assert(claims === 4, "3 filling claims + 1 empty probe that ends the loop = 4 calls, got " + claims);
log("25 rows backfilled in 3 short transactions (10 + 10 + 5), then one clean empty probe");
const r2 = await backfill(db, 10);
assert(r2.batches === 0 && r2.rows === 0, "an already-complete backfill must report zero work, got " + r2.batches + " batches / " + r2.rows + " rows");
assert(unfilled === 0, "no row may be claimed twice");
log("idempotent: the second run probed once, found nothing, and reported honestly");`,
    pass:"three short transactions, every row counted, and the second run was a no-op",
    takeaway:"A backfill is a marathon of sprints: each batch is its own short transaction, so locks release continuously and vacuum's horizon keeps moving — and the stop condition is 'the table returned zero', never 'the batch looked small'.",
    hint:"let batches = 0, rows = 0; then an infinite for (;;): n = await db.claimBatch(batchSize); if (n === 0) break; batches++; rows += n. Return { batches, rows } after the loop — the partial batch was already counted before the loop saw the 0." },

  { id:"w-prefix", title:"Leftmost-prefix matcher — write it", why:"the planner can only seek a contiguous run", lesson:10,
    spec:"Write the walk. Count leading index columns covered by equality predicates, left to right, stopping at the first gap. Then, if the NEXT index column is the range column, count it too — and stop there: a range consumes the last usable column. Return how many columns the scan can seek on.",
    pre:`// An index on (a, b, c) is sorted by a, then b within a, then c
// within b. A seek needs one contiguous run of the index, so the
// usable columns are a LEFTMOST PREFIX — and a range predicate
// consumes the last usable column: nothing after it can seek.
function usablePrefix(indexCols, eqCols, rangeCol) {
  // eqCols: Set of equality-predicate columns
  // rangeCol: the range-predicate column, or null
  // returns: count of leading index columns the scan can seek on`,
    post:`}`,
    lines:[
      "  let count = 0;",
      "  while (count < indexCols.length && eqCols.has(indexCols[count]))",
      "    count++;                       // equality keeps the run contiguous",
      "  if (count < indexCols.length && indexCols[count] === rangeCol)",
      "    count++;                       // the range spends the last column",
      "  return count;",
    ],
    distractors:[
      { code:"  let count = 0;\n  for (const col of indexCols)\n    if (eqCols.has(col) || col === rangeCol) count++;\n  return count;",
        why:"Counts every indexed column that appears in the predicate regardless of POSITION — it claims equality on {b, c} can seek an (a, b, c) index. The planner disagrees: without a, the matches are scattered through the whole index, and you ship a seq scan that pages someone at 3 a.m." },
      { code:"  if (count < indexCols.length && indexCols[count] === rangeCol) {\n    count++;\n    while (count < indexCols.length && eqCols.has(indexCols[count]))\n      count++;\n  }",
        why:"Keeps counting equality columns AFTER the range — but a range on b breaks the sort for c: inside the scanned b-range, c values are no longer contiguous, so c can only filter rows within the range, never narrow the seek. The range consumes the last usable column, full stop." },
      { code:"  if (eqCols.has(indexCols[0])) return indexCols.length;",
        why:"Equality on the FIRST column doesn't unlock the rest — eq on a alone still leaves b and c unseekable, and this reports the whole index usable. Each column is checked in order and the walk stops at the first gap; that stop is the entire rule." },
    ],
    test:`const idx = ["a", "b", "c"];
const eq = (...cols) => new Set(cols);
assert(usablePrefix(idx, eq("a", "b"), "c") === 3, "eq a,b + range c: the whole index seeks, got " + usablePrefix(idx, eq("a", "b"), "c"));
assert(usablePrefix(idx, eq("a"), "b") === 2, "eq a + range b: seek a, then the b range, got " + usablePrefix(idx, eq("a"), "b"));
assert(usablePrefix(idx, eq("b", "c"), null) === 0, "b and c without a: no leftmost column, no seek at all, got " + usablePrefix(idx, eq("b", "c"), null));
assert(usablePrefix(idx, eq(), "a") === 1, "a bare range on the first column still seeks its one run, got " + usablePrefix(idx, eq(), "a"));
assert(usablePrefix(idx, eq("a"), "c") === 1, "eq a + range c: the GAP at b stops the seek - c can only filter, got " + usablePrefix(idx, eq("a"), "c"));
assert(usablePrefix(idx, eq("a", "b", "c"), null) === 3, "equality on all three: full seek, got " + usablePrefix(idx, eq("a", "b", "c"), null));
log("phone-book order respected: prefixes seek, the range ends the run, gaps stop everything");`,
    pass:"prefixes seek, the range ends the run, gaps stop everything — planner logic reproduced",
    takeaway:"An index is a phone book: (last, first) finds every Smith, J* as one contiguous run, but knowing only the first name sends you page by page — usable columns are a leftmost prefix, and a range predicate spends the last one.",
    hint:"count = 0; while (count < indexCols.length && eqCols.has(indexCols[count])) count++. Then ONE if, not a loop: indexCols[count] === rangeCol -> count++. Return count. The while stops at the first gap; the if runs at most once because the range ends the run." },
);

})();
