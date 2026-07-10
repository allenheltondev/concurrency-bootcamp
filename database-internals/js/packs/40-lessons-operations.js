"use strict";
/* Database Internals Bootcamp — content pack: operations.
   Appends lessons 21-25 (final indices; see the LESSON PLAN in js/content.js):
     21  connection pooling
     22  the N+1 problem
     23  reading a query plan
     24  zero-downtime migrations
     25  replication lag & read-your-writes
   Cross-links for these lessons are registered in content.js against these
   final indices, so the five pushes below must stay in exactly this order.
   Loaded after content.js, before the engine — same shared-global model as a
   classic <script> tag. */
(function () {

  LESSONS.push(
  { eb:"lesson 22 · operations", title:"Connection pooling", html:`
    <p class="big">A Postgres connection is not a socket &mdash; it's a <b class="hl">forked backend process</b> with its own memory and scheduler weight. That makes <b class="hl">max_connections a memory-and-contention cap, not a throughput dial</b>: throughput peaks at a <b class="hl">small</b> number of active connections and <b class="hl">degrades</b> past it, as the extra backends buy you context switching, lock contention, and buffer thrash instead of work.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">200 requests &middot; pool of 10 &middot; the queue lives in the app, where it's cheap</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <circle cx="24" cy="50" r="4" fill="#8b90ab"/><circle cx="38" cy="42" r="4" fill="#8b90ab"/>
        <circle cx="52" cy="52" r="4" fill="#8b90ab"/><circle cx="30" cy="66" r="4" fill="#8b90ab"/>
        <circle cx="46" cy="68" r="4" fill="#8b90ab"/><circle cx="60" cy="62" r="4" fill="#8b90ab"/>
        <circle cx="38" cy="80" r="4" fill="#8b90ab"/><circle cx="54" cy="82" r="4" fill="#8b90ab"/>
        <text x="42" y="30" fill="#e7e9f3" font-size="8" text-anchor="middle">200 requests</text>
        <rect x="130" y="52" width="84" height="46" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="172" y="70" fill="#8e86f0" font-size="8.5" text-anchor="middle">pool &middot; max 10</text>
        <text x="172" y="86" fill="#8b90ab" font-size="7.5" text-anchor="middle">190 queue here</text>
        <rect x="250" y="52" width="84" height="46" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="292" y="70" fill="#57e0b0" font-size="8.5" text-anchor="middle">postgres</text>
        <text x="292" y="86" fill="#8b90ab" font-size="7.5" text-anchor="middle">10 busy backends</text>
        <line x1="66" y1="70" x2="130" y2="72" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="214" y1="74" x2="250" y2="74" stroke="#2c3350" stroke-width="1.2"/>
        <circle r="5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.1;0.3;0.55;0.7;1" keyPoints="0;0;0.42;0.42;1;1" path="M 60 66 L 172 66 L 292 66"/>
        </circle>
        <circle r="5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="5s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.3;0.5;0.75;0.9;1" keyPoints="0;0;0.42;0.42;1;1" path="M 54 82 L 172 80 L 292 80"/>
        </circle>
        <text x="172" y="116" fill="#57e0b0" font-size="8" text-anchor="middle" opacity="0">held for the QUERY only &rarr; each conn serves ~50 req/s
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.4;0.46;1" values="0;0;1;1"/></text>
        <text x="172" y="132" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">vs 200 direct backends: RAM burned, cores context-switching, LESS throughput
          <animate attributeName="opacity" dur="5s" repeatCount="indefinite" keyTimes="0;0.62;0.68;1" values="0;0;1;1"/></text>
        <text x="172" y="16" fill="#8b90ab" font-size="7.5" text-anchor="middle">waiting in the app: a promise in a queue &middot; waiting in the db: a whole process</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">starting point</div><div class="lstep good seq" style="--i:0">pool &asymp; <b>cores &times; 2 + spindles</b> &mdash; 8 cores + SSD &rarr; ~17, not 200; then measure, don't guess</div>
        <div class="lanehead seq" style="--i:1">refine</div><div class="lstep seq" style="--i:1">pool &asymp; peak_qps &times; mean_hold_time &mdash; 500 qps &times; 20 ms held &rarr; 10 connections suffice</div>
        <div class="lanehead seq" style="--i:2">the sin</div><div class="lstep bad seq pop" style="--i:2">holding a connection across an external call &mdash; one 2 s Stripe timeout &times; pool of 10 = a starved pool and a "database outage" the database never had</div>
      </div>
      <div class="dnote seq" style="--i:3">The pool's whole job: <b style="color:var(--ordered)">many app requests share few DB connections</b> &mdash; requests queue in the app (cheap) instead of inside the database (expensive).</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Where does the sweet spot come from? A query is either using a core or waiting on the disk &mdash; so the useful concurrency inside the database is roughly <b class="hl">cores plus effective spindle depth</b>; the classic pool-sizing formula, <b class="hl">connections = cores &times; 2 + spindles</b>, is that observation with a safety factor. Everything above it is queueing &mdash; and queueing <b class="hl">inside</b> Postgres costs a process's memory, scheduler churn, and hotter lock contention, while the same wait in the app costs a promise on a list.</p>
    <p>Sizing is really about <b class="hl">hold time</b>: the pool serves peak_qps &times; mean_hold_time concurrent demand, so the highest-leverage fix is shrinking how long each request holds its connection &mdash; acquire late, release early, and never straddle an external call. When many app instances each want a pool, put <b class="hl">pgbouncer in transaction-pooling mode</b> in front: hundreds of client connections share a few dozen server ones, assigned per-transaction. The fine print is real, though &mdash; transaction pooling <b class="hl">breaks session state</b>: session-level prepared statements, advisory locks, and SET linger on whichever server connection you happened to borrow.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; hold time is the metric &mdash; the pool just multiplies it</div>
      <pre class="code">const pool = new Pool({ max: 10, connectionTimeoutMillis: 2000 });

async function checkout(req) {
  const charge = await stripe.charge(req);    <span class="cm">// external call FIRST —</span>
                                              <span class="cm">// no connection held yet</span>
  <span class="ok">const c = await pool.connect();             </span><span class="cm">// hold-time starts</span>
  try {
    return await c.query(
      "INSERT INTO orders (user_id, charge_id) VALUES ($1, $2)",
      [req.userId, charge.id]);
  } finally { c.release(); }                  <span class="cm">// hold-time ends: ~5 ms, not 2 s</span>
}
<span class="cm">// sizing: cores * 2 + spindles to start; refine with qps * hold_time</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "increase max_connections" is the most common wrong fix in Postgres operations &mdash; it converts a queue you could see in app metrics into invisible thrash inside the database and makes p99 worse. The senior diagnosis reads pool wait time and connection hold time side by side: if holds are long, fix the code holding them; only if holds are short and waits are long does the pool actually need to grow.</p>` },

  { eb:"lesson 23 · operations", title:"The N+1 problem", html:`
    <p class="big">One query fetches 50 orders; then a loop fires <b class="hl">one query per order</b> for its items. That's <b class="hl">1 + N round trips</b>, and each pays the network plus parse/plan overhead &mdash; <b class="hl">50 &times; 2 ms RTT = 100 ms of pure latency</b> before the database does any real work. The database is fine. The wire is a stampede.</p>
    <div class="diagram anim" style="--step:.55s">
      <div class="dlabel">the waterfall &middot; 1 + 50 round trips vs 2</div>
      <div class="dcols">
        <div class="dcol">
          <div class="dlabel">lazy &middot; 51 queries</div>
          <div class="lstep seq" style="--i:0">SELECT &hellip; FROM orders &rarr; 50 rows &middot; 2 ms</div>
          <div class="lstep bad seq" style="--i:1">items WHERE order_id = 1 &middot; 2 ms</div>
          <div class="lstep bad seq" style="--i:2">items WHERE order_id = 2 &middot; 2 ms</div>
          <div class="lstep bad seq" style="--i:3">items WHERE order_id = 3 &middot; 2 ms</div>
          <div class="lstep bad seq" style="--i:4">&hellip; &times; 50, one at a time &rarr; <b>~102 ms</b></div>
        </div>
        <div class="dcol">
          <div class="dlabel">batched &middot; 2 queries</div>
          <div class="lstep seq" style="--i:5">SELECT &hellip; FROM orders &rarr; 50 rows &middot; 2 ms</div>
          <div class="lstep good seq pop" style="--i:6">items WHERE order_id = ANY($1) &rarr; all 200 rows &middot; 3 ms</div>
          <div class="lstep good seq" style="--i:7">group by order_id in the app &rarr; <b>~5 ms total</b></div>
        </div>
      </div>
      <div class="dnote seq" style="--i:8">Same rows, same indexes, <b style="color:var(--ordered)">20&times; faster</b> &mdash; the only thing removed was round trips. Latency you can't see in EXPLAIN, because no single query is slow.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>N+1 hides because <b class="hl">the code reads clean</b>: an ORM lazy relation makes <b class="hl">order.items</b> look like a property access while it quietly runs a query per touch. And under load the damage doubles &mdash; each of those N queries checks a connection out of lesson 22's pool, so one page render consumes <b class="hl">N connections-worth of hold time</b> and the pool starves for everyone else. A single endpoint with a lazy loop can take down a service whose database is 95% idle.</p>
    <p>The fixes, in order of reach: a <b class="hl">JOIN</b> when the shapes align (one query, some row duplication); the <b class="hl">batch</b> &mdash; <b class="hl">WHERE parent_id = ANY($1)</b> with the 50 ids, grouped in the app (two queries, no duplication &mdash; the workhorse); <b class="hl">JSON aggregation</b> (json_agg the children per parent, one query, shaped rows); and <b class="hl">dataloader-style batching</b> per request, which makes the batch automatic when you can't restructure the callers. Detection beats vigilance: in <b class="hl">pg_stat_statements</b>, an N+1 shows up as one statement shape whose <b class="hl">calls</b> count &asymp; the parent query's <b class="hl">rows</b> &mdash; a machine-checkable signature.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the loop, the batch, and the telltale in pg_stat_statements</div>
      <pre class="code"><span class="cm">-- the stampede (what the ORM's lazy relation actually runs):</span>
SELECT * FROM order_items WHERE order_id = $1;   <span class="cm">-- calls: 8,400,000</span>
<span class="cm">-- pg_stat_statements: calls ≈ rows of the parent query — the signature</span>

<span class="cm">-- the batch: two round trips, total, regardless of N</span>
SELECT * FROM orders WHERE customer_id = $1;
<span class="ok">SELECT * FROM order_items WHERE order_id = ANY($1);</span>
<span class="cm">-- then in the app: const byOrder = groupBy(items, "order_id")</span>

<span class="cm">-- or one query, shaped: JSON aggregation</span>
SELECT o.id, json_agg(i.*) AS items
  FROM orders o JOIN order_items i ON i.order_id = o.id
 WHERE o.customer_id = $1 GROUP BY o.id;</pre>
    </div>
    <p><b class="hl">Why it matters:</b> N+1 is the most common database performance bug in application code, and it's invisible to every per-query tool &mdash; EXPLAIN says each query is perfect, the slow-query log is empty, and the page takes 800 ms. The habit that catches it: for any endpoint, ask "how many queries does this run, <b class="hl">as a function of the data</b>?" Any answer containing N is the bug.</p>` },

  { eb:"lesson 24 · operations", title:"Reading a query plan", html:`
    <p class="big"><b class="hl">EXPLAIN</b> shows the planner's estimates; <b class="hl">EXPLAIN ANALYZE</b> runs the query and prints what actually happened next to them. Reading a plan is one skill: scan <b class="hl">inner-to-outer</b>, find where <b class="hl">actual time &times; loops</b> concentrates, and hunt <b class="hl">the lie</b> &mdash; the node where estimated rows and actual rows part company.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">the node bestiary &middot; none of these is a slur &mdash; each wins somewhere</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">seq scan</div><div class="lstep seq" style="--i:0">read every page, sequentially &middot; WINS for large fractions of the table (lesson 13's math) &mdash; not automatically a problem</div>
        <div class="lanehead seq" style="--i:1">index scan</div><div class="lstep good seq" style="--i:1">B-tree seek + heap fetch per row &middot; wins for selective predicates &middot; loses hard if rows are many</div>
        <div class="lanehead seq" style="--i:2">bitmap scan</div><div class="lstep seq" style="--i:2">the middle: index collects matching pages into a bitmap, heap read in page order &mdash; many rows without random-I/O chaos</div>
        <div class="lanehead seq" style="--i:3">nested loop</div><div class="lstep wait seq" style="--i:3">for each outer row, probe the inner side &middot; great when outer is small and inner probe is an index &middot; catastrophic when "1 outer row" is really 100k</div>
        <div class="lanehead seq" style="--i:4">hash join</div><div class="lstep seq" style="--i:4">build a hash table from one side, probe with the other &middot; right for big unsorted sets</div>
        <div class="lanehead seq" style="--i:5">the lie</div><div class="lstep bad seq pop" style="--i:5"><b>rows=1 estimated, rows=180000 actual</b> &mdash; every choice downstream of a 1000&times; miss was made for a different query</div>
      </div>
      <div class="dnote seq" style="--i:6">The plan is a bet placed on statistics. When the plan is bad, <b style="color:var(--race)">the estimate is usually the crime</b> &mdash; stale stats after a bulk load (run ANALYZE), correlated columns, or a non-sargable predicate upstream &mdash; and the join choice is just the getaway car.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Read the reference plan below the way you'd read a profiler. Inner-to-outer: the users index scan was estimated at <b class="hl">rows=1</b> and produced <b class="hl">rows=4500</b> &mdash; there's the lie. Because the planner believed "1", it chose a nested loop; now the inner events probe runs <b class="hl">loops=4500</b> times, and its innocent-looking 0.874 ms is really 0.874 &times; 4500 &asymp; <b class="hl">3.9 seconds</b>. That's the other reading rule: <b class="hl">loops= multiplies everything on the line</b> &mdash; per-loop numbers look tiny while their product is the whole runtime.</p>
    <p>Given a 1000&times; miss, the fix list is short and ordered: <b class="hl">ANALYZE</b> the table (bulk loads outrun autovacuum's stats), raise the column's statistics target if the distribution is skewed, check for correlated predicates the planner multiplies independently (extended statistics fix this), and look upstream for lesson 14's non-sargable predicates that force the planner to guess. Only after the estimates are honest is it fair to judge the index &mdash; or add one.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; EXPLAIN ANALYZE &mdash; est vs actual, and loops doing the multiplying</div>
      <pre class="code">EXPLAIN ANALYZE SELECT ... FROM users u JOIN events e ON e.user_id = u.id
                WHERE u.org_id = 4881;
Nested Loop  (cost=0.86..152.43 <span class="kw">rows=1</span>)
             (actual time=0.041..4212.377 <span class="kw">rows=180000</span> loops=1)
  -&gt; Index Scan using users_org_idx on users u
       (cost=0.43..8.45 <span class="ok">rows=1</span>)
       (actual time=0.020..91.312 <span class="ok">rows=4500</span> loops=1)   <span class="cm">-- the lie: 4500x</span>
  -&gt; Index Scan using events_user_idx on events e
       (cost=0.43..143.97 rows=1)
       (actual time=0.011..0.874 rows=40 <span class="kw">loops=4500</span>)   <span class="cm">-- x4500 = ~3.9 s</span>
Planning Time: 0.412 ms
Execution Time: 4288.106 ms
<span class="cm">-- fix the ESTIMATE first: ANALYZE users; then re-plan —</span>
<span class="cm">-- with rows=4500 known, the planner picks a hash join on its own</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> EXPLAIN ANALYZE is the single highest-leverage diagnostic in the Postgres toolbox, and most engineers only skim it for the words "Seq Scan." The three-move reading &mdash; inner-to-outer, follow actual&times;loops, find the est-vs-actual lie &mdash; turns "the query is slow" from a guessing game into a five-minute diagnosis, and it's a reliably strong interview answer because it shows you debug the planner's <b class="hl">inputs</b>, not just its output.</p>` },

  { eb:"lesson 25 · operations", title:"Zero-downtime migrations", html:`
    <p class="big">DDL takes locks &mdash; most ALTER TABLE forms want <b class="hl">ACCESS EXCLUSIVE</b>, which conflicts with everything, even SELECTs. The killer isn't the ALTER's own speed: a fast ALTER <b class="hl">queued behind one long-running query</b> makes every later query queue behind the ALTER. One report + one migration = a full outage. Rule zero: <b class="hl">always SET lock_timeout</b>, fail fast, retry.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">expand&ndash;contract &middot; six steps &middot; the app never notices</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1 expand</div><div class="lstep good seq" style="--i:0">ADD COLUMN, nullable &mdash; metadata-only, instant &middot; old code ignores it</div>
        <div class="lanehead seq" style="--i:1">2 deploy</div><div class="lstep seq" style="--i:1">ship code that WRITES both old + new (reads still old) &mdash; every new row is already correct</div>
        <div class="lanehead seq" style="--i:2">3 backfill</div><div class="lstep seq" style="--i:2">UPDATE old rows in bounded batches &mdash; small txs; one giant UPDATE holds locks + a snapshot for hours and spikes WAL/replication (lesson 26)</div>
        <div class="lanehead seq" style="--i:3">4 constrain</div><div class="lstep seq" style="--i:3">CHECK &hellip; NOT VALID (instant) &rarr; VALIDATE CONSTRAINT (full scan, but SHARE UPDATE EXCLUSIVE &mdash; online)</div>
        <div class="lanehead seq" style="--i:4">5 switch</div><div class="lstep seq" style="--i:4">deploy code that READS the new column &middot; old column now write-only</div>
        <div class="lanehead seq" style="--i:5">6 contract</div><div class="lstep good seq" style="--i:5">drop the old column &mdash; one deploy LATER, once nothing can still read it</div>
        <div class="lanehead seq" style="--i:6">4 before 3?</div><div class="lstep bad seq pop" style="--i:6">constrain before backfilling and VALIDATE fails on every old NULL &mdash; or a plain SET NOT NULL scans, finds NULLs, and aborts <b>while holding ACCESS EXCLUSIVE</b></div>
      </div>
      <div class="dnote seq" style="--i:7">Every step is <b style="color:var(--ordered)">individually reversible</b> and each deploy runs against BOTH schema shapes. That's the whole trick: never a moment where code and schema must change together.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Know your instant-vs-rewrite table, with version honesty. <b class="hl">ADD COLUMN</b> nullable, no default: metadata-only, always instant. With a <b class="hl">constant DEFAULT: instant on PG 11+</b> (the default is stored once and synthesized on read); <b class="hl">pre-11 it rewrote the entire table</b> under ACCESS EXCLUSIVE &mdash; check your version before trusting a blog post. A <b class="hl">volatile default</b> (now(), gen_random_uuid()) or a column <b class="hl">type change</b> still rewrites today &mdash; don't. <b class="hl">NOT NULL</b> on an existing column normally full-scans; on <b class="hl">PG 12+</b> it's instant if an equivalent <b class="hl">CHECK &hellip; NOT VALID &rarr; VALIDATE</b> constraint already proves it &mdash; that's why step 4 is shaped the way it is.</p>
    <p>Indexes get their own verb: <b class="hl">CREATE INDEX CONCURRENTLY</b>. It builds without blocking writes, at three costs &mdash; slower build, <b class="hl">it cannot run inside a transaction</b> (your migration tool's auto-BEGIN will reject it), and on failure it leaves an <b class="hl">INVALID</b> index behind that still taxes every write: drop it and retry, it will not fix itself.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the whole ritual as SQL &mdash; each statement online</div>
      <pre class="code"><span class="ok">SET lock_timeout = '2s';</span>                      <span class="cm">-- rule zero: never queue forever</span>
ALTER TABLE orders ADD COLUMN region text;    <span class="cm">-- 1 expand: metadata-only</span>
<span class="cm">-- (constant DEFAULT would also be instant on PG 11+; pre-11: rewrite)</span>

<span class="cm">-- 3 backfill, bounded batches, separate transactions:</span>
UPDATE orders SET region = 'us-east'
 WHERE region IS NULL AND id BETWEEN $1 AND $2;  <span class="cm">-- loop, ~10k rows/batch</span>

<span class="cm">-- 4 constrain without a long lock (PG 12+ path to NOT NULL):</span>
ALTER TABLE orders ADD CONSTRAINT region_nn
  CHECK (region IS NOT NULL) <span class="ok">NOT VALID</span>;       <span class="cm">-- instant, checks new writes</span>
ALTER TABLE orders <span class="ok">VALIDATE CONSTRAINT</span> region_nn; <span class="cm">-- scan, but online</span>
ALTER TABLE orders ALTER COLUMN region SET NOT NULL; <span class="cm">-- sees the CHECK: instant</span>

CREATE INDEX <span class="ok">CONCURRENTLY</span> orders_region_idx ON orders (region);
<span class="cm">-- no transaction allowed; failure leaves it INVALID -> drop, retry</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> schema changes are where application engineers most often take production down with one line &mdash; not because the change was wrong, but because of the lock it queued behind. lock_timeout, the instant-vs-rewrite table, CONCURRENTLY's caveats, and the six-step ritual convert "migration night" into boring, reversible deploys &mdash; and "how do you add a NOT NULL column to a 2-billion-row table?" is a standing senior interview question with exactly this answer.</p>` },

  { eb:"lesson 26 · operations", title:"Replication lag & read-your-writes", html:`
    <p class="big">Streaming replication is lesson 05's WAL, shipped over the network: replicas <b class="hl">replay the primary's log</b>. By default it's <b class="hl">asynchronous</b> &mdash; COMMIT returns after the <b class="hl">primary's</b> fsync, and replicas apply the records later. "Later" is milliseconds on a good day, and <b class="hl">seconds or more</b> under write bursts, vacuum storms, or a long replica query stalling replay. Every read a replica serves is a read of the recent past.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">the race &middot; the user's GET vs their own WAL record</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="12" y="52" width="90" height="46" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="57" y="71" fill="#8e86f0" font-size="8.5" text-anchor="middle">primary</text>
        <text x="57" y="86" fill="#8b90ab" font-size="7.5" text-anchor="middle">commit acked &#10003;</text>
        <rect x="238" y="52" width="90" height="46" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="283" y="71" fill="#57e0b0" font-size="8.5" text-anchor="middle">replica</text>
        <text x="283" y="86" fill="#8b90ab" font-size="7.5" text-anchor="middle">replaying&hellip;</text>
        <line x1="102" y1="75" x2="238" y2="75" stroke="#2c3350" stroke-width="1.2"/>
        <text x="170" y="68" fill="#8b90ab" font-size="7" text-anchor="middle">wal stream &middot; async</text>
        <rect width="14" height="10" rx="2" fill="#57e0b0">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.08;0.55;1" keyPoints="0;0;1;1" path="M 95 70 L 231 70"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.06;0.08;0.55;0.6;1" values="0;0;1;1;0;0"/>
        </rect>
        <text x="20" y="16" fill="#e7e9f3" font-size="8">POST /comment &rarr; primary &middot; commit &middot; redirect</text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.14;0.3;0.62;0.74;1" keyPoints="0;0;1;1;1;1" path="M 170 14 L 283 46"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.12;0.14;0.34;0.38;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="150" y="116" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">GET arrives BEFORE the record &rarr; "my comment vanished"
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.32;0.36;0.56;0.6;1" values="0;0;1;1;0;0"/></text>
        <text x="170" y="116" fill="#8b90ab" font-size="8" text-anchor="middle" opacity="0">record replayed &middot; replay_lsn caught up
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.64;1" values="0;0;1;1"/></text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5" opacity="0">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.68;0.8;1" keyPoints="0;0;1;1" path="M 170 14 L 283 46"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.66;0.68;0.88;0.92;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="170" y="134" fill="#57e0b0" font-size="8" text-anchor="middle" opacity="0">refresh &rarr; comment visible &#10003; &mdash; it "reappeared" &middot; support ticket filed anyway
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.84;0.88;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">the bug</div><div class="lstep bad seq pop" style="--i:0">POST writes to the primary &rarr; redirect &rarr; GET reads a replica &rarr; the user's OWN write is missing</div>
        <div class="lanehead seq" style="--i:1">the tell</div><div class="lstep seq" style="--i:1">it always "fixes itself on refresh" &mdash; the signature that separates lag from data loss</div>
      </div>
      <div class="dnote seq" style="--i:2">Scope note: this is <b style="color:var(--ordered)">one primary + async replicas</b> &mdash; single-node-plus-copies. Quorums and consensus live in the distributed-systems course; don't import their machinery for this bug.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The property you're missing is <b class="hl">read-your-writes</b>, and the fixes rank by cost. Cheapest: <b class="hl">routing</b> &mdash; pin a session to the primary for N seconds after it writes (a cookie timestamp is enough). Sharper: remember the commit's <b class="hl">LSN</b> and serve the session from any replica whose <b class="hl">pg_last_wal_replay_lsn() &ge; that LSN</b> &mdash; correctness from the actual replication position, not a guessed timeout. Heavier: <b class="hl">synchronous_commit = remote_apply</b> for the few flows that truly need it &mdash; commit doesn't return until replicas have <b class="hl">applied</b> the record, which buys read-your-writes everywhere at the price of added latency on <b class="hl">every commit</b> in that scope. Or cheapest of all: design the read to tolerate staleness, because most can.</p>
    <p>One sibling guarantee is nearly free: <b class="hl">monotonic reads</b>. A user load-balanced across replicas with different lag can watch time run <b class="hl">backwards</b> &mdash; comment there, refresh, gone, refresh, back. Pinning each session to <b class="hl">one</b> replica doesn't eliminate staleness, but it makes time move in one direction, which kills the creepiest tickets.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; LSN-gated reads &mdash; read-your-writes from the real replay position</div>
      <pre class="code"><span class="cm">-- on the primary, in the write path, right after COMMIT:</span>
SELECT pg_current_wal_lsn();          <span class="cm">-- '0/5F0A3C8' — stash in the session</span>

<span class="cm">-- on a candidate replica, before serving that session's read:</span>
<span class="ok">SELECT pg_last_wal_replay_lsn() &gt;= '0/5F0A3C8' AS caught_up;</span>
<span class="cm">-- true  -> serve the read here</span>
<span class="cm">-- false -> try another replica, or fall through to the primary</span>

<span class="cm">-- the heavyweight alternative, per-transaction, for critical flows:</span>
SET synchronous_commit = remote_apply; <span class="cm">-- commit waits for replica APPLY</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "my comment vanished" is the canonical replica-lag ticket, and teams burn weeks chasing it as a data-loss bug because it never reproduces &mdash; by the time anyone looks, replay has caught up. Knowing the shape &mdash; write primary, read replica, fixes-on-refresh &mdash; plus the ranked fixes turns it into an afternoon's routing change. It's also the gateway idea to distributed systems: the moment you added one replica, "what does a read mean?" stopped having a single answer.</p>` },
  );

})();
