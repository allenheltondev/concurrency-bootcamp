"use strict";
/* Database Internals Bootcamp — content pack: indexing.
   Appends lessons 9-13 (final indices; see the LESSON PLAN in js/content.js):
     9   what an index buys — and costs
     10  composite indexes & the leftmost prefix
     11  covering indexes & index-only scans
     12  selectivity & the planner
     13  predicates that can't use the index (sargability)
   Cross-links for these lessons are registered in content.js against these
   final indices, so the five pushes below must stay in exactly this order.
   Loaded after content.js, before the engine — same shared-global model as a
   classic <script> tag. */
(function () {

  LESSONS.push(
  { eb:"lesson 10 · indexing", title:"What an index buys — and costs", html:`
    <p class="big">An index is a <b class="hl">second, smaller B-tree</b>, sorted on your column, whose leaves hold <b class="hl">(key &rarr; TID)</b> &mdash; a pointer into the heap. A predicate on that column stops being "scan 5M rows" and becomes an <b class="hl">O(log n) descent plus a heap fetch per match</b>. That's the buy. The cost: the table no longer has one write path &mdash; it has <b class="hl">one per tree</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one INSERT &middot; five trees &middot; the write tax is per-index</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="8" y="56" width="88" height="40" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="52" y="73" fill="#4eaeff" font-size="8.5" text-anchor="middle">INSERT</text>
        <text x="52" y="86" fill="#8ca6b8" font-size="7.5" text-anchor="middle">1 logical row</text>
        <rect x="210" y="6" width="122" height="22" rx="6" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="271" y="20" fill="#34d3bf" font-size="7.5" text-anchor="middle">heap page &middot; the row</text>
        <rect x="210" y="34" width="122" height="22" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/>
        <text x="271" y="48" fill="#e2ecf3" font-size="7.5" text-anchor="middle">pkey (id)</text>
        <rect x="210" y="62" width="122" height="22" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/>
        <text x="271" y="76" fill="#e2ecf3" font-size="7.5" text-anchor="middle">idx (customer_id)</text>
        <rect x="210" y="90" width="122" height="22" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/>
        <text x="271" y="104" fill="#e2ecf3" font-size="7.5" text-anchor="middle">idx (status, created_at)</text>
        <rect x="210" y="118" width="122" height="22" rx="6" fill="#071726" stroke="#fb923c" stroke-width="1.2" stroke-dasharray="4 4"/>
        <text x="271" y="132" fill="#fb923c" font-size="7.5" text-anchor="middle">idx (email) &middot; idx_scan: 0</text>
        <circle r="5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.06;0.18;1" keyPoints="0;0;1;1" path="M 98 76 L 204 17"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.06;0.08;0.18;0.21;1" values="0;0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.18;0.3;1" keyPoints="0;0;1;1" path="M 98 76 L 204 45"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.18;0.2;0.3;0.33;1" values="0;0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.3;0.42;1" keyPoints="0;0;1;1" path="M 98 76 L 204 73"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.3;0.32;0.42;0.45;1" values="0;0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.42;0.54;1" keyPoints="0;0;1;1" path="M 98 76 L 204 101"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.42;0.44;0.54;0.57;1" values="0;0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.54;0.66;1" keyPoints="0;0;1;1" path="M 98 76 L 204 129"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.54;0.56;0.66;0.69;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="8" y="116" fill="#fb923c" font-size="8" opacity="0">1 row in &rarr; 5 page writes,
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;1" values="0;0;1;1"/></text>
        <text x="8" y="128" fill="#fb923c" font-size="8" opacity="0">5 WAL records, 5 splits possible
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.74;0.78;1" values="0;0;1;1"/></text>
        <text x="8" y="142" fill="#34d3bf" font-size="8" opacity="0">the unread one is pure tax &mdash; drop it
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.8;0.84;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">INSERT</div><div class="lstep bad seq" style="--i:0">a new entry descends <b>every</b> index &mdash; heap + 4 indexes = 5 page writes + 5 WAL records, each with a split lurking</div>
        <div class="lanehead seq" style="--i:1">DELETE</div><div class="lstep seq" style="--i:1">marks the heap version dead &middot; every index keeps its entry until VACUUM comes to collect &mdash; index count multiplies vacuum work too</div>
        <div class="lanehead seq" style="--i:2">UPDATE</div><div class="lstep bad seq" style="--i:2">Postgres never edits a row &mdash; it writes a whole NEW row version, so every index needs a new entry pointing at it&hellip;</div>
        <div class="lanehead seq" style="--i:3">HOT</div><div class="lstep good seq pop" style="--i:3">&hellip;UNLESS the new version fits on the <b>same heap page</b> AND <b>no indexed column changed</b> &mdash; a heap-only tuple; every index left untouched</div>
      </div>
      <div class="dnote seq" style="--i:4">The question is never "would this index help some query" &mdash; it's <b style="color:var(--race)">"is that read worth taxing every write, forever."</b> Both conditions of HOT are load-bearing: index a column and you don't just slow its own maintenance, you disqualify HOT for every update that touches it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Follow one UPDATE through the machinery. <b class="hl">UPDATE orders SET total = 99 WHERE id = 7</b>: MVCC writes a new version of the whole row. If that version lands on the same 8 KB page as the old one and <b class="hl">total</b> isn't indexed, the update is <b class="hl">HOT</b> &mdash; the old version chains to the new inside the page and no index hears about it. Now index <b class="hl">total</b>: the same statement must insert into every index on the table (their entries must point at the new version), write amplification jumps, and vacuum inherits the cleanup. Adding an index changes the cost of updates that never mention it.</p>
    <p>And the tax compounds quietly: more indexes mean bigger on-disk footprint and <b class="hl">more trees competing for the buffer pool</b> (lesson 09) &mdash; every index you add makes some other page colder. An index nobody reads is pure tax; Postgres keeps the receipts in <b class="hl">pg_stat_user_indexes</b>, where <b class="hl">idx_scan = 0</b> since the last stats reset names the freeloaders.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; audit the tax &mdash; find indexes that cost writes and buy nothing</div>
      <pre class="code"><span class="cm">-- every row written pays (1 + live indexes); reads repay some of them</span>
SELECT indexrelname,
       idx_scan,                              <span class="cm">-- reads served since stats reset</span>
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname = 'orders'
ORDER BY idx_scan;

<span class="ok">-- idx_scan = 0 over a representative window: drop it.</span>
<span class="cm">-- it slows every INSERT/UPDATE, bloats vacuum, and evicts warmer pages</span>
<span class="cm">-- (check it isn't a unique/constraint index before you do)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "just add an index" is the most casually issued invoice in software. On a hot write path, four secondary indexes can mean 5&times; the page writes and the difference between HOT updates and full index maintenance &mdash; the ingest slowdown shows up in a table nobody remembers indexing. Audit with pg_stat_user_indexes the way you audit dependencies: everything you keep, you pay for.</p>` },

  { eb:"lesson 11 · indexing", title:"Composite indexes & the leftmost prefix", html:`
    <p class="big">An index on <b class="hl">(a, b, c)</b> is one tree sorted by <b class="hl">a, then b within a, then c within b</b> &mdash; a phone book: last name, then first. That single fact decides every query it can and cannot serve. Ask for a last name and you <b class="hl">seek to a contiguous run</b>; ask for everyone named "Anna" regardless of surname and the sort order is <b class="hl">useless</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">index on (a, b) &middot; a=2 slices a run &middot; b=4 is scattered everywhere</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="118" y="8" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="19" fill="#8ca6b8" font-size="7.5" text-anchor="middle">a=1 b=4</text>
        <rect x="118" y="25" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="36" fill="#8ca6b8" font-size="7.5" text-anchor="middle">a=1 b=7</text>
        <rect x="118" y="42" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="53" fill="#e2ecf3" font-size="7.5" text-anchor="middle">a=2 b=1</text>
        <rect x="118" y="59" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="70" fill="#e2ecf3" font-size="7.5" text-anchor="middle">a=2 b=4</text>
        <rect x="118" y="76" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="87" fill="#e2ecf3" font-size="7.5" text-anchor="middle">a=2 b=9</text>
        <rect x="118" y="93" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="104" fill="#8ca6b8" font-size="7.5" text-anchor="middle">a=3 b=3</text>
        <rect x="118" y="110" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="121" fill="#8ca6b8" font-size="7.5" text-anchor="middle">a=3 b=8</text>
        <rect x="118" y="127" width="104" height="15" rx="3" fill="#071726" stroke="#244155" stroke-width="1"/>
        <text x="170" y="138" fill="#8ca6b8" font-size="7.5" text-anchor="middle">a=4 b=4</text>
        <rect x="118" y="42" width="104" height="49" rx="4" fill="#34d3bf" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.16;0.2;1" values="0;0;0.16;0.16"/></rect>
        <text x="8" y="18" fill="#34d3bf" font-size="8">WHERE a=2</text>
        <circle r="5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.05;0.16;0.2;0.32;1" keyPoints="0;0;0.71;0.71;1;1" path="M 34 26 L 112 49 L 112 84"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.05;0.07;0.32;0.36;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="8" y="52" fill="#34d3bf" font-size="7.5" opacity="0">1 seek &rarr;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.34;0.38;1" values="0;0;1;1"/></text>
        <text x="8" y="63" fill="#34d3bf" font-size="7.5" opacity="0">contiguous run,
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.34;0.38;1" values="0;0;1;1"/></text>
        <text x="8" y="74" fill="#8ca6b8" font-size="7.5" opacity="0">stop at a=3
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.38;0.42;1" values="0;0;1;1"/></text>
        <text x="234" y="18" fill="#fb923c" font-size="8">WHERE b=4</text>
        <circle r="5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.5;0.86;1" keyPoints="0;0;1;1" path="M 228 14 L 228 133"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.52;0.86;0.9;1" values="0;0;1;1;0;0"/>
        </circle>
        <rect x="118" y="8" width="104" height="15" rx="3" fill="#fb923c" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.53;1" values="0;0;0.22;0.22"/></rect>
        <rect x="118" y="59" width="104" height="15" rx="3" fill="#fb923c" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.65;0.68;1" values="0;0;0.22;0.22"/></rect>
        <rect x="118" y="127" width="104" height="15" rx="3" fill="#fb923c" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.83;0.86;1" values="0;0;0.22;0.22"/></rect>
        <text x="234" y="52" fill="#fb923c" font-size="7.5" opacity="0">no leftmost a:
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.88;0.91;1" values="0;0;1;1"/></text>
        <text x="234" y="63" fill="#fb923c" font-size="7.5" opacity="0">nothing to seek,
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.88;0.91;1" values="0;0;1;1"/></text>
        <text x="234" y="74" fill="#8ca6b8" font-size="7.5" opacity="0">check all 8
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.91;0.94;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">seekable</div><div class="lstep good seq" style="--i:0">a &middot; a+b &middot; a+b+c &middot; equality on a + range on b &mdash; any <b>leftmost prefix</b>, equality until the first range</div>
        <div class="lanehead seq" style="--i:1">range stops it</div><div class="lstep wait seq" style="--i:1">a=2 AND b&gt;5 AND c=9: the seek uses a and b, but inside a b-range the c values are unsorted &mdash; c can only <b>filter</b> entries, not narrow the seek</div>
        <div class="lanehead seq" style="--i:2">not seekable</div><div class="lstep bad seq" style="--i:2">b alone &middot; c alone &middot; b+c &mdash; no leftmost column, no start position; the planner may still walk the whole index and filter, but that's a <b>scan</b> wearing an index's name</div>
        <div class="lanehead seq" style="--i:3">order rule</div><div class="lstep seq" style="--i:3">equality columns first, then the ONE range/sort column &mdash; everything after a range rides along as filter-only</div>
      </div>
      <div class="dnote seq" style="--i:4">Corollary you can bill for: <b style="color:var(--ordered)">(a, b) already serves every a-alone query</b> &mdash; a=2 is a contiguous run in it. A separate index on (a) next to (a, b) is a duplicate: pure write tax, zero new reads.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The distinction to internalize is <b class="hl">seek versus filter</b>, and EXPLAIN spells it out: predicates in <b class="hl">Index Cond</b> positioned the descent and bounded the run; predicates in <b class="hl">Filter</b> were checked row by row against everything the run produced. A query can "use the index" and still read a hundred times more entries than it returns &mdash; the leftmost prefix decides which side of that line each column lands on.</p>
    <p>Design from the phone book. Multi-tenant orders queried by <b class="hl">tenant_id = ? AND created_at &ge; ? AND status = ?</b>: put the equality column first, the range second &mdash; (tenant_id, created_at). Put status before created_at and the range on created_at degrades to a filter; put created_at first and every tenant's rows interleave with every other's. Same three columns, order decides whether the query reads 40 entries or 400,000.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; Index Cond is the seek, Filter is the apology</div>
      <pre class="code">CREATE INDEX orders_tenant_time ON orders (tenant_id, created_at);

EXPLAIN SELECT * FROM orders
WHERE tenant_id = 42 AND created_at &gt;= now() - interval '7 days'
  AND status = 'paid';
<span class="ok">Index Scan using orders_tenant_time on orders</span>
  Index Cond: ((tenant_id = 42) AND (created_at &gt;= ...))  <span class="cm">-- the seek</span>
  Filter: (status = 'paid')  <span class="cm">-- checked per row AFTER the range ate sortedness</span>

EXPLAIN SELECT * FROM orders WHERE status = 'paid';
<span class="cm">Seq Scan on orders          -- no leftmost column: the index can't even start</span>
  Filter: (status = 'paid')</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the leftmost prefix is the single highest-yield fact in practical indexing &mdash; it explains why the index you added last sprint "isn't being used," why (user_id, created_at) serves the profile page but (created_at, user_id) doesn't, and why the fix is usually reordering columns, not adding a tree. Say "equality first, then the range; after the range it's filter-only" and you've answered most composite-index interview questions before they finish asking.</p>` },

  { eb:"lesson 12 · indexing", title:"Covering indexes & index-only scans", html:`
    <p class="big">Every index scan so far ends with a hop: the leaf gives you a TID, and the row lives in the heap &mdash; <b class="hl">one heap page fetch per match</b>. But if every column the query needs already lives in the index, the hop <b class="hl">disappears</b>: an <b class="hl">index-only scan</b> answers from the leaves and never touches the table.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">query wants (customer_id, status) &middot; same predicate, two indexes</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">idx (customer_id)</div>
          <div class="lstep good">descend &rarr; 13 matching leaf entries</div>
          <div class="lstep bad">status isn't in the leaf &rarr; follow the TID to the heap &mdash; per row</div>
          <div class="lstep bad">13 rows &rarr; up to 13 random heap pages</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">idx (customer_id) INCLUDE (status)</div>
          <div class="lstep good">descend &rarr; same 13 entries</div>
          <div class="lstep good">status rides in the leaf as payload &mdash; not part of the key, just carried</div>
          <div class="lstep good">visibility map says all-visible &rarr; 0 heap fetches</div>
        </div>
      </div>
      <div class="qbox macro seq" style="--i:2">
        <div class="dlabel">the Postgres asterisk &middot; the index doesn't know who can see what</div>
        <p style="margin:4px 0 0">Index entries carry <b class="hl">no visibility info</b> &mdash; xmin/xmax live in the heap. An index-only scan must consult the <b class="hl">visibility map</b>: pages marked all-visible can be answered from the leaf; any page NOT marked forces a heap fetch anyway. EXPLAIN ANALYZE prints the bill as <b class="hl">"Heap Fetches: N"</b> &mdash; high after heavy churn, shrinking as vacuum re-marks pages. An index-only scan on a hot table can silently degrade into an ordinary index scan until vacuum catches up.</p>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:3">INCLUDE</div><div class="lstep good seq" style="--i:3">adds payload columns to the leaf without making them key columns &mdash; no sort impact, uniqueness untouched, just coverage</div>
        <div class="lanehead seq" style="--i:4">the price</div><div class="lstep bad seq" style="--i:4">a fatter index: fewer entries per 8 KB page, shallower buffer-pool coverage, and lesson 10's write tax grows with every byte</div>
        <div class="lanehead seq" style="--i:5">the rule</div><div class="lstep seq" style="--i:5">cover the two or three hottest queries, measured &mdash; not every column someone might someday select</div>
      </div>
      <div class="dnote seq" style="--i:6">The invariant: <b style="color:var(--ordered)">"index-only" is a property of the query + index + visibility map together</b> &mdash; the same plan is free on a vacuumed table and heap-bound on a churning one.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Why the hop matters at scale: the heap fetches are <b class="hl">random I/O in someone else's order</b>. A dashboard counting a customer's orders by status reads 13 leaf entries that sit together on one index page &mdash; then scatters across 13 heap pages to pick up one column each. Cover that column and the query's I/O collapses from "1 index page + 13 random pages" to "1 index page." Multiply by every widget on the dashboard and covering is routinely a 10&times; on read-heavy endpoints.</p>
    <p>Two ways to get coverage: make the column part of the key &mdash; (customer_id, status) &mdash; which also lets it participate in Index Cond, or bolt it on with <b class="hl">INCLUDE (status)</b>, which keeps the key lean and is the only option when the index is UNIQUE on customer_id alone. Either way you're buying read speed with write-path bytes; lesson 10's ledger still applies.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the same query, before and after vacuum tells the truth</div>
      <pre class="code">CREATE INDEX orders_cust_cover ON orders (customer_id) INCLUDE (status);

EXPLAIN (ANALYZE) SELECT customer_id, status
FROM orders WHERE customer_id = 4271;
<span class="ok">Index Only Scan using orders_cust_cover on orders</span>
  (actual time=0.031..0.058 rows=13 loops=1)
  Index Cond: (customer_id = 4271)
  <span class="ok">Heap Fetches: 0</span>   <span class="cm">-- pages all-visible: the heap was never opened</span>

<span class="cm">-- same plan after a bulk UPDATE, before vacuum re-marks the pages:</span>
<span class="cm">--   Heap Fetches: 13   -- "index-only" in name, heap-bound in fact</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> index-only scans are the cheapest reads Postgres can do, and the trap is believing the plan header instead of the Heap Fetches line. When a covered query gets slow every afternoon, the index didn't change &mdash; the visibility map did: churn outran vacuum. The fix is vacuum tuning or write batching, not another index, and knowing that separates "reads EXPLAIN" from "understands it."</p>` },

  { eb:"lesson 13 · indexing", title:"Selectivity & the planner", html:`
    <p class="big">The planner is not a rule engine that "prefers indexes" &mdash; it's a <b class="hl">cost model running on statistics</b>: histograms, n_distinct, physical correlation, all gathered by <b class="hl">ANALYZE</b> and autovacuum. An index scan pays <b class="hl">a random page read per matching row</b>; a seq scan pays <b class="hl">every page once, sequentially</b>, no matter how few rows match. Which is cheaper is arithmetic, not ideology.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">orders &middot; 5M rows &middot; ~8 rows per 8 KB page &asymp; 620k pages &middot; random_page_cost 4&times;</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">1% match &middot; 50k rows</div>
          <div class="lstep">seq scan: 620k sequential pages &asymp; 620k cost units</div>
          <div class="lstep good">index: 50k probes &rarr; &le;50k random heap pages &times; 4 &asymp; 200k units</div>
          <div class="lstep good">index wins ~3&times; &mdash; and far more if matches cluster</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">40% match &middot; 2M rows</div>
          <div class="lstep">seq scan: the same 620k units &mdash; selectivity doesn't change it</div>
          <div class="lstep bad">index: 2M random heap pages &times; 4 &asymp; 8M units</div>
          <div class="lstep bad">seq scan wins ~13&times; &mdash; ignoring your index was the right call</div>
        </div>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:2">crossover</div><div class="lstep seq" style="--i:2">rule of thumb: past a few percent of a big table, sequential wins &mdash; the break-even is nowhere near 50%</div>
        <div class="lanehead seq" style="--i:3">correlation</div><div class="lstep good seq" style="--i:3">if matching rows sit physically together (append-ordered timestamps), the "random" reads collapse onto few pages &mdash; ANALYZE tracks this per column</div>
        <div class="lanehead seq" style="--i:4">middle ground</div><div class="lstep seq" style="--i:4">bitmap scan: collect matching TIDs, sort by page, visit each heap page once in order &mdash; how the planner bridges the gap</div>
      </div>
      <div class="dnote seq" style="--i:5">Hold this line: <b style="color:var(--ordered)">"the planner ignored my index" is usually the planner being right.</b> The bug worth hunting is the planner being right about wrong numbers.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>When it IS wrong, the estimate is wrong, and the causes are enumerable: <b class="hl">stale statistics</b> after a bulk load (autovacuum hasn't run &mdash; run <b class="hl">ANALYZE</b> yourself, always, after backfills); <b class="hl">correlated columns</b> the planner multiplies as if independent (city = 'Oslo' AND country = 'NO' &mdash; each 1%, together still 1%, estimated 0.01%); a histogram too coarse for a skewed column &mdash; raise <b class="hl">default_statistics_target</b> (or per-column SET STATISTICS) and re-ANALYZE; and prepared statements switching to a <b class="hl">generic plan</b> costed for an average parameter, not your whale tenant.</p>
    <p>The debugging move is always the same: <b class="hl">EXPLAIN ANALYZE, then compare estimated rows to actual rows at each node</b>. Estimates within a few &times; of reality mean the planner did arithmetic you should trust. A 1,000&times; miss IS the bug &mdash; every join strategy and scan choice downstream of that number was decided on fiction.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; read the estimate gap, then fix the statistics &mdash; not the plan</div>
      <pre class="code">EXPLAIN ANALYZE SELECT * FROM orders WHERE tenant_id = 42;
Index Scan using orders_tenant_time on orders
  (cost=0.43..981.20 <span class="ok">rows=112</span> width=98)
  (actual time=0.9..4180.3 <span class="ok">rows=184230</span> loops=1)
<span class="cm">-- estimated 112, got 184k: a 1600x miss — the plan was built on fiction.</span>
<span class="cm">-- 184k random heap reads lost to a 620k-page seq scan long ago.</span>

ANALYZE orders;                              <span class="cm">-- refresh histograms + n_distinct</span>
ALTER TABLE orders ALTER COLUMN tenant_id SET STATISTICS 1000;
ANALYZE orders;                              <span class="cm">-- finer histogram for skewed tenants</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> half of "the database picked a bad plan" tickets close with one ANALYZE, and most of the rest are estimate misses you can see in sixty seconds by diffing rows= against actual. Engineers who force plans with hints and session flags are treating the symptom; the planner is a calculator &mdash; feed it correct inputs and it's very hard to beat.</p>` },

  { eb:"lesson 14 · indexing", title:"Predicates that can't use the index", html:`
    <p class="big">A B-tree can seek only when your predicate matches its <b class="hl">sorted form</b>. The index on email stores email values in order &mdash; ask a question about those ordered bytes and it seeks; ask about a <b class="hl">transformation</b> of them and the sort order is noise. This property has a name worth using: <b class="hl">sargability</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">index on (email) &middot; anchored prefix seeks &middot; '%suffix' sweeps everything</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="12" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="30" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">adam</text>
        <rect x="52" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="70" y="78" fill="#e2ecf3" font-size="7" text-anchor="middle">anna</text>
        <rect x="92" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="110" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">bree</text>
        <rect x="132" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="150" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">carl</text>
        <rect x="172" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="190" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">dena</text>
        <rect x="212" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="230" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">erin</text>
        <rect x="252" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="270" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">kate</text>
        <rect x="292" y="62" width="36" height="26" rx="5" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="310" y="78" fill="#8ca6b8" font-size="7" text-anchor="middle">zoe</text>
        <text x="12" y="16" fill="#34d3bf" font-size="8">LIKE 'ann%'</text>
        <text x="12" y="28" fill="#8ca6b8" font-size="7.5">a range: 'ann' &le; email &lt; 'ano'</text>
        <circle r="5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.06;0.16;1" keyPoints="0;0;1;1" path="M 56 34 L 70 58"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.06;0.08;0.16;0.2;1" values="0;0;1;1;0;0"/>
        </circle>
        <rect x="52" y="62" width="36" height="26" rx="5" fill="#34d3bf" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.16;0.2;1" values="0;0;0.25;0.25"/></rect>
        <text x="140" y="34" fill="#34d3bf" font-size="7.5" opacity="0">seek: 3 page reads, done &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.2;0.24;1" values="0;0;1;1"/></text>
        <rect x="12" y="96" width="0" height="4" rx="2" fill="#fb923c">
          <animate attributeName="width" dur="6s" repeatCount="indefinite" keyTimes="0;0.45;0.85;1" values="0;0;316;316"/></rect>
        <circle r="5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.45;0.85;1" keyPoints="0;0;1;1" path="M 12 98 L 328 98"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.45;0.47;0.85;0.89;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="12" y="120" fill="#fb923c" font-size="8">LIKE '%gmail.com'</text>
        <text x="12" y="132" fill="#8ca6b8" font-size="7.5">no left anchor &mdash; the sort order can't help</text>
        <text x="210" y="120" fill="#fb923c" font-size="7.5" opacity="0">every leaf checked
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.86;0.9;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">'%x'</div><div class="lstep bad seq" style="--i:0">no left anchor &rarr; nothing to seek to &middot; 'ann%' IS seekable &mdash; in C collation or with a <b>text_pattern_ops</b> index (locale collations don't sort byte-wise)</div>
        <div class="lanehead seq" style="--i:1">f(column)</div><div class="lstep bad seq" style="--i:1">WHERE lower(email) = ... &mdash; the index stores email, not lower(email) &middot; fix: an <b>expression index</b> ON lower(email)</div>
        <div class="lanehead seq" style="--i:2">column + math</div><div class="lstep bad seq" style="--i:2">created_at + interval '1 day' &gt; now() &mdash; a function of the column again &middot; rewrite so the column stands bare</div>
        <div class="lanehead seq" style="--i:3">type mismatch</div><div class="lstep bad seq" style="--i:3">bigint_col = $1 with the parameter bound as numeric, or timestamp vs timestamptz from a sloppy driver &mdash; the comparison resolves in the WIDER type, the COLUMN gets cast, and the seek dies (MySQL goes further: varchar_col = 123 silently casts every row)</div>
        <div class="lanehead seq" style="--i:4">exclusion</div><div class="lstep bad seq" style="--i:4">NOT IN, &lt;&gt; &mdash; "everything except" is nearly the whole tree; there's no run to slice</div>
      </div>
      <div class="dnote seq" style="--i:5">One rule generates every fix: <b style="color:var(--ordered)">keep the column side of the comparison bare</b> &mdash; move the arithmetic, the casts, and the functions to the constant side, or build the index on the expression itself.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Notice what these have in common: none of them are errors. The query returns correct rows, tests pass on 10k-row fixtures, and the planner quietly substitutes a full scan &mdash; you find out at 5M rows, in production, as a p99 regression with no failing check anywhere. Sargability bugs are the purest form of "correct but wrong."</p>
    <p>The expression index deserves its own sentence: <b class="hl">CREATE INDEX ON users (lower(email))</b> stores the <i>computed</i> values in sorted order, and Postgres will use it for any predicate written <b class="hl">exactly</b> as lower(email) = ... &mdash; it even keeps separate statistics for the expression. Case-insensitive lookup, date_trunc buckets, JSONB field extraction: the pattern is always "if you must query a transformation, index the transformation."</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the rewrites &mdash; same rows back, opposite plans</div>
      <pre class="code"><span class="cm">-- function on the column: Seq Scan, always</span>
SELECT * FROM users WHERE lower(email) = 'ann@corp.io';
<span class="ok">CREATE INDEX users_email_lower ON users (lower(email));  -- expression index</span>

<span class="cm">-- left-anchored LIKE under a locale collation: still a Seq Scan</span>
<span class="ok">CREATE INDEX users_email_pat ON users (email text_pattern_ops);</span>
SELECT * FROM users WHERE email LIKE 'ann%';   <span class="cm">-- now a range seek</span>

<span class="cm">-- arithmetic: move it across the comparison, column stands bare</span>
WHERE created_at + interval '1 day' &gt; now()    <span class="cm">-- seq scan</span>
<span class="ok">WHERE created_at &gt; now() - interval '1 day'    -- index seek, same rows</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the most common way a "properly indexed" table performs like an unindexed one, and the whole class of bug is invisible to code review unless you know the rule. When EXPLAIN shows a Seq Scan next to an index that "should" apply, read the predicate's column side first: a function, a cast, or a leading wildcard is the answer more often than anything in the planner. Bare column, or index the expression &mdash; that's the entire fix space.</p>` },
  );

})();
