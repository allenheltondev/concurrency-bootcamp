"use strict";
/* Database Internals Bootcamp — content pack: the Postgres map.
   Loaded after content.js and the lesson packs, before the engine (same
   shared-global model as a classic <script> tag). Registers:
     1. a "postgres map" sheet module — every concept in this course mapped
        to the real construct that embodies it in Postgres (and, where the
        concept lives elsewhere, the engine that owns it), each with a
        bridge line to SAY out loud in an interview or design review
     2. four flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  /* =========================================================
     1. THE POSTGRES MAP — a static "sheet" module
        concept -> real construct -> a line to SAY out loud
     ========================================================= */
  const mapHtml = `
    <p class="big">Every mechanism you drilled has a <b class="hl">name in the real system</b>. When the design question comes, answer the concept — then say the bridge line. That's the move: show you know the physics, then show you know which knob in Postgres is quietly running it.</p>

    <div class="impl">
      <div class="dlabel">the write-ahead log &rarr; pg_wal/ &middot; fsync &middot; synchronous_commit</div>
      <p>The WAL lives in <code>pg_wal/</code> as 16&nbsp;MB append-only segments; commit's only synchronous disk wait is the WAL fsync (<code>wait_event = WALSync</code>). <code>synchronous_commit</code> is the durability dial: <code>on</code> = fsync-before-ack, <code>off</code> = a bounded window of acked-but-lost commits after a crash. The bridge line: <b class="hl">"durability is one fsynced append — the data pages are rebuilt from the log, so they can be lazy."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">crash recovery &amp; checkpoints &rarr; redo replay &middot; checkpointer &middot; max_wal_size</div>
      <p>Startup after a crash replays WAL from the last checkpoint's redo pointer; transactions without a commit record are discarded. The checkpointer bounds that replay by flushing dirty pages and advancing the redo point — <code>max_wal_size</code> and <code>checkpoint_timeout</code> set the trade. The bridge line: <b class="hl">"checkpoint frequency is recovery time versus steady-state I/O — you tune replay length, not safety."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">the buffer pool &rarr; shared_buffers &middot; clock sweep &middot; pg_prewarm</div>
      <p>All page I/O flows through <code>shared_buffers</code> (~25% of RAM, because the OS page cache doubles it), evicted by clock-sweep, with big seq scans routed through a ring buffer so one report can't evict the working set. <code>pg_prewarm</code> reloads relations after a restart. The bridge line: <b class="hl">"p99 is a hit-rate chart in a latency costume — and a failover target must be warm, not just consistent."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">B-trees &rarr; the default index &middot; LSM &rarr; RocksDB / Cassandra, not Postgres</div>
      <p>Every <code>CREATE INDEX</code> is a B-tree unless you say otherwise: fanout in the hundreds, height 3&ndash;4 for billions of rows, top levels pinned in cache. Postgres has no LSM — that family (memtable &rarr; SSTable &rarr; compaction, bloom filters) lives in RocksDB, LevelDB, Cassandra, ScyllaDB. The bridge line: <b class="hl">"pick your amplification: B-tree pays on write, LSM pays on read — Postgres vacuums a heap where Cassandra compacts SSTables."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">index mechanics &rarr; leftmost prefix &middot; INCLUDE &middot; expression indexes &middot; pg_stat_user_indexes</div>
      <p>Composite order is the data structure (<code>(a,b)</code> serves <code>a</code> and <code>a,b</code> — never <code>b</code>); <code>INCLUDE</code> builds covering indexes for index-only scans (watch <code>Heap Fetches</code> — the visibility map gates it); functions on columns need expression indexes (<code>ON lower(email)</code>); <code>pg_stat_user_indexes</code> exposes the ones nobody uses. The bridge line: <b class="hl">"every index is a write tax with a read rebate — I audit that the rebate is being collected."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">the planner &rarr; EXPLAIN ANALYZE &middot; ANALYZE stats &middot; random_page_cost</div>
      <p>The planner is a cost model over statistics: histograms from <code>ANALYZE</code>, page math weighted by <code>random_page_cost</code> (4 by default, ~1.1 on SSDs). <code>EXPLAIN ANALYZE</code> shows estimates against reality — the bug is almost always a rows-estimate miss, and <code>pg_stat_statements</code> tells you which query to look at first. The bridge line: <b class="hl">"I don't ask why it ignored my index — I ask what the estimated row count was, because a 1000&times; miss upstream makes every downstream choice wrong."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">MVCC &rarr; xmin/xmax &middot; snapshots &middot; VACUUM &middot; autovacuum</div>
      <p>Row versions carry <code>xmin</code>/<code>xmax</code>; a snapshot decides visibility, so readers never block writers. Dead versions wait for VACUUM, and the cleanup horizon is pinned by the oldest live snapshot — long transactions are cluster-wide bloat and xid-wraparound pressure. The bridge line: <b class="hl">"an UPDATE is an insert plus a death sentence the old version serves only after every snapshot that could see it is gone."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">the isolation ladder &rarr; READ COMMITTED (default) &middot; REPEATABLE READ &middot; SERIALIZABLE (SSI) &middot; 40001</div>
      <p>READ COMMITTED re-snapshots per statement (lost updates permitted — discipline required); REPEATABLE READ is snapshot isolation with first-updater-wins (and, PG-specific, no phantoms); SERIALIZABLE is snapshot plus SSI dependency tracking — write skew dies, and <code>40001</code> aborts are the interface, so every serializable transaction ships inside a retry wrapper. MySQL InnoDB's REPEATABLE READ is a different animal (gap locks on locking reads). The bridge line: <b class="hl">"name the anomaly first, then buy the cheapest level that kills it — plus the retry loop that level assumes."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">locks &amp; deadlocks &rarr; SELECT FOR UPDATE &middot; SKIP LOCKED &middot; pg_locks &middot; deadlock_timeout &middot; 40P01</div>
      <p>Writers lock rows until COMMIT; <code>FOR UPDATE</code> makes read-then-decide safe; <code>FOR UPDATE SKIP LOCKED</code> is the canonical job queue. Deadlocks are detected after <code>deadlock_timeout</code> (1s) and one victim gets <code>40P01</code> — the fix is canonical lock order (<code>ORDER BY id</code>) plus retry. <code>pg_locks</code> joined to <code>pg_stat_activity</code> shows the queue. The bridge line: <b class="hl">"a deadlock is my access-order bug, and the detector's abort is the recovery, not the failure."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">optimistic concurrency &rarr; a version column + rowcount &middot; ETag/If-Match at the edge</div>
      <p>No engine feature required: <code>UPDATE &hellip; SET version = version + 1 WHERE id = $1 AND version = $2</code>, then act on the rowcount — 0 rows means you lost, re-read and retry. Same protocol as HTTP's <code>If-Match</code>. The bridge line: <b class="hl">"pessimistic waits, optimistic retries — I pick by conflict rate, and I never hold a row lock across user think-time."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">connection pooling &rarr; max_connections &middot; pgbouncer &middot; acquire-late/release-early</div>
      <p>Each connection is a backend process; throughput peaks near cores&nbsp;&times;&nbsp;2-ish active backends, so the pool's job is queueing in the app. <code>pgbouncer</code> in transaction mode multiplexes many app instances onto few backends (fine print: session state — prepared statements, <code>SET</code>, advisory locks — breaks). The bridge line: <b class="hl">"pool demand is arrival rate times held time — I shrink held time before I ever raise the pool."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">zero-downtime migrations &rarr; lock_timeout &middot; CREATE INDEX CONCURRENTLY &middot; NOT VALID / VALIDATE</div>
      <p>DDL takes ACCESS EXCLUSIVE and queues behind long transactions — set <code>lock_timeout</code> and retry so a stuck ALTER can't dam all traffic. Indexes build online with <code>CONCURRENTLY</code> (no transaction block; drop INVALID leftovers). Constraints arrive as <code>NOT VALID</code> then <code>VALIDATE</code> (online scan). The ritual: expand &rarr; dual-write &rarr; batched backfill &rarr; constrain &rarr; contract. The bridge line: <b class="hl">"old code and new code run at the same time — the schema must serve both at every instant of the rollout."</b></p>
    </div>

    <div class="impl">
      <div class="dlabel">replication &amp; read-your-writes &rarr; streaming replication &middot; pg_last_wal_replay_lsn &middot; remote_apply</div>
      <p>Replicas replay shipped WAL asynchronously by default; <code>pg_stat_replication</code> shows lag, <code>pg_last_wal_replay_lsn()</code> gives the position to compare against a session's last commit LSN for read-your-writes routing. <code>synchronous_commit = remote_apply</code> buys visibility-on-replica at per-commit latency. (Quorums and consensus belong to the distributed-systems course — this is one primary and its followers.) The bridge line: <b class="hl">"the replica isn't wrong, it's earlier — I route by comparing positions, never by sleeping."</b></p>
    </div>

    <div class="qbox" style="margin-top:18px">
      <div class="dlabel">say this out loud</div>
      <p>A database is a crash-safe data structure wrapped in a concurrency protocol. Axiom one — the disk can fail between any two writes — gives you the WAL, checkpoints, recovery, and replication. Axiom two — readers and writers overlap — gives you MVCC, the isolation ladder, locks, and their failure modes. Every incident I've described maps to one of the two, and every fix is a named construct above. The engines keep changing; <b class="hl">those two axioms don't</b>.</p>
    </div>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "pgmap",
    label: "postgres map",
    type: "sheet",
    eyebrow: "reference · design-review bridge",
    title: "The Postgres map",
    lead: "Every concept in this course, mapped to the construct that embodies it in a real database — and the one sentence that bridges your theory answer to the system the interviewer's company actually runs.",
    html: mapHtml,
  });

  /* =========================================================
     2. CARDS — four flashcards (on top of content.js's fourteen)
     ========================================================= */
  CARDS.push(
    ["A teammate proposes \"just put everything behind SERIALIZABLE, then we never think about anomalies again.\" What's the counter?",
     "Serializable isn't free correctness — it's correctness priced in aborts and tracking overhead. Every transaction now needs a retry wrapper (reads re-run, side effects deferred to commit), hot workloads pay real abort rates, and 95% of your queries never had a cross-row invariant to protect. Buy it per-flow where write skew actually lives; run READ COMMITTED plus lost-update discipline everywhere else."],
    ["Interviewer: \"Your checkout is double-selling the last unit. Walk me through the fixes and pick one.\" First three sentences?",
     "It's check-then-act: both requests read stock 1 before either write landed — the check lives outside the database's protection. Three fixes, by contention: atomic guard in the statement (UPDATE ... SET stock = stock - 1 WHERE stock > 0, check the rowcount), SELECT FOR UPDATE when conflicts are hot and waiting is fine, version-column CAS with retry when conflicts are rare. I'd ship the atomic UPDATE — it's one statement, no retries, and the rowcount is the truth."],
    ["The app is 'slow' and someone wants to add a read replica TODAY. What do you verify first?",
     "That reads are actually the bottleneck and that they tolerate staleness. If p99 is lock waits, a bad plan, or pool exhaustion, a replica changes nothing; if the hot reads are read-your-own-write flows (profile saves, carts), the replica creates the 'my data vanished' ticket unless you build LSN routing the same week. Replicas scale a specific shape of load — measure that shape first."],
    ["When would you pick an LSM-backed store over Postgres for a service?",
     "When the workload is write-dominated and append-shaped — event ingest, telemetry, time-series — where sequential flushes beat B-tree page rewrites, and reads are either rare, recent-biased, or scan-shaped. The price is the read path (SSTable stacks, compaction debt, tombstone folklore) and giving up Postgres's transactional surface. If the service needs cross-row invariants under concurrency, that's the transactions arc — and that's Postgres."],
  );

})();
