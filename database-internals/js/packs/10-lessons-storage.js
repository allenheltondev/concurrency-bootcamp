"use strict";
/* Database Internals Bootcamp — content pack: storage engines.
   Appends lessons 4-8 (final indices; see the LESSON PLAN in js/content.js):
     4  the write-ahead log & crash recovery
     5  B-trees
     6  LSM trees
     7  B-tree vs LSM: pick your amplification
     8  the buffer pool
   Cross-links for these lessons are registered in content.js against these
   final indices, so the five pushes below must stay in exactly this order.
   Loaded after content.js, before the engine — same shared-global model as a
   classic <script> tag. */
(function () {

  LESSONS.push(
  { eb:"lesson 05 · storage engines", title:"The write-ahead log", html:`
    <p class="big">Every durable database is built on one move: <b class="hl">describe the change before you make it</b>. A commit appends intent records plus a commit record to the <b class="hl">write-ahead log</b>, fsyncs, and only THEN acks the client. The actual data pages? Still dirty in RAM — they get flushed <b class="hl">lazily, later</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">the commit path &middot; ack before the page ever touches disk</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="8" y="10" width="82" height="28" rx="8" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="49" y="28" fill="#4eaeff" font-size="9" text-anchor="middle">COMMIT;</text>
        <rect x="8" y="60" width="212" height="30" rx="8" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="16" y="79" fill="#8ca6b8" font-size="7.5">wal &middot; append-only &middot; one sequential write</text>
        <rect x="150" y="65" width="20" height="20" rx="4" fill="#071726" stroke="#34d3bf" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.1;0.14;1" values="0;0;1;1"/></rect>
        <rect x="174" y="65" width="20" height="20" rx="4" fill="#071726" stroke="#34d3bf" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.17;0.21;1" values="0;0;1;1"/></rect>
        <rect x="198" y="65" width="20" height="20" rx="4" fill="#34d3bf" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.28;1" values="0;0;1;1"/></rect>
        <circle r="6" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.04;0.24;1" keyPoints="0;0;1;1" path="M 49 38 L 49 60 L 208 60"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.28;1" values="1;1;0;0"/>
        </circle>
        <text x="230" y="56" fill="#34d3bf" font-size="8" opacity="0">fsync &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.32;0.36;1" values="0;0;1;1"/></text>
        <text x="120" y="28" fill="#34d3bf" font-size="8" opacity="0">&larr; ack &middot; commit is DURABLE now
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.4;0.44;1" values="0;0;1;1"/></text>
        <rect x="240" y="104" width="92" height="30" rx="8" fill="#071726" stroke="#fb923c" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="286" y="117" fill="#fb923c" font-size="8" text-anchor="middle">8 KB heap page</text>
        <text x="286" y="128" fill="#8ca6b8" font-size="7.5" text-anchor="middle">dirty &middot; RAM only</text>
        <text x="110" y="112" fill="#fb923c" font-size="8" opacity="0">CRASH here? the page is gone &mdash;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.52;0.56;0.72;0.76;1" values="0;0;1;1;0;0"/></text>
        <text x="110" y="124" fill="#fb923c" font-size="8" opacity="0">the commit is not
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.52;0.56;0.72;0.76;1" values="0;0;1;1;0;0"/></text>
        <line x1="120" y1="90" x2="240" y2="112" stroke="#34d3bf" stroke-width="1.4" stroke-dasharray="3 4" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.78;0.82;1" values="0;0;1;1"/></line>
        <text x="110" y="145" fill="#34d3bf" font-size="8" opacity="0">recovery: replay wal from the redo point &rarr; page rebuilt &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.82;0.86;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">append</div><div class="lstep seq" style="--i:0">intent records (page X: old &rarr; new) + one <b>commit record</b> for the xid</div>
        <div class="lanehead seq" style="--i:1">fsync</div><div class="lstep seq" style="--i:1">force the log to stable storage &mdash; the ONLY synchronous disk wait in the commit</div>
        <div class="lanehead seq" style="--i:2">ack</div><div class="lstep good seq pop" style="--i:2">client sees success &middot; the data pages haven't been written &mdash; and don't need to be</div>
        <div class="lanehead seq" style="--i:3">later</div><div class="lstep wait seq" style="--i:3">background writer / checkpointer flushes dirty pages at its leisure</div>
      </div>
      <div class="dnote seq" style="--i:4">One <b style="color:var(--ordered)">sequential</b> append now buys you the right to defer many <b style="color:var(--race)">random</b> page writes until later. That trade &mdash; sequential now, random whenever &mdash; is why WAL-first is fast, not just safe.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Crash recovery is the same log read backwards in purpose: on startup, replay the WAL from the last <b class="hl">checkpoint's redo point</b>, reapplying every logged change to the pages. Transactions that logged intents but <b class="hl">no commit record</b> are simply discarded &mdash; their changes are never redone as committed. One log gives you both halves of the promise: <b class="hl">atomicity</b> (no commit record &rarr; the transaction never happened) and <b class="hl">durability</b> (commit record fsynced &rarr; it always happened).</p>
    <p>A <b class="hl">checkpoint</b> is what keeps replay bounded: flush all dirty pages to disk, then record the redo pointer &mdash; "everything before here is already in the data files." Recovery replays only from that point. The tuning knob is a genuine trade: checkpoint rarely (Postgres: raise <b class="hl">max_wal_size</b>, stretch checkpoint_timeout) and you buy smooth steady-state I/O at the cost of a longer replay after a crash; checkpoint constantly and recovery is instant but the <b class="hl">checkpointer</b> hammers the disk with page-flush spikes. Postgres spreads each checkpoint's writes across the interval for exactly this reason.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the commit path, in order &mdash; the order IS the guarantee</div>
      <pre class="code">async function commit(tx) {
  for (const ch of tx.changes)                <span class="cm">// intent: page, old, new</span>
    wal.append({ lsn: nextLsn(), redo: ch });
  wal.append({ lsn: nextLsn(), commit: tx.xid });
  <span class="ok">await wal.fsync();                          </span><span class="cm">// durability barrier — THE wait</span>
  return "ok";                                <span class="cm">// pages still dirty in RAM</span>
}
<span class="cm">// recovery: for (rec of wal.since(checkpoint.redoLsn)) apply(rec);</span>
<span class="cm">// then discard every xid that never wrote a commit record.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the WAL is the load-bearing wall of the whole building &mdash; replication ships it, point-in-time recovery replays it, and every "how is this durable?" question bottoms out at one fsynced append. When commits are slow, look at the log device and the checkpointer before anything else: the commit path waits on exactly one thing.</p>` },

  { eb:"lesson 06 · storage engines", title:"B-trees", html:`
    <p class="big">A B-tree is what you get when you take "sorted array + binary search" and rebuild it for disk: everything lives in <b class="hl">fixed-size pages</b> (8 KB in Postgres), and the tree is <b class="hl">wide and shallow</b> &mdash; each page holds hundreds of keys, so a fanout in the hundreds gives height <b class="hl">3&ndash;4 for billions of rows</b>.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">a point lookup is 3 page reads &middot; then a full leaf splits</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="140" y="8" width="60" height="22" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="170" y="22" fill="#4eaeff" font-size="8" text-anchor="middle">root</text>
        <rect x="40" y="54" width="60" height="22" rx="6" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <rect x="140" y="54" width="60" height="22" rx="6" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <rect x="240" y="54" width="60" height="22" rx="6" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="170" y="68" fill="#e2ecf3" font-size="8" text-anchor="middle">internal</text>
        <rect x="10" y="100" width="66" height="22" rx="6" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <rect x="96" y="100" width="66" height="22" rx="6" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="129" y="114" fill="#34d3bf" font-size="8" text-anchor="middle">leaf &middot; FULL</text>
        <rect x="182" y="100" width="66" height="22" rx="6" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <line x1="160" y1="30" x2="80" y2="54" stroke="#244155" stroke-width="1.2"/>
        <line x1="170" y1="30" x2="170" y2="54" stroke="#244155" stroke-width="1.2"/>
        <line x1="180" y1="30" x2="270" y2="54" stroke="#244155" stroke-width="1.2"/>
        <line x1="155" y1="76" x2="129" y2="100" stroke="#244155" stroke-width="1.2"/>
        <line x1="185" y1="76" x2="215" y2="100" stroke="#244155" stroke-width="1.2"/>
        <circle r="6" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.05;0.15;0.2;0.3;0.35;0.45;1" keyPoints="0;0;0.33;0.33;0.66;0.66;1;1"
            path="M 170 19 L 170 19 L 170 65 L 170 65 L 129 111 L 129 111 L 129 111"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.45;0.5;1" values="1;1;0;0"/>
        </circle>
        <text x="10" y="20" fill="#8ca6b8" font-size="8" opacity="0">read 1 &middot; root (cached)
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.06;0.1;1" values="0;0;1;1"/></text>
        <text x="10" y="32" fill="#8ca6b8" font-size="8" opacity="0">read 2 &middot; internal (cached)
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.2;0.24;1" values="0;0;1;1"/></text>
        <text x="10" y="44" fill="#8ca6b8" font-size="8" opacity="0">read 3 &middot; leaf &mdash; the one real I/O
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.36;0.4;1" values="0;0;1;1"/></text>
        <rect x="268" y="126" width="66" height="20" rx="6" fill="#071726" stroke="#34d3bf" stroke-width="1.5" stroke-dasharray="4 4" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.66;1" values="0;0;1;1"/></rect>
        <text x="301" y="139" fill="#34d3bf" font-size="7.5" text-anchor="middle" opacity="0">new sibling
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.66;1" values="0;0;1;1"/></text>
        <text x="129" y="140" fill="#fb923c" font-size="8" text-anchor="middle" opacity="0">insert &rarr; leaf full &rarr; SPLIT: upper half moves out
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.55;0.6;1" values="0;0;1;1"/></text>
        <line x1="200" y1="98" x2="185" y2="78" stroke="#34d3bf" stroke-width="1.4" stroke-dasharray="3 4" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.72;0.78;1" values="0;0;1;1"/></line>
        <text x="255" y="90" fill="#34d3bf" font-size="8" opacity="0">separator &uarr; parent
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.72;0.78;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">fanout math</div><div class="lstep seq" style="--i:0">8 KB page &middot; ~40 B per (separator, child) entry &rarr; fanout &asymp; 200 &middot; 200&sup3; &asymp; 8M, 200&#8308; &asymp; 1.6B</div>
        <div class="lanehead seq" style="--i:1">point read</div><div class="lstep good seq" style="--i:1">height 3&ndash;4 = 3&ndash;4 page reads &middot; root + internals ~always in the buffer pool &rarr; ~1 disk read</div>
        <div class="lanehead seq" style="--i:2">range scan</div><div class="lstep seq" style="--i:2">descend once, then walk the sorted leaf level sideways &mdash; the leaves ARE the sorted order</div>
        <div class="lanehead seq" style="--i:3">insert</div><div class="lstep seq" style="--i:3">lands in exactly one leaf &middot; fits &rarr; done &middot; full &rarr; split</div>
      </div>
      <div class="dnote seq" style="--i:4">The tree grows <b style="color:var(--ordered)">at the root</b>: splits cascade upward, and when the root itself splits, a new root appears above it &mdash; height only ever increases by wrapping the top. It never rebalances downward.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The split is the only structural move worth memorizing: a full leaf <b class="hl">allocates a sibling page, moves its upper half of keys there, and pushes the separator key up</b> into the parent. If the parent is full too, it splits the same way &mdash; the cascade can run all the way to the root. This is why B-trees stay balanced without a rebalance pass: every leaf is always the same distance from the root, by construction.</p>
    <p>The cost model to carry around: reads are cheap and bounded (height, minus whatever's cached), but <b class="hl">writes rewrite whole pages</b>. Change one 100-byte row and the engine dirties an 8 KB page and WAL-logs the change &mdash; that ratio of bytes-written to bytes-changed is <b class="hl">write amplification</b>, and it's the B-tree's tax. Lesson 08 puts a number on it against the LSM's very different tax.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the descent &mdash; depth is the tree height, never more</div>
      <pre class="code">function search(pageId, key) {
  const page = bufferPool.read(pageId);       <span class="cm">// one 8 KB page per level</span>
  if (page.isLeaf) return page.find(key);     <span class="cm">// binary search inside the page</span>
  <span class="ok">return search(page.childFor(key), key);     </span><span class="cm">// recursion depth = height: 3-4</span>
}
<span class="cm">// insert: descend the same path; leaf full -></span>
<span class="cm">//   sibling = alloc(); sibling.take(leaf.upperHalf());</span>
<span class="cm">//   parent.add(sibling.firstKey, sibling);   // may split parent — cascade up</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every index you will ever create in Postgres, MySQL, or SQL Server is this structure, and every performance intuition follows from the shape &mdash; point reads are logarithmic-with-a-tiny-base, range scans are sequential once you land, and write cost scales with the number of trees you make each row live in. Say "fanout ~200, height 3&ndash;4, billions of rows" in an interview and you've demonstrated you know why databases feel O(1).</p>` },

  { eb:"lesson 07 · storage engines", title:"LSM trees", html:`
    <p class="big">The LSM tree refuses the B-tree's core move &mdash; it <b class="hl">never updates a page in place</b>. Writes go to a sorted in-memory <b class="hl">memtable</b> (plus a WAL for durability); when the memtable fills, it's flushed wholesale as an <b class="hl">immutable sorted SSTable</b>. Writing is always an append or a sequential dump. The bill arrives on the read path.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">get(k) &middot; newest first &middot; bloom filters skip the dead ends</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="120" y="6" width="120" height="24" rx="7" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="180" y="21" fill="#4eaeff" font-size="8" text-anchor="middle">memtable (RAM)</text>
        <rect x="96" y="44" width="180" height="24" rx="7" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="186" y="59" fill="#e2ecf3" font-size="8" text-anchor="middle">sstable 3 &middot; newest</text>
        <rect x="96" y="80" width="180" height="24" rx="7" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="186" y="95" fill="#e2ecf3" font-size="8" text-anchor="middle">sstable 2 &middot; k=7 &rarr; v9</text>
        <rect x="96" y="116" width="180" height="24" rx="7" fill="#071726" stroke="#244155" stroke-width="1.2"/>
        <text x="186" y="131" fill="#8ca6b8" font-size="8" text-anchor="middle">sstable 1 &middot; oldest &middot; k=7 &rarr; v2 (shadowed)</text>
        <rect x="60" y="46" width="30" height="20" rx="5" fill="#071726" stroke="#34d3bf" stroke-width="1.2"/>
        <text x="75" y="59" fill="#34d3bf" font-size="7" text-anchor="middle">bloom</text>
        <rect x="60" y="82" width="30" height="20" rx="5" fill="#071726" stroke="#34d3bf" stroke-width="1.2"/>
        <text x="75" y="95" fill="#34d3bf" font-size="7" text-anchor="middle">bloom</text>
        <rect x="60" y="118" width="30" height="20" rx="5" fill="#071726" stroke="#34d3bf" stroke-width="1.2"/>
        <text x="75" y="131" fill="#34d3bf" font-size="7" text-anchor="middle">bloom</text>
        <circle r="6" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.05;0.15;0.22;0.32;0.38;0.5;1" keyPoints="0;0;0.3;0.3;0.62;0.62;1;1"
            path="M 30 18 L 30 18 L 30 56 L 30 56 L 30 92 L 30 92 L 186 92"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.56;1" values="1;1;0;0"/>
        </circle>
        <text x="6" y="12" fill="#8ca6b8" font-size="8">get(7)</text>
        <text x="300" y="21" fill="#8ca6b8" font-size="8" text-anchor="middle" opacity="0">miss
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.08;0.12;1" values="0;0;1;1"/></text>
        <text x="42" y="40" fill="#fb923c" font-size="8" opacity="0">bloom: NO &rarr; skip, zero I/O
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.22;0.26;1" values="0;0;1;1"/></text>
        <text x="42" y="76" fill="#34d3bf" font-size="8" opacity="0">bloom: maybe &rarr; probe
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.38;0.42;1" values="0;0;1;1"/></text>
        <text x="240" y="76" fill="#34d3bf" font-size="8" opacity="0">HIT v9 &#10003; stop
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.52;0.58;1" values="0;0;1;1"/></text>
        <text x="186" y="148" fill="#8ca6b8" font-size="7.5" text-anchor="middle" opacity="0">sstable 1's v2 is never read &mdash; first hit wins, newest shadows oldest
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.62;0.68;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">write</div><div class="lstep good seq" style="--i:0">memtable insert + WAL append &mdash; no page read, no seek, ever</div>
        <div class="lanehead seq" style="--i:1">flush</div><div class="lstep seq" style="--i:1">memtable full &rarr; written out as one immutable, sorted SSTable &mdash; sequential dump</div>
        <div class="lanehead seq" style="--i:2">read</div><div class="lstep seq" style="--i:2">memtable, then SSTables <b>newest-first</b>; the FIRST hit wins &mdash; a key can live in many tables</div>
        <div class="lanehead seq" style="--i:3">delete</div><div class="lstep bad seq pop" style="--i:3">a <b>tombstone</b> record &mdash; a newer "this key is dead" that shadows every older value</div>
      </div>
      <div class="dnote seq" style="--i:4">Newest-first is the correctness rule, not an optimization: stop at the first hit and you get the current version <b style="color:var(--ordered)">for free</b>; probe oldest-first and every read resurrects deleted data.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Left alone, the stack of SSTables grows and <b class="hl">read amplification</b> grows with it &mdash; a miss must consult every table. Two mechanisms keep that survivable. <b class="hl">Bloom filters</b>, one per SSTable: a bit-array summary that answers "definitely not here" or "maybe here" &mdash; <b class="hl">no false negatives, tunable false positives</b> (~1% at ~10 bits per key), so a lookup skips almost every table it would have probed for nothing. And <b class="hl">compaction</b>: a background merge of SSTables into fewer, bigger ones that drops shadowed versions and expired tombstones &mdash; the same job VACUUM does for Postgres, wearing sequential-I/O clothes.</p>
    <p>Name the engines precisely: <b class="hl">RocksDB, LevelDB, Cassandra, ScyllaDB</b> are LSM stores; so are the storage layers of many write-heavy systems built on them. <b class="hl">Postgres is not</b> &mdash; it's a heap with B-tree indexes, WAL-first, update-in-place. If you catch yourself saying "Postgres compacts its SSTables," stop: it vacuums its heap.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the read path &mdash; the bloom check is the line that saves you</div>
      <pre class="code">function get(key) {
  const m = memtable.get(key);
  if (m !== undefined) return live(m);        <span class="cm">// newest possible version</span>
  for (const t of sstables) {                 <span class="cm">// iterated newest -> oldest</span>
    <span class="ok">if (!t.bloom.mightContain(key)) continue; </span><span class="cm">// "definitely not" — zero I/O</span>
    const hit = t.find(key);                  <span class="cm">// binary search the sorted run</span>
    if (hit !== undefined) return live(hit);  <span class="cm">// first hit wins — stop here</span>
  }
  return null;
}
<span class="cm">// live(v): v.tombstone ? null : v.value — deletes are data too</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> half of modern infrastructure sits on an LSM, and its failure modes are all downstream of this lesson &mdash; p99 read spikes when compaction falls behind, disk-full from tombstones that can't expire, Cassandra's "reading a deleted partition is slow" folklore. When an LSM store misbehaves, your first three questions are: how many SSTables per read, what's the bloom false-positive rate, and is compaction keeping up.</p>` },

  { eb:"lesson 08 · storage engines", title:"B-tree vs LSM: pick your amplification", html:`
    <p class="big">There is no fast storage engine &mdash; there is only <b class="hl">choosing where the multiplication happens</b>. Every engine pays some mix of <b class="hl">read amplification</b> (pages touched per lookup), <b class="hl">write amplification</b> (bytes written per byte changed), and <b class="hl">space amplification</b> (bytes stored per byte of live data). B-tree and LSM are two corners of that triangle.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the amplification triangle &middot; same data, opposite taxes</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">B-tree &middot; update-in-place + WAL</div>
          <div class="lstep good">read: ONE tree &middot; height 3&ndash;4, top cached &rarr; ~1 disk read</div>
          <div class="lstep bad">write: 100 B change &rarr; 8 KB page rewrite + WAL &mdash; and again at every index</div>
          <div class="lstep">space: moderate &mdash; pages run part-empty after splits, dead versions until vacuum</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">LSM &middot; never update in place</div>
          <div class="lstep good">write: memtable + sequential flush &mdash; no read-before-write, no seeks</div>
          <div class="lstep bad">read: MANY tables &mdash; bloom filters + compaction keep it survivable, not free</div>
          <div class="lstep bad">space: shadowed versions + tombstones live until compaction reclaims them</div>
        </div>
      </div>
      <div class="qbox macro seq" style="--i:2">
        <div class="dlabel">the honest asterisk on "LSM = cheap writes"</div>
        <p style="margin:4px 0 0">Each write is a cheap append &mdash; but <b class="hl">compaction rewrites the same data many times</b> as it migrates down the levels. Total write amplification in a leveled LSM commonly runs 10&ndash;30&times;, and under some workloads it <b class="hl">exceeds the B-tree's</b>. The LSM's real win is that its writes are <i>sequential</i> and deferrable, not that they're few.</p>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:3">pick B-tree</div><div class="lstep good seq" style="--i:3">read-heavy &middot; point + range lookups with a hard latency floor &middot; OLTP defaults (Postgres, InnoDB)</div>
        <div class="lanehead seq" style="--i:4">pick LSM</div><div class="lstep good seq" style="--i:4">write-heavy ingest &middot; logs, events, time-series &middot; sequential-friendly disks (RocksDB, Cassandra)</div>
        <div class="lanehead seq" style="--i:5">never</div><div class="lstep bad seq pop" style="--i:5">"LSM because it's newer" &mdash; you just traded a read tax you'll pay at p99, every query, forever</div>
      </div>
      <div class="dnote seq" style="--i:6">One sentence each: B-tree = <b style="color:var(--ordered)">update-in-place, WAL makes it safe</b>. LSM = <b style="color:var(--ordered)">never update in place, compaction makes it sane</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Run the numbers on a concrete workload. Ingesting 50k events/s of 200 B each: a B-tree dirties a scattered 8 KB leaf per event per index &mdash; random I/O that collapses without a huge cache; the LSM turns the same stream into memtable appends and sequential flushes and doesn't blink. Now invert it: a checkout flow doing point reads at p99 &le; 5 ms &mdash; the B-tree answers in 3&ndash;4 page reads with the top of the tree pinned in cache; the LSM answers in "memtable, then k SSTables, minus bloom skips, unless compaction is behind" &mdash; a distribution with a tail.</p>
    <p>The interview frame that always lands: <b class="hl">"pick your amplification."</b> Say the triangle out loud, put the workload's dominant operation next to the engine's cheap operation, and name the tax you're accepting. That's the entire genre of "which database should we use" questions, answered from first principles.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the decision, compressed to a comment block</div>
      <pre class="code"><span class="cm">// per-op costs, order of magnitude:</span>
<span class="cm">//            B-tree                    LSM</span>
<span class="cm">// point read 3-4 page reads, ~1 disk  memtable + k tables (bloom-pruned)</span>
<span class="cm">// write      page rewrite x indexes   append; compaction re-writes later</span>
<span class="cm">// range scan sorted leaves, seq       k-way merge across tables</span>
<span class="ok">// rule: put the workload's HOT operation on the engine's CHEAP path.</span>
<span class="cm">// 50k writes/s telemetry, rare reads     -> LSM (RocksDB, Cassandra)</span>
<span class="cm">// OLTP point reads, p99 floor, mixed web -> B-tree (Postgres, InnoDB)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this trade explains engine behavior you'll meet in production for the rest of your career &mdash; why Postgres wants vacuum where Cassandra wants compaction, why bulk-loading a B-tree benefits from sorted input, why an LSM's disk usage breathes in sawtooth waves. Amplification isn't trivia; it's the budget every storage feature is paid from.</p>` },

  { eb:"lesson 09 · storage engines", title:"The buffer pool", html:`
    <p class="big">No query touches disk directly. Every page read and every page write goes through the <b class="hl">buffer pool</b> &mdash; a fixed-size cache of 8 KB pages in RAM. A <b class="hl">hit</b> costs nanoseconds-to-microseconds; a <b class="hl">miss</b> costs a disk read, three-to-five orders of magnitude more. Database performance is mostly the story of that ratio.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">hit vs miss &middot; then a restart empties the pool</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="8" y="52" width="70" height="44" rx="9" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="43" y="71" fill="#4eaeff" font-size="9" text-anchor="middle">QUERIES</text>
        <text x="43" y="85" fill="#8ca6b8" font-size="7.5" text-anchor="middle">read page N</text>
        <rect x="122" y="46" width="110" height="56" rx="9" fill="#071726" stroke="#34d3bf" stroke-width="1.5"/>
        <text x="177" y="64" fill="#34d3bf" font-size="8.5" text-anchor="middle">buffer pool</text>
        <text x="177" y="78" fill="#8ca6b8" font-size="7.5" text-anchor="middle">shared_buffers</text>
        <text x="177" y="92" fill="#8ca6b8" font-size="7.5" text-anchor="middle">8 KB frames</text>
        <rect x="262" y="52" width="70" height="44" rx="9" fill="#071726" stroke="#fb923c" stroke-width="1.5"/>
        <text x="297" y="71" fill="#fb923c" font-size="9" text-anchor="middle">DISK</text>
        <text x="297" y="85" fill="#8ca6b8" font-size="7.5" text-anchor="middle">~100 &micro;s&ndash;10 ms</text>
        <line x1="78" y1="74" x2="122" y2="74" stroke="#244155" stroke-width="1.2"/>
        <line x1="232" y1="74" x2="262" y2="74" stroke="#244155" stroke-width="1.2"/>
        <circle r="6" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.08;0.16;0.24;1" keyPoints="0;0;1;0;0" path="M 78 68 L 122 68"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.28;1" values="1;1;0;0"/>
        </circle>
        <text x="100" y="36" fill="#34d3bf" font-size="8" opacity="0">HIT &middot; back in ~&micro;s &#10003;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.16;0.2;0.4;0.44;1" values="0;0;1;1;0;0"/></text>
        <circle r="6" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.32;0.4;0.56;0.64;0.72;1" keyPoints="0;0;0.3;0.65;1;1;1" path="M 78 80 L 122 80 L 262 80 L 122 80"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.32;0.34;0.72;0.76;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="177" y="120" fill="#fb923c" font-size="8" text-anchor="middle" opacity="0">MISS &middot; evict a victim &middot; read from disk &middot; 100&ndash;10,000&times; slower
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.45;0.5;0.72;0.76;1" values="0;0;1;1;0;0"/></text>
        <text x="177" y="136" fill="#fb923c" font-size="8" text-anchor="middle" opacity="0">RESTART &rarr; pool empty &rarr; EVERY request takes this path
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.78;0.84;1" values="0;0;1;1"/></text>
        <text x="177" y="26" fill="#8ca6b8" font-size="7.5" text-anchor="middle">p99 is a hit-rate chart wearing a latency costume</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">eviction</div><div class="lstep seq" style="--i:0">~LRU &middot; Postgres uses a <b>clock-sweep</b> approximation: a usage counter per frame, decremented on sweep, victim at zero</div>
        <div class="lanehead seq" style="--i:1">dirty pages</div><div class="lstep good seq" style="--i:1">written back by the <b>background writer / checkpointer</b> &mdash; never at commit; the WAL already made the commit durable</div>
        <div class="lanehead seq" style="--i:2">big seq scan</div><div class="lstep seq" style="--i:2">does NOT wipe the pool &mdash; Postgres routes huge-table scans through a small <b>ring buffer</b> so one report can't evict your working set</div>
        <div class="lanehead seq" style="--i:3">double-buffer</div><div class="lstep wait seq" style="--i:3">every page also transits the <b>OS page cache</b> &mdash; two caches, one datum; why shared_buffers is usually ~25% of RAM, not 90%</div>
      </div>
      <div class="dnote seq" style="--i:4">The invariant behind "dirty pages flush later": <b style="color:var(--ordered)">WAL before page, always</b> &mdash; a page may only reach disk after the log records describing its changes are fsynced. That ordering is the whole crash-safety contract.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The failure mode to respect is the <b class="hl">cold cache</b>. After a restart or a failover, the pool is empty: hit rate goes from 99% to 0% in one moment, every read pays the disk, and <b class="hl">p99 explodes</b> until the working set re-warms &mdash; minutes to hours on a big instance. Plan for it: <b class="hl">pg_prewarm</b> reloads named relations into the pool on startup, and a failover target should be a replica that's been <b class="hl">serving reads and staying warm</b>, not a cold standby that technically has the bytes.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the read path every page takes</div>
      <pre class="code">function readPage(id) {
  const frame = pool.get(id);
  if (frame) { frame.usage++; return frame; } <span class="cm">// hit — clock-sweep credit</span>
  <span class="ok">const victim = clockSweep();                </span><span class="cm">// sweep until usage hits 0</span>
  if (victim.dirty) {
    wal.fsyncThrough(victim.lsn);             <span class="cm">// WAL-before-page invariant</span>
    disk.write(victim);
  }
  return pool.load(id, disk.read(id));        <span class="cm">// the 100 µs–10 ms line</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "the database got slow" is, more often than any other single cause, "the hit rate moved." Deploys that grow the working set, a new query that drags cold pages through the pool, a failover to a cold replica &mdash; all one diagnosis. Watch the hit ratio next to p99, size shared_buffers with the OS cache in mind, and treat cache warmth as part of failover readiness, not an afterthought.</p>` },
  );

})();
