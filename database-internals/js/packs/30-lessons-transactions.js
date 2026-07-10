"use strict";
/* Database Internals Bootcamp — content pack: transactions.
   Appends lessons 14-20 (final indices; see the LESSON PLAN in js/content.js):
     14  what ACID actually promises
     15  MVCC: readers don't block writers
     16  the anomaly zoo
     17  the isolation ladder
     18  row locks & SELECT FOR UPDATE
     19  deadlocks
     20  optimistic vs pessimistic
   Cross-links for these lessons are registered in content.js against these
   final indices, so the seven pushes below must stay in exactly this order.
   Loaded after content.js, before the engine — same shared-global model as a
   classic <script> tag. */
(function () {

  LESSONS.push(
  { eb:"lesson 15 · transactions", title:"What ACID actually promises", html:`
    <p class="big">ACID is four promises with four different price tags, and interviews love it because most engineers can recite the letters but not the <b class="hl">mechanism behind each one</b>. Unpack them: two are delivered by the WAL you already know, one is mostly delivered by <b class="hl">you</b>, and one is quietly <b class="hl">weaker by default</b> than everyone assumes.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">four letters &rarr; four mechanisms &middot; Postgres semantics</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">A &middot; atomic</div><div class="lstep seq" style="--i:0">all-or-nothing under crashes AND errors &middot; crash: no commit record in the WAL &rarr; the tx never happened &middot; error/ROLLBACK: the aborted xid's row versions are simply <b>never visible</b> &mdash; undo-free MVCC</div>
        <div class="lanehead seq" style="--i:1">C &middot; consistent</div><div class="lstep wait seq" style="--i:1">the db moves between states that satisfy <b>your declared constraints</b> (CHECK, UNIQUE, FK) &mdash; the most oversold letter: application invariants are on you + isolation</div>
        <div class="lanehead seq" style="--i:2">I &middot; isolated</div><div class="lstep bad seq pop" style="--i:2">concurrent txs can't see each other's intermediate states &mdash; BUT the default is NOT serializable: <b>READ COMMITTED</b> is the Postgres/Oracle default, and the whole anomaly zoo of lesson 17 is permitted by default</div>
        <div class="lanehead seq" style="--i:3">D &middot; durable</div><div class="lstep good seq" style="--i:3">committed survives power loss = the WAL fsync from lesson 05, nothing more &middot; knob: synchronous_commit</div>
      </div>
      <div class="dnote seq" style="--i:4">A and D are <b style="color:var(--ordered)">one fsynced log</b> wearing two letters. I is a <b style="color:var(--race)">dial you must set</b>. C is a contract you have to write down before the database can enforce it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Atomicity in Postgres is almost eerily cheap: aborting a transaction is <b class="hl">flipping one bit in pg_xact</b> to "aborted." The row versions the transaction wrote still sit on disk &mdash; they're just invisible to every snapshot, forever, and vacuum sweeps them later. There is no undo pass and no rollback wait. Name the contrast precisely: <b class="hl">MySQL InnoDB uses undo logs</b> &mdash; it rolls back by walking the undo records and reversing each change, so a huge InnoDB rollback takes time proportional to the work undone, while a Postgres rollback is instant regardless of size.</p>
    <p>Durability's fine print is worth saying out loud: <b class="hl">synchronous_commit = off</b> lets the commit ack return before the WAL fsync. You keep atomicity and ordering &mdash; the database never corrupts &mdash; but a crash can silently drop a <b class="hl">bounded window of recent commits</b> (roughly the last wal_writer_delay's worth). That's a legitimate trade for ingest firehoses and a catastrophic one for payments; the point is that D is a per-transaction dial, not a constant of nature.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; atomicity under an error &mdash; nothing to undo, only to never see</div>
      <pre class="code">BEGIN;                                        <span class="cm">-- xid 812 assigned on first write</span>
UPDATE accounts SET balance = balance - 60 WHERE id = 1;
INSERT INTO ledger (account_id, amount) VALUES (1, -60);
<span class="cm">-- ERROR: new row violates check constraint "ledger_amount_shape"</span>
ROLLBACK;
<span class="ok">-- abort = mark xid 812 aborted in pg_xact — one bit, instant</span>
<span class="cm">-- 812's row versions stay on disk, invisible to every snapshot;</span>
<span class="cm">-- vacuum reclaims them later. (InnoDB instead REPLAYS undo-log</span>
<span class="cm">-- records to reverse the changes — rollback cost scales with work.)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every transactions bug you'll debug for the next six lessons lives in the gap between what people think I promises and what READ COMMITTED actually delivers. Knowing which letter is mechanism (A, D), which is contract (C), and which is a dial (I) tells you whether the fix is a config change, a constraint, or an isolation level &mdash; three very different pull requests.</p>` },

  { eb:"lesson 16 · transactions", title:"MVCC: readers don't block writers", html:`
    <p class="big">Postgres never overwrites a row. Every row version carries <b class="hl">xmin</b> (the xid that created it) and <b class="hl">xmax</b> (the xid that deleted it &mdash; and an <b class="hl">UPDATE is delete-old + insert-new</b>, so updates set both). A read doesn't take locks; it takes a <b class="hl">snapshot</b> and picks the one version of each row that snapshot is allowed to see.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one row &middot; two versions &middot; two snapshots see different truths</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="14" y="60" width="140" height="38" rx="8" fill="#11131c" stroke="#2c3350" stroke-width="1.2"/>
        <text x="84" y="76" fill="#e7e9f3" font-size="8" text-anchor="middle">v1 &middot; balance=100</text>
        <text x="84" y="90" fill="#8b90ab" font-size="7.5" text-anchor="middle">xmin=812 &middot; xmax=951</text>
        <rect x="196" y="60" width="130" height="38" rx="8" fill="#11131c" stroke="#2c3350" stroke-width="1.2"/>
        <text x="261" y="76" fill="#e7e9f3" font-size="8" text-anchor="middle">v2 &middot; balance=40</text>
        <text x="261" y="90" fill="#8b90ab" font-size="7.5" text-anchor="middle">xmin=951 &middot; xmax=&mdash;</text>
        <line x1="154" y1="79" x2="196" y2="79" stroke="#2c3350" stroke-width="1.2"/>
        <text x="175" y="74" fill="#8b90ab" font-size="7" text-anchor="middle">951</text>
        <text x="14" y="14" fill="#57e0b0" font-size="8">snapshot A &middot; taken while 951 was in progress</text>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.06;0.18;1" keyPoints="0;0;1;1" path="M 40 20 L 84 52"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.42;0.46;1" values="1;1;0;0"/>
        </circle>
        <text x="14" y="30" fill="#57e0b0" font-size="8" opacity="0">A sees v1 &rarr; balance=100 &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.2;0.24;1" values="0;0;1;1"/></text>
        <text x="14" y="42" fill="#ff9a6b" font-size="8" opacity="0">v2 invisible: 951 &isin; A.inProgress
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.3;0.34;1" values="0;0;1;1"/></text>
        <text x="180" y="116" fill="#8e86f0" font-size="8" opacity="0">snapshot B &middot; taken after 951 committed
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.44;0.48;1" values="0;0;1;1"/></text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5" opacity="0">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.5;0.62;1" keyPoints="0;0;1;1" path="M 300 120 L 261 106"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.52;0.9;0.94;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="180" y="130" fill="#8e86f0" font-size="8" opacity="0">B sees v2 &rarr; balance=40 &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.62;0.66;1" values="0;0;1;1"/></text>
        <text x="180" y="142" fill="#ff9a6b" font-size="8" opacity="0">v1 invisible: deleter 951 committed
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;1" values="0;0;1;1"/></text>
        <text x="14" y="142" fill="#8b90ab" font-size="7.5" opacity="0">A still live &rarr; v1 must stay &middot; vacuum waits
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.8;0.84;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">visible iff</div><div class="lstep seq" style="--i:0">creator (xmin) is committed-and-in-snapshot AND deleter (xmax) is not &mdash; both halves, always</div>
        <div class="lanehead seq" style="--i:1">read/write</div><div class="lstep good seq" style="--i:1">readers never block writers &middot; writers never block readers &mdash; each reads its snapshot's version</div>
        <div class="lanehead seq" style="--i:2">write/write</div><div class="lstep bad seq pop" style="--i:2">writers DO block writers on the same row &mdash; the second UPDATE waits on the first's lock (lesson 19)</div>
      </div>
      <div class="qbox micro seq" style="--i:3">
        <div class="dlabel">this course's snapshot model &middot; the sim + drills use exactly this</div>
        <p style="margin:4px 0 0">A snapshot is <b class="hl">{ xmax: first-unassigned-xid, inProgress: set }</b>. An xid counts for visibility iff it is <b class="hl">committed &and; xid &lt; snap.xmax &and; xid &notin; snap.inProgress</b>. That's a faithful simplification of Postgres's real snapshot &mdash; learn the rule here and every drill grades with the same one.</p>
      </div>
      <div class="dnote seq" style="--i:4">The snapshot is <b style="color:var(--ordered)">the</b> concurrency-control primitive: no read locks, no blocking &mdash; just "which xids existed and had committed when I looked."</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The bill for never overwriting: <b class="hl">dead versions pile up</b>. Every UPDATE leaves the old version behind; <b class="hl">VACUUM</b> reclaims a version only once no live snapshot could still see it. Which means one forgotten <b class="hl">long-running transaction</b> &mdash; an idle-in-transaction console session, a week-long analytics query &mdash; pins the visibility horizon: vacuum can't remove anything newer than that snapshot, tables and indexes <b class="hl">bloat</b>, and the 32-bit xid counter marches toward <b class="hl">wraparound</b>, where Postgres eventually forces aggressive vacuums (and, at the bitter end, refuses writes) to protect visibility itself. "Kill the old transaction" is a real production runbook entry.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the visibility check &mdash; and the columns hiding in every table</div>
      <pre class="code">SELECT xmin, xmax, balance FROM accounts WHERE id = 1;
<span class="cm">--  xmin=812  xmax=0    balance=100     &larr; live, no deleter yet</span>
<span class="cm">-- an UPDATE by xid 951 makes it TWO versions:</span>
<span class="cm">--  old: xmin=812 xmax=951   new: xmin=951 xmax=0</span>

function visible(v, snap) {                 <span class="cm">// the course's model</span>
  const sees = (xid) =&gt;
    <span class="ok">committed(xid) &amp;&amp; xid &lt; snap.xmax &amp;&amp; !snap.inProgress.has(xid);</span>
  if (!sees(v.xmin)) return false;          <span class="cm">// creator must count...</span>
  if (v.xmax &amp;&amp; sees(v.xmax)) return false; <span class="cm">// ...and deleter must NOT</span>
  return true;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> MVCC is why a Postgres read replica of load never "locks the table," why SELECTs during a deploy don't stall &mdash; and why bloat, vacuum tuning, and idle-in-transaction timeouts are on every Postgres operator's dashboard. Every isolation level in the next two lessons is just a policy for <b class="hl">when snapshots get taken</b>.</p>` },

  { eb:"lesson 17 · transactions", title:"The anomaly zoo", html:`
    <p class="big">Isolation anomalies aren't textbook trivia &mdash; each one is a <b class="hl">specific way to lose money</b> under a default-configured database. Learn the five by their production symptom, and rank them: <b class="hl">lost update</b> and <b class="hl">write skew</b> are the two that silently drain real ledgers in real web apps.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">lost update &middot; balance 100, withdraw 60 and 30 &rarr; should end at 10</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">T1</div><div class="lstep seq" style="--i:0">SELECT balance &rarr; 100 &middot; computes 100 &minus; 60 = 40</div>
        <div class="lanehead seq" style="--i:1">T2</div><div class="lstep seq" style="--i:1">SELECT balance &rarr; 100 &middot; computes 100 &minus; 30 = 70</div>
        <div class="lanehead seq" style="--i:2">T1</div><div class="lstep good seq" style="--i:2">UPDATE &hellip; SET balance = 40 &middot; COMMIT</div>
        <div class="lanehead seq" style="--i:3">T2</div><div class="lstep bad seq pop" style="--i:3">UPDATE &hellip; SET balance = 70 &middot; COMMIT &mdash; blindly overwrites T1's 40</div>
        <div class="lanehead seq" style="--i:4">db</div><div class="lstep bad seq" style="--i:4">balance = 70, should be 10 &middot; the customer holds $90 cash, the ledger recorded $30 &mdash; <b>$60 evaporated</b></div>
      </div>
      <div class="dlabel seq" style="--i:5">write skew &middot; checking 70 + savings 60 &middot; rule: combined &ge; 0 after a $100 withdrawal</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:6">T1</div><div class="lstep seq" style="--i:6">SELECT sum(balance) &rarr; 130 &ge; 100 &#10003; &middot; withdraws $100 from <b>checking</b></div>
        <div class="lanehead seq" style="--i:7">T2</div><div class="lstep seq" style="--i:7">SELECT sum(balance) &rarr; 130 &ge; 100 &#10003; &middot; withdraws $100 from <b>savings</b></div>
        <div class="lanehead seq" style="--i:8">both</div><div class="lstep bad seq pop" style="--i:8">disjoint rows &rarr; no lock conflict, no 40001 &rarr; both COMMIT: checking &minus;30, savings &minus;40, combined <b>&minus;70</b></div>
      </div>
      <div class="dnote seq" style="--i:9">The shape to memorize: both txs <b style="color:var(--race)">read an overlapping invariant, then write disjoint rows</b>. Nothing they wrote conflicts &mdash; only what they <i>read</i> went stale. That's why row locks and first-updater-wins never catch it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The rest of the zoo, each with its one-line loss. <b class="hl">Dirty read</b>: reading data another transaction hasn't committed &mdash; you act on a rollback. Postgres refuses this at <b class="hl">every</b> level; READ UNCOMMITTED is accepted syntax but behaves as READ COMMITTED. <b class="hl">Non-repeatable read</b>: the same row read twice in one transaction gives two answers &mdash; an audit report sums a table mid-transfer and the totals drift between page one and the appendix. <b class="hl">Phantom</b>: the same predicate re-queried returns <b class="hl">new rows</b> &mdash; you counted 9 bookings, inserted the 10th, and so did the other guy, because neither of your reads could see a row that didn't exist yet.</p>
    <p>Notice what separates the two ranked killers: in a lost update, both transactions write <b class="hl">the same row</b>, so a locked read or a database-computed update fixes it. In write skew they write <b class="hl">different rows</b>, so only something that tracks <b class="hl">reads</b> &mdash; SERIALIZABLE's rw-antidependency detection, or an explicit lock on what you read &mdash; can save you. Lesson 18 builds exactly that ladder.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the read-modify-write that loses updates &mdash; and the shape that doesn't</div>
      <pre class="code"><span class="cm">-- the trap: value computed in the APP from a stale read</span>
SELECT balance FROM accounts WHERE id = 1;   <span class="cm">-- 100</span>
UPDATE accounts SET balance = 40 WHERE id = 1;  <span class="cm">-- overwrites anything</span>

<span class="cm">-- safe under READ COMMITTED: let the DATABASE do the math</span>
<span class="ok">UPDATE accounts SET balance = balance - 60 WHERE id = 1;</span>
<span class="cm">-- atomic read-modify-write on the current row version;</span>
<span class="cm">-- write skew has no same-row fix — that one needs lesson 18</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "we double-spent a gift card," "two agents claimed the same ticket," "the on-call schedule ended up empty" &mdash; these postmortems are this lesson with the names changed. When you review transactional code, ask two questions: does any value travel read &rarr; app &rarr; write (lost update), and does any check read rows the write doesn't touch (write skew)? Those two questions find most of the money.</p>` },

  { eb:"lesson 18 · transactions", title:"The isolation ladder", html:`
    <p class="big">Isolation levels are a ladder of <b class="hl">snapshot policies</b>, and Postgres starts you on the bottom rung: <b class="hl">READ COMMITTED</b>, where <b class="hl">every statement gets a fresh snapshot</b>. Each rung up freezes the snapshot harder and kills more anomalies &mdash; and pays for it with <b class="hl">aborts you must retry</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the kill matrix &middot; level &times; anomaly &middot; Postgres semantics</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">read uncommitted</div><div class="lstep wait seq" style="--i:0">accepted syntax, but PG runs it AS read committed &mdash; dirty reads are impossible at every level</div>
        <div class="lanehead seq" style="--i:1">read committed</div><div class="lstep seq" style="--i:1">kills <b style="color:var(--ordered)">dirty read</b> &middot; permits <b style="color:var(--race)">non-repeatable &middot; phantom &middot; lost update &middot; write skew</b> &middot; snapshot per STATEMENT</div>
        <div class="lanehead seq" style="--i:2">repeatable read</div><div class="lstep seq" style="--i:2">kills <b style="color:var(--ordered)">dirty &middot; non-repeatable &middot; phantom &middot; lost update (via 40001 + retry)</b> &middot; permits <b style="color:var(--race)">write skew</b> &middot; ONE snapshot per tx</div>
        <div class="lanehead seq" style="--i:3">serializable</div><div class="lstep good seq pop" style="--i:3">kills <b style="color:var(--ordered)">everything, write skew included</b> &middot; cost: more 40001 aborts &mdash; retry is mandatory, not optional</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">two PG-specific facts the standard won't tell you</div>
        <p style="margin:4px 0 0">PG's REPEATABLE READ is <b class="hl">snapshot isolation</b>, and it kills phantoms too &mdash; stronger than the SQL standard requires. And under READ COMMITTED, an UPDATE that waits out a lock <b class="hl">re-checks the row's current version</b> before applying (EvalPlanQual) &mdash; so <b class="hl">SET balance = balance - 60</b> is safe at RC, while app-computed values are not.</p>
      </div>
      <div class="dnote seq" style="--i:5">Read the matrix bottom-up when choosing: start at RC, climb one rung <b style="color:var(--ordered)">only for the transactions whose anomaly you can name</b>. Isolation is per-transaction, not per-database.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>REPEATABLE READ's teeth are <b class="hl">first-updater-wins</b>: if you try to update a row that a concurrent transaction updated and committed after your snapshot, Postgres throws <b class="hl">error 40001 &mdash; "could not serialize access due to concurrent update."</b> That's what kills lost update: the second writer doesn't silently overwrite, it dies &mdash; <b class="hl">if you retry the whole transaction</b>, the retry reads fresh data and the money survives. No retry loop, and you've traded silent corruption for user-facing 500s.</p>
    <p>SERIALIZABLE in Postgres is <b class="hl">SSI</b> (serializable snapshot isolation, Cahill's algorithm): the same snapshot as RR plus tracking of <b class="hl">rw-antidependencies</b> &mdash; "T1 read what T2 wrote past." When those dependencies form a cycle that no serial order could produce, one transaction aborts with 40001. Aborts <b class="hl">are the mechanism</b>, not a failure mode. And name the cross-engine trap precisely: <b class="hl">MySQL InnoDB's REPEATABLE READ is a different animal</b> &mdash; consistent (plain) reads come from the snapshot, but <b class="hl">locking reads (FOR UPDATE) see current data</b>, and <b class="hl">gap locks</b> block inserts into the scanned range to prevent phantoms. Porting retry logic between the two engines without knowing this is a classic outage.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; climbing a rung, and the retry loop that makes it honest</div>
      <pre class="code">BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;    <span class="cm">-- snapshot pinned here</span>
UPDATE accounts SET balance = 40 WHERE id = 1;
<span class="cm">-- concurrent committed update beat you to the row?</span>
<span class="cm">-- ERROR 40001: could not serialize access due to concurrent update</span>
COMMIT;

async function withRetry(run) {               <span class="cm">// app side — non-negotiable</span>
  for (let i = 0; i &lt; 5; i++) {
    try { return await run(); }
    catch (e) {
      <span class="ok">if (e.code !== "40001" &amp;&amp; e.code !== "40P01") throw e;</span>
    }                                         <span class="cm">// serialize + deadlock: retry</span>
  }
  throw new Error("gave up after 5 retries");
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "just use SERIALIZABLE" and "RC is fine everywhere" are both junior answers. The senior move is the matrix: name the anomaly your transaction can actually suffer, pick the cheapest rung that kills it, and wrap everything above RC in retry-on-40001 &mdash; because on the upper rungs, aborts aren't errors, they're the isolation working.</p>` },

  { eb:"lesson 19 · transactions", title:"Row locks & SELECT FOR UPDATE", html:`
    <p class="big">Under MVCC a plain SELECT takes <b class="hl">no row locks at all</b> &mdash; but every UPDATE and DELETE takes an <b class="hl">exclusive row lock held until COMMIT</b>. That "held until commit" is two-phase locking's shape: <b class="hl">acquire as you go, release only at the end</b> &mdash; release early and another transaction could act on data you're about to roll back.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">two writers &middot; one row &middot; the second parks in a FIFO queue</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">T1</div><div class="lstep good seq" style="--i:0">UPDATE accounts &hellip; WHERE id = 1 &rarr; takes the row's exclusive lock</div>
        <div class="lanehead seq" style="--i:1">T2</div><div class="lstep wait seq" style="--i:1">UPDATE the same row &rarr; BLOCKS &middot; enqueued behind T1 (waiters are FIFO per row)</div>
        <div class="lanehead seq" style="--i:2">T1</div><div class="lstep seq" style="--i:2">&hellip;more work&hellip; the lock does NOT release at the last statement &mdash; only at COMMIT/ROLLBACK</div>
        <div class="lanehead seq" style="--i:3">T1</div><div class="lstep good seq" style="--i:3">COMMIT &rarr; lock released</div>
        <div class="lanehead seq" style="--i:4">T2</div><div class="lstep good seq pop" style="--i:4">wakes &middot; re-reads the row's CURRENT version (under RC) &middot; applies its update on top &mdash; not on the stale one</div>
        <div class="lanehead seq" style="--i:5">readers</div><div class="lstep seq" style="--i:5">every plain SELECT during all of this: sails through on its snapshot &mdash; zero blocking</div>
      </div>
      <div class="dnote seq" style="--i:6">The invariant: <b style="color:var(--ordered)">a row's write lock is never observably free while its owner might still roll back</b>. Waiting, re-reading, then applying is what makes "second writer wins on top of first" coherent instead of lost.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p><b class="hl">SELECT &hellip; FOR UPDATE</b> is you borrowing that machinery for a read: "lock these rows now, <b class="hl">as if I were updating them</b>." It's the fix for read-then-decide-then-write: the read itself takes the exclusive row lock, concurrent writers queue behind you, and if someone else already holds the lock, FOR UPDATE <b class="hl">waits and then re-reads the current version</b> (under READ COMMITTED) &mdash; so the value you decide on is the value you locked. This is the pessimistic answer to the lost update from lesson 17.</p>
    <p>Two modifiers turn it into infrastructure. <b class="hl">NOWAIT</b> errors immediately instead of queueing &mdash; for "give me the row or tell me now." <b class="hl">SKIP LOCKED</b> silently skips rows other transactions hold &mdash; which is <b class="hl">the canonical Postgres job-queue pattern</b>: ten workers each grab the first unclaimed job, nobody blocks, nobody double-claims, and a crashed worker's ROLLBACK returns its job to the pool automatically.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the job queue &mdash; SKIP LOCKED doing the coordination</div>
      <pre class="code">BEGIN;
SELECT id, payload FROM jobs
 WHERE status = 'ready'
 ORDER BY id
 <span class="ok">FOR UPDATE SKIP LOCKED</span>                       <span class="cm">-- locked rows: invisible, not blocking</span>
 LIMIT 1;
UPDATE jobs SET status = 'done' WHERE id = $1;  <span class="cm">-- already ours — no race</span>
COMMIT;                                       <span class="cm">-- crash before this? job returns</span>
<span class="cm">-- NOWAIT variant: ERROR 55P03 immediately if the row is held —</span>
<span class="cm">-- for "reserve seat 14B or fail fast", not for queues</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> half of "we need Redis/Kafka for this" designs are a jobs table plus FOR UPDATE SKIP LOCKED that nobody in the room knew about. And the other direction cuts too: an ORM that holds a transaction open across a slow external call is holding <b class="hl">row locks until COMMIT</b> the whole time &mdash; lock queues behind idle transactions are one of the most common causes of a database that "locked up" while CPU sat at 5%.</p>` },

  { eb:"lesson 20 · transactions", title:"Deadlocks", html:`
    <p class="big">T1 locks row A and wants B; T2 locks row B and wants A. Neither can proceed, ever &mdash; a cycle in the <b class="hl">wait-for graph</b>. Postgres doesn't prevent this; it <b class="hl">detects and kills</b>: after <b class="hl">deadlock_timeout</b> (default <b class="hl">1s</b>) of waiting, it runs cycle detection and aborts one victim with <b class="hl">error 40P01</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">the wait-for cycle forms &middot; the detector snips one edge</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <circle cx="75" cy="72" r="22" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="75" y="76" fill="#8e86f0" font-size="9" text-anchor="middle">T1</text>
        <circle cx="265" cy="72" r="22" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="265" y="76" fill="#8e86f0" font-size="9" text-anchor="middle">T2</text>
        <text x="75" y="108" fill="#8b90ab" font-size="7.5" text-anchor="middle">holds row A</text>
        <text x="265" y="108" fill="#8b90ab" font-size="7.5" text-anchor="middle">holds row B</text>
        <path d="M 97 60 C 140 34, 200 34, 243 60" fill="none" stroke="#ff9a6b" stroke-width="1.6" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.1;0.14;1" values="0;0;1;1"/></path>
        <text x="170" y="30" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">T1 waits for row B &rarr;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.1;0.14;1" values="0;0;1;1"/></text>
        <path d="M 243 84 C 200 110, 140 110, 97 84" fill="none" stroke="#ff9a6b" stroke-width="1.6" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.28;0.6;0.64;1" values="0;0;1;1;0;0"/></path>
        <text x="170" y="128" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">&larr; T2 waits for row A &middot; CYCLE
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.28;0.6;0.64;1" values="0;0;1;1;0;0"/></text>
        <text x="170" y="52" fill="#8b90ab" font-size="8" text-anchor="middle" opacity="0">deadlock_timeout 1 s elapses &rarr; run cycle detection
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.42;0.46;1" values="0;0;1;1"/></text>
        <circle cx="265" cy="72" r="22" fill="none" stroke="#ff9a6b" stroke-width="2" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.64;1" values="0;0;1;1"/></circle>
        <text x="265" y="140" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">T2 ABORTED &middot; 40P01
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.64;1" values="0;0;1;1"/></text>
        <text x="75" y="140" fill="#57e0b0" font-size="8" text-anchor="middle" opacity="0">T1 gets row B &rarr; COMMIT &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.72;0.76;1" values="0;0;1;1"/></text>
        <text x="170" y="76" fill="#8b90ab" font-size="7.5" text-anchor="middle" opacity="0">app retries T2 &mdash; the survivor already finished
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.84;0.88;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">detect</div><div class="lstep seq" style="--i:0">a waiter that's been blocked deadlock_timeout (1s) runs the wait-for-graph cycle check</div>
        <div class="lanehead seq" style="--i:1">kill</div><div class="lstep bad seq pop" style="--i:1">one victim aborts: <b>ERROR 40P01 deadlock detected</b> &middot; its locks release &middot; the survivor proceeds</div>
        <div class="lanehead seq" style="--i:2">retry</div><div class="lstep good seq" style="--i:2">the victim's app retries the whole transaction &mdash; the conflict is gone; the retry just runs</div>
      </div>
      <div class="dnote seq" style="--i:3">A deadlock is <b style="color:var(--race)">not a database bug</b> &mdash; it's your access order, reflected back at you. The database's 1-second pause + kill is the safety net, not the fix.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Prevention is embarrassingly simple: <b class="hl">lock in a canonical order</b>. If every transfer locks the lower account id first, T1 and T2 both queue on the same first row and a cycle <b class="hl">cannot form</b> &mdash; cycles need at least two lock orders. In practice that means ORDER BY id on the multi-row SELECT &hellip; FOR UPDATE (a bare multi-row UPDATE gives you no order guarantee), and ordering acquisition by table-then-key when a transaction spans tables. The second lever is <b class="hl">keeping transactions short</b>: the window for a cycle is the time locks are held.</p>
    <p>And the cure, when one slips through anyway: <b class="hl">retry the aborted victim</b>. By the time your app sees 40P01, the survivor has committed &mdash; the retry re-runs against the settled state and almost always succeeds. That's the same retry loop lesson 18 built for 40001; the two codes share a handler for a reason.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; transfer(a, b) &mdash; canonical order makes cycles impossible</div>
      <pre class="code">BEGIN;
<span class="ok">SELECT id FROM accounts WHERE id IN ($1, $2)
 ORDER BY id FOR UPDATE;</span>                     <span class="cm">-- BOTH rows, ALWAYS lowest first</span>
UPDATE accounts SET balance = balance - $3 WHERE id = $1;
UPDATE accounts SET balance = balance + $3 WHERE id = $2;
COMMIT;
<span class="cm">-- transfer(1,9) and transfer(9,1) now both lock id 1 first:</span>
<span class="cm">-- one waits politely, no cycle, no 40P01, no 1s stall.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> deadlock storms have a signature &mdash; p99 jumps by almost exactly <b class="hl">1 second</b> (deadlock_timeout spent waiting) and the logs fill with 40P01 &mdash; and once you know the signature, the diagnosis is minutes: find the two statements in "Process X waits for &hellip; blocked by process Y," read their lock orders, make them agree. It's the rare production fire with a one-line fix.</p>` },

  { eb:"lesson 21 · transactions", title:"Optimistic vs pessimistic", html:`
    <p class="big">Every concurrent-write strategy answers one question: <b class="hl">pay before, or pay after?</b> Pessimistic pays <b class="hl">before</b> &mdash; take the lock first (FOR UPDATE), wait even when nobody conflicts. Optimistic pays <b class="hl">after</b> &mdash; write freely with a <b class="hl">version check</b>, and when the check fails, retry. The choice is a bet on your conflict rate.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">compare-and-set on a version column &middot; the win and the miss</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">T1</div><div class="lstep seq" style="--i:0">reads doc id=7 &rarr; { body, version: 3 } &middot; no lock taken, user starts editing</div>
        <div class="lanehead seq" style="--i:1">T2</div><div class="lstep seq" style="--i:1">reads the same doc &rarr; version 3 &middot; also editing &middot; nobody waits on anybody</div>
        <div class="lanehead seq" style="--i:2">T1</div><div class="lstep good seq" style="--i:2">UPDATE &hellip; SET version = 4 WHERE id = 7 AND version = 3 &rarr; rowCount 1 &middot; WIN</div>
        <div class="lanehead seq" style="--i:3">T2</div><div class="lstep bad seq pop" style="--i:3">same UPDATE &hellip; AND version = 3 &rarr; rowCount <b>0</b> &mdash; the row is at version 4 now; nothing written</div>
        <div class="lanehead seq" style="--i:4">T2</div><div class="lstep wait seq" style="--i:4">re-reads at version 4 &rarr; merge or surface "someone edited this" &mdash; the conflict is EXPLICIT, never silent</div>
      </div>
      <div class="dnote seq" style="--i:5">rowCount 0 is the entire protocol: <b style="color:var(--ordered)">compare-and-set at the row level</b>. The WHERE clause is the compare; the version bump makes every write change the thing being compared.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>When to pick which: <b class="hl">pessimistic when conflicts are common</b> &mdash; a hot inventory row, a queue head &mdash; because retry storms under contention waste more than waiting does. <b class="hl">Optimistic when conflicts are rare</b>, which is most rows in most apps: the uncontended path takes zero locks and waits for nobody, and the occasional retry is cheap. One rule is absolute: <b class="hl">never hold row locks across user think-time</b>. A FOR UPDATE taken when the edit form opens holds the lock until commit &mdash; through lunch, through the closed laptop &mdash; and every other writer on that row queues behind a human. Anything spanning user interaction must be optimistic.</p>
    <p>You already ship this pattern over HTTP: <b class="hl">ETag / If-Match</b> is the same compare-and-set with the version in a header &mdash; 412 Precondition Failed is rowCount 0 wearing a status code. And note what optimistic concurrency asks of the database: nothing beyond READ COMMITTED and an atomic single-row UPDATE. The version column does the isolation.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the CAS update, and the rowCount check that IS the protocol</div>
      <pre class="code">UPDATE documents
   SET body = $1, <span class="ok">version = version + 1</span>
 WHERE id = $2 <span class="ok">AND version = $3</span>;             <span class="cm">-- compare-and-set</span>

const res = await pool.query(sql, [body, id, versionIRead]);
if (res.rowCount === 0) {                     <span class="cm">// someone won since my read</span>
  const fresh = await reload(id);             <span class="cm">// re-read at the new version</span>
  return conflict(fresh);                     <span class="cm">// merge, or tell the user</span>
}
<span class="cm">-- pessimistic twin, for HOT rows inside one request only:</span>
<span class="cm">--   SELECT ... FOR UPDATE; compute; UPDATE; COMMIT — never across think-time</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the transactions arc in one decision. Locks (lessons 19&ndash;20) and versions are the two honest tools for read-then-write; the dishonest third option &mdash; read, compute in the app, write unconditionally &mdash; is lesson 17's lost update, shipping to production. When you see UPDATE without either a lock behind it or a version in its WHERE clause, you've found the bug before the pager does.</p>` },
  );

})();
