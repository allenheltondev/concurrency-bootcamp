"use strict";
/* Distributed Systems Bootcamp — lesson pack 10: replication (7-9),
   consistency (10-11), delivery (12-15). Loaded after content.js, before the
   shared engine. This pack ONLY pushes lessons — the cross-links
   (DRILL_LESSON, LESSON_PRACTICE, MODULES[].conceptLesson) are already
   registered in content.js against these final indices, so the nine pushes
   below must stay in exactly this order. */
(function () {
  const eb = (arc) => "lesson " + String(LESSONS.length + 1).padStart(2, "0") + " · " + arc;

  /* ---- 7 · leaders & followers ---- */
  LESSONS.push({ eb: eb("replication"), title: "Leaders & followers", html: `
    <p class="big">The simplest replication scheme: one node — the <b class="hl">leader</b> — takes every write and appends it to a log; the <b class="hl">followers</b> replay that log in order. Reads can go anywhere. Writes have exactly one door.</p>
    <p>One door buys a total order on writes for free — every follower applies the same log in the same sequence, so replicas never diverge. The design question is <b class="hl">when the leader acks</b>. <b class="hl">Synchronous</b>: wait for a follower before answering — an acked write survives the leader's death, but every write pays the slowest follower's latency. <b class="hl">Asynchronous</b>: ack immediately, ship the log in the background — fast, until the leader dies and takes the unreplicated tail of <i>acknowledged</i> writes with it.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">async replication &middot; follower B is lagged &middot; guess where your read lands</div>
      <svg class="estage" viewBox="0 0 340 164" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="62" width="62" height="40" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="41" y="79" fill="#8e86f0" font-size="9" text-anchor="middle">YOU</text>
        <text x="41" y="93" fill="#8b90ab" font-size="8" text-anchor="middle">write, then read</text>
        <rect x="126" y="62" width="70" height="40" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="161" y="79" fill="#57e0b0" font-size="9" text-anchor="middle">LEADER</text>
        <text x="161" y="93" fill="#e7e9f3" font-size="8" text-anchor="middle">log: &hellip;v2</text>
        <rect x="250" y="10" width="80" height="36" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="290" y="25" fill="#57e0b0" font-size="9" text-anchor="middle">FOLLOWER A</text>
        <text x="290" y="39" fill="#8b90ab" font-size="8" text-anchor="middle">caught up &middot; v2</text>
        <rect x="250" y="118" width="80" height="36" rx="8" fill="#11131c" stroke="#ff9a6b" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="290" y="133" fill="#ff9a6b" font-size="9" text-anchor="middle">FOLLOWER B</text>
        <text x="290" y="147" fill="#8b90ab" font-size="8" text-anchor="middle">lagged &middot; still v1</text>
        <line x1="72" y1="82" x2="126" y2="82" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="196" y1="72" x2="250" y2="30" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="196" y1="92" x2="250" y2="134" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <line x1="52" y1="102" x2="250" y2="142" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.03;0.12;1" keyPoints="0;0;1;1" path="M 72 82 L 126 82"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.12;0.16;1" values="1;1;0;0"/>
        </circle>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.16;0.3;1" keyPoints="0;0;1;1" path="M 196 72 L 250 30"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.16;0.18;0.3;0.34;1" values="0;0;1;1;0;0"/>
        </circle>
        <circle r="6" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.16;0.85;1" keyPoints="0;0;1;1" path="M 196 92 L 250 134"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.16;0.18;0.85;0.9;1" values="0;0;1;1;0;0"/>
        </circle>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.42;0.58;1" keyPoints="0;0;1;1" path="M 52 102 L 250 142"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.42;0.44;0.58;0.62;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="150" y="128" fill="#ff9a6b" font-size="8" opacity="0">&#10007; read beats the replication &mdash; B answers v1
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.65;0.95;1" values="0;0;1;1;0"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">you</div><div class="lstep seq" style="--i:0">POST comment &rarr; leader appends v2, acks &mdash; 200 OK</div>
        <div class="lanehead seq" style="--i:1">leader</div><div class="lstep seq" style="--i:1">ships the log: A applies v2 fast &middot; B is 900ms behind</div>
        <div class="lanehead seq" style="--i:2">you</div><div class="lstep bad seq pop" style="--i:2">GET comments &rarr; the load balancer picks B &rarr; v1. your comment vanished.</div>
        <div class="lanehead seq" style="--i:3">later</div><div class="lstep wait seq" style="--i:3">B catches up &middot; you refresh &middot; the comment is back. nothing ever "failed".</div>
      </div>
      <div class="dnote seq" style="--i:4">That is <b style="color:var(--race)">replication lag</b> breaking <b style="color:var(--race)">read-your-writes</b>: your write went to the leader, your next read hit a follower living slightly in the past. Fix: pin the session to the leader, or only read replicas at &ge; your write's log position.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the sync/async trade is one dial: how many acks before you answer</div>
      <pre class="code">class Leader {
  log = [];
  async append(entry, ack) {   <span class="cm">// ack policy: "all" | "majority" | "none"</span>
    this.log.push(entry);                       <span class="cm">// the leader's truth</span>
    const ships = this.followers.map(f =&gt;
      sleep(f.lag).then(() =&gt; f.apply(entry))); <span class="cm">// replicate the log</span>
    if (ack === "all")      await Promise.all(ships); <span class="cm">// sync: durable, slow as the slowest</span>
    if (ack === "majority") <span class="ok">await firstN(ships, 2);</span>  <span class="cm">// the middle setting (lesson 9)</span>
    <span class="cm">// "none": fully async — ack now, ship in the background.</span>
    <span class="cm">// fast, and a leader crash LOSES writes you already confirmed.</span>
    return "acked";
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> every managed database with "read replicas" is this exact picture, lag included. The first question to ask of any read path is <b class="hl">"can this read tolerate lag?"</b> — session-critical reads go to the leader, everything else goes wide. Say that split out loud in a design interview and you've named the trade most candidates trip over.</p>` });

  /* ---- 8 · quorums ---- */
  LESSONS.push({ eb: eb("replication"), title: "Quorums: R + W > N", html: `
    <p class="big">Drop the leader entirely: write to <b class="hl">W</b> of N replicas, read from <b class="hl">R</b> of N. If <b class="hl">R + W &gt; N</b>, every read set must share at least one replica with every write set — the newest value is always in the room.</p>
    <p>The argument is pigeonhole, not protocol. N=3, W=2, R=2: the write landed on two replicas, the read asks two replicas — that's four slots across three nodes, so <b class="hl">some replica is in both sets</b>, whichever two happen to answer. Attach a version to every record, and the read returns the highest version among its R replies. The overlap guarantees the newest version is one of them.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">N=3 &middot; W=2 &middot; R=2 &mdash; the overlap is forced, not lucky</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">replica A</div>
          <div class="lstep good seq pop" style="--i:1">write set &#10003; &middot; stores v2</div>
        </div>
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">replica B</div>
          <div class="lstep seq pop" style="--i:2">read set &#10003; &middot; replies v1 (stale)</div>
        </div>
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">replica C</div>
          <div class="lstep good seq pop" style="--i:1">write set &#10003; &middot; stores v2</div>
          <div class="lstep good seq pop" style="--i:2">read set &#10003; &middot; replies v2</div>
        </div>
      </div>
      <div class="flowarrow seq" style="--i:3">&darr; C sits in BOTH sets &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:4">read</div><div class="lstep seq" style="--i:4">two replies arrive: v1 (from B) and v2 (from C)</div>
        <div class="lanehead seq" style="--i:5">resolve</div><div class="lstep good seq pop" style="--i:5">highest version wins &rarr; <b>v2</b> &nbsp;&#10003; the write cannot be missed</div>
      </div>
      <div class="dnote seq" style="--i:6">2 + 2 &gt; 3. Any two-replica write and any two-replica read intersect — <b style="color:var(--ordered)">the overlap carries the truth</b>, and the version comparison does the rest.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Now dial it down: <b class="hl">W=1, R=1</b>. Writes ack after one replica, reads believe one replica — the fastest configuration you can buy, and the most available: any single reachable node serves you. What it loses is the overlap: 1 + 1 is not &gt; 3, so a read can land on a replica the write never touched and return a stale answer <b class="hl">with full confidence</b>. Success stopped meaning visible.</p>
    <p>The dial has more settings than "balanced". <b class="hl">W=N, R=1</b> makes reads dirt cheap and writes fragile — one down replica fails every write. <b class="hl">W=1, R=N</b> inverts it. Read-heavy systems lean toward big W and small R; write-heavy the reverse. The equation only constrains the <i>sum</i> — where you place the cost is a business decision wearing math.</p>
    <p>Dynamo-style stores push availability one step further: during faults, a <b class="hl">sloppy quorum</b> lets any W <i>reachable</i> nodes accept the write — even ones outside the key's home set — with a <b class="hl">hinted handoff</b> returning the data home later, which trades away even the overlap guarantee to keep accepting writes.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; count the acks against W; read the newest version among R</div>
      <pre class="code">async put(key, value) {
  const rec = { value, version: ++this.#version };
  const settled = await Promise.allSettled(          <span class="cm">// allSettled: a down</span>
    this.replicas.map(rep =&gt; rep.put(key, rec)));    <span class="cm">// replica isn't fatal</span>
  const acks = settled
    .filter(s =&gt; s.status === "fulfilled").length;
  <span class="ok">if (acks &lt; this.w) throw new Error(</span>
    <span class="ok">"write failed: " + acks + "/" + this.w + " acks");</span>
  return { version: rec.version, acks };             <span class="cm">// W acks = the contract</span>
}
async get(key) {
  const settled = await Promise.allSettled(
    this.replicas.map(rep =&gt; rep.get(key)));
  const reads = settled.filter(s =&gt; s.status === "fulfilled");
  if (reads.length &lt; this.r) throw new Error("read failed");
  let newest = null;                                 <span class="cm">// the overlap guarantees the</span>
  for (const s of reads)                             <span class="cm">// newest is among these replies —</span>
    if (s.value &amp;&amp; (!newest || s.value.version &gt; newest.version))
      <span class="ok">newest = s.value;</span>                            <span class="cm">// but only if you COMPARE</span>
  return newest;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> R and W are per-operation dials, and tuning them IS the job: W=2/R=2 for the account balance, W=1/R=1 for the view counter — same store, different promises. Two invariants to say out loud: <b class="hl">a write is only as durable as the acks it actually collected</b>, and <b class="hl">a quorum read must return the newest version among its replies, never the fastest</b> — the overlap puts the truth in the room; the comparison is what finds it.</p>` });

  /* ---- 9 · read repair & anti-entropy ---- */
  LESSONS.push({ eb: eb("replication"), title: "Read repair & anti-entropy", html: `
    <p class="big">A quorum <i>hides</i> staleness; something still has to <b class="hl">fix</b> it. Leaderless replicas converge through three habits: reads that heal what they touch, background sweeps that diff what nobody reads, and gossip carrying the news in between.</p>
    <p><b class="hl">Read repair</b> is the cheap one: a quorum read already collected versions from R replicas, so the moment it sees v2 and v1 side by side, it has <i>proof</i> a replica is behind — and it writes the newest record back before returning. Crucially it re-asserts the <b class="hl">same version</b>: bumping it would mint a brand-new write that races any concurrent real write. A repair restores history; it never adds to it.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the read that noticed &mdash; and healed the replica it caught</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">read</div><div class="lstep seq" style="--i:0">quorum read "profile" &rarr; A: v2 &middot; B: v2 &middot; C: <b>v1</b></div>
        <div class="lanehead seq" style="--i:1">compare</div><div class="lstep seq" style="--i:1">newest version wins &rarr; return v2 to the caller</div>
        <div class="lanehead seq" style="--i:2">repair</div><div class="lstep good seq pop" style="--i:2">put(key, v2) back to C &mdash; SAME version, re-asserted, not minted</div>
        <div class="lanehead seq" style="--i:3">C</div><div class="lstep good seq" style="--i:3">now v2 &nbsp;&#10003; converged &mdash; the next read can't catch it stale</div>
        <div class="lanehead seq" style="--i:4">cold key</div><div class="lstep wait seq" style="--i:4">"settings-old" hasn't been read in a week &mdash; read repair never fires</div>
        <div class="lanehead seq" style="--i:5">sweep</div><div class="lstep good seq" style="--i:5">anti-entropy diffs the replicas' Merkle trees &rarr; copies newest across</div>
      </div>
      <div class="histtape">
        <span class="chip2 seq pop" style="--i:6">gossip r1 &middot; 1 knows</span>
        <span class="chip2 seq pop" style="--i:7">r2 &middot; 3</span>
        <span class="chip2 seq pop" style="--i:8">r3 &middot; 9</span>
        <span class="chip2 micro seq pop" style="--i:9">r4 &middot; all 16</span>
      </div>
      <div class="dnote seq" style="--i:10">The chips are an <b style="color:var(--ordered)">epidemic</b>: every round, every informed node tells a few random peers, so the informed set compounds — 16 nodes in ~4 rounds, <b style="color:var(--ordered)">O(log N)</b>, no coordinator, no single point that has to shout.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Read repair only heals keys that get read. Cold data needs <b class="hl">anti-entropy</b>: a background process that periodically compares whole replicas — usually via <b class="hl">Merkle trees</b>, so two nodes find their differing key ranges by comparing a handful of hashes instead of shipping the dataset — and copies the newest versions across. Hot keys converge in milliseconds via reads; cold keys converge on the sweep's schedule. Together they bound the staleness window from both ends.</p>
    <p>And <b class="hl">gossip</b> is the transport underneath it all: membership changes, failure suspicions, and hinted-handoff hints spread the same epidemic way — each node periodically trading rumors with a few random peers. No broadcast storm, no coordinator to lose, and the math holds at any N: doubling the cluster adds <i>one</i> round.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; getRepair for the hot path, the sweep for the cold one</div>
      <pre class="code">async getRepair(key) {                    <span class="cm">// quorum read + read repair</span>
  const newest = await this.get(key);     <span class="cm">// newest version among R replies</span>
  if (newest) <span class="ok">await Promise.allSettled(</span>
    <span class="ok">this.replicas.map(rep =&gt; rep.put(key, newest)));</span> <span class="cm">// same version —</span>
  return newest;                          <span class="cm">// a repair, not a new write</span>
}

<span class="cm">// anti-entropy — the background sweep for keys nobody reads:</span>
async antiEntropySweep() {
  for (const [a, b] of pairs(this.replicas)) {
    const keys = merkleDiff(a, b);        <span class="cm">// hash trees make "what differs?"</span>
    for (const key of keys)               <span class="cm">// cheap to answer</span>
      await this.getRepair(key);          <span class="cm">// same repair, on a schedule</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "eventually consistent" is not magic — it's these three mechanisms, each with a convergence speed you can name: read repair (next read), anti-entropy (next sweep), gossip (log N rounds). When an interviewer asks <i>how</i> replicas converge, naming the mechanism and its window is the difference between using the buzzword and understanding it.</p>` });

  /* ---- 10 · linearizability vs eventual ---- */
  LESSONS.push({ eb: eb("consistency"), title: "Linearizability vs eventual", html: `
    <p class="big">"Consistent" is not a yes/no property — it's a <b class="hl">ladder</b> of promises, and every rung up costs coordination. Name the rung: <b class="hl">linearizable</b>, <b class="hl">sequential</b>, <b class="hl">causal</b>, or <b class="hl">eventual</b>.</p>
    <p><b class="hl">Linearizable</b> is the top: once a write completes, every read — from anyone, anywhere — sees it. The system behaves <b class="hl">as if one copy existed</b>. Everything below relaxes that: <b class="hl">sequential</b> keeps one agreed order but lets you read it late; <b class="hl">causal</b> only promises effects never appear before their causes; <b class="hl">eventual</b> promises just this — stop writing, and replicas converge&hellip; eventually. The gap where old values can still surface is the <b class="hl">staleness window</b>.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the same read-after-write &middot; two different promises</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">linearizable</div>
          <div class="lstep">write x=5 completes</div>
          <div class="lstep good">any read after &rarr; MUST see 5</div>
          <div class="dnote">as if one copy — the write is a fact everywhere at once</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">eventual</div>
          <div class="lstep">write x=5 completes</div>
          <div class="lstep bad">read after &rarr; may see 3, for a while</div>
          <div class="dnote">the staleness window — bounded by lag, not by zero</div>
        </div>
      </div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:2">linearizable</div><div class="lstep good seq" style="--i:2">latest completed write, always &mdash; costs coordination on EVERY operation</div>
        <div class="lanehead seq" style="--i:3">sequential</div><div class="lstep seq" style="--i:3">everyone sees the SAME order &mdash; possibly late</div>
        <div class="lanehead seq" style="--i:4">causal</div><div class="lstep seq" style="--i:4">effects never precede causes &mdash; concurrent writes may disagree</div>
        <div class="lanehead seq" style="--i:5">eventual</div><div class="lstep seq" style="--i:5">convergence, someday &mdash; no promise about meanwhile</div>
      </div>
      <div class="qbox macro seq" style="--i:6">
        <div class="dlabel">match the app to the rung</div>
        <p style="margin:4px 0 0">A <b class="hl">like counter</b> shrugs at staleness — eventual is free performance. A <b class="hl">bank balance</b> can read a little behind, but the order of deposits and withdrawals must never scramble. A <b class="hl">seat map</b> selling the last seat needs linearizable — two buyers must not both see "available". Pay for the rung the <i>data</i> needs, not the rung that sounds safest.</p>
      </div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Notice what the top rung really buys: not "fresher data" but the right to treat the distributed store <b class="hl">like a single variable</b> — compare-and-set, unique-username checks, "exactly one winner" logic all silently assume it. And notice the workhorse in the middle: <b class="hl">causal</b> is the strongest rung that stays available during a partition, which is why "you always see your own writes, and replies never precede the messages they answer" is what most collaborative apps actually ship.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the rung you get is decided by WHERE the read goes</div>
      <pre class="code"><span class="cm">// linearizable-ish: read where the writes happen</span>
const fresh = await leader.get("seat-14A");
<span class="ok">// cost: one node carries every strong read — and during a</span>
<span class="ok">// partition it may refuse you rather than risk a lie</span>

<span class="cm">// eventual: read whichever replica answers first</span>
const fast = await anyReplica.get("like-count");
<span class="cm">// cost: the answer can be stale — the staleness window is</span>
<span class="cm">// exactly the replication lag (lesson 8)</span>

<span class="cm">// the middle rungs are quorum math: R+W&gt;N buys "reads overlap</span>
<span class="cm">// writes" (lesson 9) — strong-ish freshness without one leader</span>
<span class="cm">// carrying every read</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> most production incidents blamed on "eventual consistency" are really a <b class="hl">mismatched rung</b> — seat-map data served with like-counter guarantees. State the ladder, place each piece of data on its rung, and the storage choices largely make themselves.</p>` });

  /* ---- 11 · CAP & PACELC ---- */
  LESSONS.push({ eb: eb("consistency"), title: "CAP & PACELC", html: `
    <p class="big">When a partition splits your cluster — and at scale, it will — every request on the minority side forces a choice: <b class="hl">refuse</b> (stay Consistent) or <b class="hl">answer anyway</b> (stay Available, possibly stale). You don't choose whether. Only which.</p>
    <p>That's CAP, honestly stated: <b class="hl">P is not optional</b>, so "CA at scale" is a system that hasn't met its first real partition yet. And the theorem says nothing about sunny days — that's the <b class="hl">PACELC</b> extension: during a <b>P</b>artition trade <b>A</b> vs <b>C</b>; <b>E</b>lse, the everyday trade is <b>L</b>atency vs <b>C</b>onsistency, because waiting for replicas is a tax you pay on every single write, partition or not.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">a 5-node cluster splits 3 | 2 &middot; the minority must pick a personality</div>
      <svg class="estage" viewBox="0 0 340 168" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <text x="70" y="16" fill="#57e0b0" font-size="8">MAJORITY &middot; 3 of 5</text>
        <text x="240" y="16" fill="#ff9a6b" font-size="8">MINORITY &middot; 2 of 5</text>
        <rect x="14" y="26" width="56" height="26" rx="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.4"/>
        <text x="42" y="43" fill="#57e0b0" font-size="9" text-anchor="middle">n1</text>
        <rect x="80" y="26" width="56" height="26" rx="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.4"/>
        <text x="108" y="43" fill="#57e0b0" font-size="9" text-anchor="middle">n2</text>
        <rect x="46" y="64" width="56" height="26" rx="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.4"/>
        <text x="74" y="81" fill="#57e0b0" font-size="9" text-anchor="middle">n3</text>
        <text x="74" y="112" fill="#8b90ab" font-size="8" text-anchor="middle">quorum intact &middot; keeps</text>
        <text x="74" y="124" fill="#8b90ab" font-size="8" text-anchor="middle">electing, keeps writing</text>
        <path d="M 172 10 L 160 48 L 178 86 L 162 124 L 174 160" fill="none" stroke="#ff9a6b" stroke-width="1.6" stroke-dasharray="5 4"/>
        <rect x="216" y="26" width="52" height="26" rx="7" fill="#11131c" stroke="#ff9a6b" stroke-width="1.4" stroke-dasharray="4 4"/>
        <text x="242" y="43" fill="#ff9a6b" font-size="9" text-anchor="middle">n4</text>
        <rect x="276" y="26" width="52" height="26" rx="7" fill="#11131c" stroke="#ff9a6b" stroke-width="1.4" stroke-dasharray="4 4"/>
        <text x="302" y="43" fill="#ff9a6b" font-size="9" text-anchor="middle">n5</text>
        <rect x="228" y="128" width="88" height="32" rx="8" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="272" y="148" fill="#8e86f0" font-size="9" text-anchor="middle">CLIENT</text>
        <line x1="266" y1="128" x2="244" y2="52" stroke="#2c3350" stroke-width="1.2"/>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.04;0.16;0.5;0.54;0.66;1" keyPoints="0;0;1;1;0;1;1" path="M 266 128 L 244 52"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.04;0.16;0.2;0.54;0.66;0.7;1" values="0;1;1;0;0;1;0;0"/>
        </circle>
        <text x="222" y="76" fill="#ff9a6b" font-size="8" opacity="0">CP: "no quorum &mdash; try later" &#10007; refused
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.2;0.24;0.46;0.5;1" values="0;0;1;1;0;0"/></text>
        <text x="222" y="76" fill="#57e0b0" font-size="8" opacity="0">AP: "here's v1" &#10003; served &mdash; maybe stale
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;0.96;1" values="0;0;1;1;0"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">P + C</div><div class="lstep seq" style="--i:0">minority refuses &mdash; wrong answers never, some answers no</div>
        <div class="lanehead seq" style="--i:1">P + A</div><div class="lstep seq" style="--i:1">both sides keep serving &mdash; answers always, stale or conflicting sometimes</div>
        <div class="lanehead seq" style="--i:2">"CA"</div><div class="lstep bad seq pop" style="--i:2">requires a network that never partitions &mdash; not a thing you can buy</div>
        <div class="lanehead seq" style="--i:3">Else</div><div class="lstep seq" style="--i:3">no partition? the trade is still running: wait for replicas (C) or ack fast (L)</div>
      </div>
      <div class="dnote seq" style="--i:4">Place systems honestly: single-leader with majority commit is <b style="color:var(--ordered)">CP-ish</b> (the minority goes quiet); Dynamo-style sloppy quorums are <b style="color:var(--race)">AP</b> (everyone answers, conflicts get merged later); a tunable quorum store is <b style="color:var(--accent)">both — per request</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the same store, dialed to either personality</div>
      <pre class="code"><span class="cm">// CP-ish: majority quorums — refuse rather than lie</span>
const cp = new QuorumStore(replicas, 2, 2);   <span class="cm">// N=3, W=2, R=2</span>
await cp.put("seat", "14A");
<span class="ok">// on the minority side of a partition, 2 acks are unreachable —</span>
<span class="ok">// the write THROWS. unavailable, and never wrong.</span>

<span class="cm">// AP-ish: single-ack, sloppy — answer first, reconcile later</span>
const ap = new QuorumStore(replicas, 1, 1);   <span class="cm">// W=1, R=1</span>
await ap.put("likes", 42);
<span class="cm">// both sides keep acking — and may answer differently until</span>
<span class="cm">// read repair / anti-entropy reconciles them (lesson 10)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "is it AP or CP?" is usually the wrong granularity — real systems choose per operation, and the everyday cost is the <b class="hl">ELC half</b> nobody quotes: synchronous consistency is a latency tax you pay on every write, forever. Answer with PACELC and you've told the interviewer you run systems, not just diagram them.</p>` });

  /* ---- 12 · exactly-once is a lie ---- */
  LESSONS.push({ eb: eb("delivery"), title: "Exactly-once is a lie", html: `
    <p class="big">A network gives you exactly two delivery guarantees: <b class="hl">at-most-once</b> (send once, may lose it) and <b class="hl">at-least-once</b> (retry until acked, may duplicate it). "Exactly-once delivery" is not the third option. It is the marketing name for the second one plus a dedupe.</p>
    <p>The impossibility is the two generals wearing a message queue (lesson 4): when your ack doesn't arrive, "the message was lost" and "the message was processed and the <i>ack</i> was lost" are <b class="hl">the same observation</b>. Give up and you may have delivered zero times. Retry and you may deliver twice. No protocol threads that needle, because the last ack can always be the one that's lost.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">the lost-ack ambiguity &middot; one charge, two applications</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="56" width="70" height="42" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="45" y="74" fill="#8e86f0" font-size="9" text-anchor="middle">CLIENT</text>
        <text x="45" y="88" fill="#8b90ab" font-size="8" text-anchor="middle">charge $50</text>
        <rect x="252" y="56" width="78" height="42" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="291" y="74" fill="#57e0b0" font-size="9" text-anchor="middle">SERVER</text>
        <text x="291" y="88" fill="#e7e9f3" font-size="8" text-anchor="middle" opacity="0">applied &times;1
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.2;0.22;0.74;0.76;1" values="0;0;1;1;0;0"/></text>
        <text x="291" y="88" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">applied &times;2 (!)
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.74;0.76;1" values="0;0;1;1"/></text>
        <line x1="80" y1="70" x2="252" y2="70" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="252" y1="86" x2="80" y2="86" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.04;0.2;1" keyPoints="0;0;1;1" path="M 80 70 L 252 70"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.04;0.2;0.23;1" values="0;1;1;0;0"/>
        </circle>
        <circle r="6" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.26;0.4;1" keyPoints="0;0;0.5;0.5" path="M 252 86 L 80 86"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.26;0.38;0.42;1" values="0;1;.6;0;0"/>
        </circle>
        <text x="166" y="104" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">&#10007; ack lost
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.4;0.44;0.6;0.64;1" values="0;0;1;1;0;0"/></text>
        <text x="45" y="118" fill="#8b90ab" font-size="8" text-anchor="middle" opacity="0">timeout &rarr; retry
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.52;0.56;0.72;0.76;1" values="0;0;1;1;0;0"/></text>
        <circle r="6" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.58;0.74;1" keyPoints="0;0;1;1" path="M 80 70 L 252 70"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.58;0.6;0.74;0.78;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="170" y="140" fill="#6a7090" font-size="8" text-anchor="middle">the retry was CORRECT &mdash; the server just couldn't tell it was a retry</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">at-most-once</div><div class="lstep seq" style="--i:0">fire and forget &mdash; a lost message is silently gone (fine for metrics)</div>
        <div class="lanehead seq" style="--i:1">at-least-once</div><div class="lstep seq" style="--i:1">retry until acked &mdash; a lost ACK becomes a duplicate delivery</div>
        <div class="lanehead seq" style="--i:2">exactly-once?</div><div class="lstep bad seq pop" style="--i:2">delivery: impossible &mdash; the last ack can always be the lost one</div>
      </div>
      <div class="qbox macro seq" style="--i:3">
        <div class="dlabel">what the vendor actually means</div>
        <p style="margin:4px 0 0">"Exactly-once semantics" = at-least-once <b class="hl">delivery</b> + deduplication before the side effect = <b class="hl">effectively-once processing</b>. The duplicate still arrives over the wire — something recognizes it and drops it. The network never promises once; the <i>receiver</i> makes once true.</p>
      </div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; embrace at-least-once — and hand the receiver a dedupe handle</div>
      <pre class="code"><span class="cm">// the engineering answer: keep saying it,</span>
<span class="cm">// and make hearing it twice harmless</span>
async function reliableSend(msg) {
  for (;;) {
    send(peer, msg);                      <span class="cm">// may be lost</span>
    const ack = await waitAck(msg.id, 500);
    if (ack) return;                      <span class="cm">// heard back — done</span>
    <span class="cm">// no ack: delivered-or-not is UNKNOWABLE. send again —</span>
    <span class="ok">// msg.id is the receiver's dedupe handle (next lesson)</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> when the interviewer asks for "guaranteed exactly-once", the senior move is to split the phrase: delivery — impossible, pick at-least-once; processing — achievable, via idempotency at the consumer. That one distinction reframes the entire design conversation, and it's the next lesson.</p>` });

  /* ---- 13 · idempotency ---- */
  LESSONS.push({ eb: eb("delivery"), title: "Idempotency", html: `
    <p class="big">An operation is <b class="hl">idempotent</b> when doing it twice equals doing it once. That single property converts at-least-once delivery — retries, redeliveries, duplicate webhooks — from a correctness hazard into a non-event.</p>
    <p>The mechanism is the <b class="hl">idempotency key</b>: an id chosen by the <i>caller</i>, <b class="hl">stable across retries</b> of the same logical operation and <b class="hl">unique across different ones</b> — "charge-order-4123", never a timestamp or a random-per-attempt value (those make every retry look new, which is exactly the failure). The receiver keeps a record of keys it has seen, and the order of operations is the whole game: <b class="hl">check, record, then apply</b>. Record <i>before</i> the side effect — recording after the awaited charge leaves a gap where a concurrent redelivery passes the check too. It's a check-then-act race, and the network supplies the second actor.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the same message, twice &middot; the guard lets exactly one through</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">msg 1</div><div class="lstep seq" style="--i:0">chg-1 arrives &rarr; seen? no</div>
        <div class="lanehead seq" style="--i:1">guard</div><div class="lstep good seq" style="--i:1">record "chg-1" FIRST &rarr; apply the charge &rarr; cache the response</div>
        <div class="lanehead seq" style="--i:2">msg 2</div><div class="lstep seq" style="--i:2">chg-1 again (its ack was lost) &rarr; seen? YES</div>
        <div class="lanehead seq" style="--i:3">guard</div><div class="lstep good seq pop" style="--i:3">bounce &mdash; no effect, return the SAME recorded answer &#10003;</div>
      </div>
      <div class="histtape">
        <span class="chip2 sync seq pop" style="--i:4">set x=5 &middot; safe</span>
        <span class="chip2 sync seq pop" style="--i:5">upsert &middot; safe</span>
        <span class="chip2 macro seq pop" style="--i:6">x++ &middot; needs a key</span>
        <span class="chip2 macro seq pop" style="--i:7">append &middot; needs a key</span>
      </div>
      <div class="dnote seq" style="--i:8">Some operations are <b style="color:var(--ordered)">naturally idempotent</b> — set x=5 twice is still 5, an upsert converges. <b style="color:var(--race)">Increment, append, charge</b> are not: each replay adds. Those are the ones the key must guard.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>One more piece pros remember: cache the <b class="hl">response</b>, not just the fact of application. A retry whose original succeeded should get back the <i>same</i> 200 and the same payment id — returning "duplicate!" as an error just teaches the client to retry harder. The retry is a legitimate question; answer it with the recorded answer.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; check, record, apply — in that order</div>
      <pre class="code">class IdempotentConsumer {
  #seen = new Set();
  applied = 0;
  handle(msg) {                                <span class="cm">// msg = { id, ... }</span>
    if (this.#seen.has(msg.id)) return false;  <span class="cm">// duplicate — drop it</span>
    <span class="ok">this.#seen.add(msg.id);</span>                    <span class="cm">// record BEFORE the effect —</span>
    this.applied++;                            <span class="cm">// close the gap a concurrent</span>
    return true;                               <span class="cm">// redelivery would slip through</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> every payments API worth its uptime demands an idempotency key header for exactly this reason. The invariant to say in the interview: <b class="hl">retries are safe when the receiver can tell "the same operation, again" from "a new operation that looks the same" — and only the caller's key can tell it that.</b></p>` });

  /* ---- 14 · the dual-write problem & the outbox ---- */
  LESSONS.push({ eb: eb("delivery"), title: "The dual-write problem & the outbox", html: `
    <p class="big">"Save the order AND publish OrderCreated" is one sentence and <b class="hl">two systems</b> — a database and a message bus, with no transaction spanning them. Between any two lines, the process can die. Whatever order you write those lines in, there's a crash window that leaves the two systems <b class="hl">disagreeing forever</b>.</p>
    <div class="diagram anim" style="--step:.85s">
      <div class="dlabel">both orderings fail &middot; the crash just picks which lie you tell</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">DB first, then publish</div>
          <div class="lstep">db.insert(order) &#10003; committed</div>
          <div class="lstep bad">CRASH &mdash; publish never runs</div>
          <div class="dnote">the order exists; the event never happens. downstream is never told — silently.</div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">publish inside the txn</div>
          <div class="lstep">bus.publish(OrderCreated) &#10003; sent</div>
          <div class="lstep bad">the txn rolls back a line later</div>
          <div class="dnote">a ghost event — the bus doesn't roll back. the world reacts to an order that doesn't exist.</div>
        </div>
      </div>
      <div class="flowarrow seq" style="--i:2">&darr; the fix: make the event a ROW in the same transaction &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:3">txn</div><div class="lstep good seq" style="--i:3">INSERT orders + INSERT outbox &mdash; one commit: both facts, or neither</div>
        <div class="lanehead seq" style="--i:4">relay</div><div class="lstep seq" style="--i:4">polls the outbox (or tails the commit log via CDC) &rarr; publishes &rarr; marks sent</div>
        <div class="lanehead seq" style="--i:5">crash?</div><div class="lstep good seq pop" style="--i:5">anywhere &mdash; unsent rows survive in the DB; the relay retries on restart</div>
      </div>
      <div class="dnote seq" style="--i:6">The relay is <b style="color:var(--accent)">at-least-once</b> — a crash between publish and mark-sent republishes — which is fine, because consumers dedupe on the event id (lesson 14). The outbox trades "maybe never" for "maybe twice", and twice is the solvable one.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This is the <b class="hl">transactional outbox</b>: the event stops being a network call and becomes <b class="hl">data</b>, committed atomically with the state change it announces. The single-system transaction you already trust does the coordination; the relay's only job is moving committed truth onto the bus. Log tailing (CDC) is the same pattern with the database's own replication log as the outbox — lower latency, no polling.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; one atomic truth, then a relay that can't lose it</div>
      <pre class="code">await db.transaction(async (tx) =&gt; {
  await tx.insert("orders", order);
  <span class="ok">await tx.insert("outbox", {</span>
    <span class="ok">event: "OrderCreated", payload: order, sent: false });</span>
});  <span class="cm">// one commit — both rows, or neither</span>

<span class="cm">// the relay, forever:</span>
for (const e of await db.query("outbox WHERE sent = false")) {
  await bus.publish(e.event, e.payload);   <span class="cm">// at-least-once</span>
  await db.update(e, { sent: true });      <span class="cm">// crash between these two?</span>
}                                          <span class="cm">// republished — consumers dedupe</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "how do you keep the database and the event stream in sync?" is a top-five system-design question, and dual-write is the trap answer. Name the crash window, then name the outbox — state changes and their events must commit <b class="hl">in the same transaction</b>, and everything downstream follows from that one move.</p>` });

  /* ---- 15 · queues, backpressure & poison messages ---- */
  LESSONS.push({ eb: eb("delivery"), title: "Queues, backpressure & poison messages", html: `
    <p class="big">A queue decouples producer from consumer: bursts land in the buffer and drain in the lulls. But a backlog is a <b class="hl">loan against future capacity</b> — and if the consumer is <i>permanently</i> slower, the queue isn't absorbing load, it's <b class="hl">hiding an outage</b> that grows every second.</p>
    <p>That's why queues get bounds. A <b class="hl">bounded queue</b> that's full <b class="hl">pushes back</b> — rejects or blocks the producer — so the slowdown surfaces at the source while it's still small, instead of as an out-of-memory crash an hour later. And it's why the health metric is <b class="hl">consumer lag</b> (depth, and its trend), not throughput: a queue that only ever grows is a countdown, whatever the dashboards say.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">producer &gt; consumer &middot; depth climbs &middot; the poison message gets parked</div>
      <svg class="estage" viewBox="0 0 340 168" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="52" width="66" height="40" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="43" y="69" fill="#8e86f0" font-size="9" text-anchor="middle">PRODUCER</text>
        <text x="43" y="83" fill="#8b90ab" font-size="8" text-anchor="middle">fast</text>
        <rect x="120" y="46" width="94" height="52" rx="9" fill="#11131c" stroke="#2c3350" stroke-width="1.5"/>
        <text x="167" y="62" fill="#8b90ab" font-size="8" text-anchor="middle">QUEUE</text>
        <text x="167" y="84" fill="#e7e9f3" font-size="9" text-anchor="middle" opacity="0">depth: 2
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.05;0.3;0.32;1" values="0;1;1;0;0"/></text>
        <text x="167" y="84" fill="#e7e9f3" font-size="9" text-anchor="middle" opacity="0">depth: 5
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.3;0.32;0.6;0.62;1" values="0;0;1;1;0;0"/></text>
        <text x="167" y="84" fill="#ff9a6b" font-size="9" text-anchor="middle" opacity="0">depth: 9 &uarr;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.62;1" values="0;0;1;1"/></text>
        <rect x="258" y="52" width="72" height="40" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="294" y="69" fill="#57e0b0" font-size="9" text-anchor="middle">CONSUMER</text>
        <text x="294" y="83" fill="#8b90ab" font-size="8" text-anchor="middle">slow</text>
        <rect x="120" y="126" width="94" height="34" rx="8" fill="#11131c" stroke="#ff9a6b" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="167" y="147" fill="#ff9a6b" font-size="9" text-anchor="middle">DLQ &middot; parked</text>
        <line x1="76" y1="72" x2="120" y2="72" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="214" y1="72" x2="258" y2="72" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="167" y1="98" x2="167" y2="126" stroke="#2c3350" stroke-width="1.2" stroke-dasharray="3 5"/>
        <circle r="5.5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="2s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.4;1" keyPoints="0;1;1" path="M 76 72 L 120 72"/>
          <animate attributeName="opacity" dur="2s" repeatCount="indefinite" keyTimes="0;0.4;0.5;1" values="1;1;0;0"/>
        </circle>
        <circle r="5.5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="2s" begin="-1s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.4;1" keyPoints="0;1;1" path="M 76 72 L 120 72"/>
          <animate attributeName="opacity" dur="2s" repeatCount="indefinite" keyTimes="0;0.4;0.5;1" values="1;1;0;0"/>
        </circle>
        <circle r="5.5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.35;1" keyPoints="0;1;1" path="M 214 72 L 258 72"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.35;0.42;1" values="1;1;0;0"/>
        </circle>
        <circle r="5.5" fill="#ff9a6b" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.5;0.6;0.7;0.84;1" keyPoints="0;0;0.21;0.21;1;1" path="M 214 72 L 250 72 L 250 106 L 167 106 L 167 126"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.52;0.86;0.92;1" values="0;0;1;1;0;0"/>
        </circle>
        <text x="252" y="112" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">&#10007;&#10007;&#10007; fails every retry
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.52;0.56;0.72;0.76;1" values="0;0;1;1;0;0"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">healthy</div><div class="lstep seq" style="--i:0">bursts land in the queue, drain in the lulls &mdash; that's the job</div>
        <div class="lanehead seq" style="--i:1">overload</div><div class="lstep bad seq" style="--i:1">consumer permanently slower &rarr; depth only climbs &mdash; no queue size fixes a rate mismatch</div>
        <div class="lanehead seq" style="--i:2">bounded</div><div class="lstep good seq" style="--i:2">full &rarr; reject/block the producer &mdash; enforce capacity instead of discovering it</div>
        <div class="lanehead seq" style="--i:3">poison</div><div class="lstep good seq pop" style="--i:3">fails MAX times &rarr; park in the DLQ &rarr; the stream keeps flowing &rarr; redrive after the fix</div>
      </div>
      <div class="dnote seq" style="--i:4">A <b style="color:var(--race)">poison message</b> that retries at the head of the line forever is head-of-line blocking as a lifestyle — everything behind it starves. Bounded retries plus a <b style="color:var(--ordered)">dead-letter queue</b> keep it visible, inspectable, and replayable once the bug is fixed.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; bounded retries, then the parking lot</div>
      <pre class="code">while (queue.length) {
  const m = queue.shift();
  try { await handle(m); }
  catch (e) {
    <span class="ok">if (++m.attempts &gt;= MAX_ATTEMPTS) dlq.push(m);</span> <span class="cm">// park it — visible,</span>
    else queue.push(m);                  <span class="cm">// not lost. retry behind the others,</span>
  }                                      <span class="cm">// never at the head of the line</span>
}
<span class="cm">// after the fix ships: REDRIVE — dlq messages re-enter the</span>
<span class="cm">// stream and process normally. nothing was silently dropped.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> queues are where delivery theory meets the pager. The three habits to recite: <b class="hl">bound the queue</b> so overload pushes back instead of compounding, <b class="hl">alert on consumer lag</b> because depth trend is the truth, and <b class="hl">dead-letter the poison</b> so one malformed message can't hold ten thousand good ones hostage.</p>` });

})();
