"use strict";
/* Distributed Systems Bootcamp — content pack 20: the coordination,
   transactions, and scale arcs (final lesson indices 16-26).
   Loaded after content.js (and after pack 10, which owns 7-15), before the
   shared engine. Appends ELEVEN lessons by pushing into LESSONS; numbering is
   computed from LESSONS.length at push time, so this pack never assumes what
   loaded before it. Cross-links for these lessons are already registered in
   content.js (DRILL_LESSON / LESSON_PRACTICE) — nothing else is touched. */
(function () {

  const eb = (arc) => `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · ${arc}`;

  /* ---- 16 · failure detection ---- */
  LESSONS.push({ eb: eb("coordination"), title: "Failure detection", html: `
    <p class="big">Before a cluster can coordinate anything — elect a leader, reassign a partition, fail over — it has to answer one question: <b class="hl">is that node still alive?</b> The only evidence available is heartbeats, and the only signal of trouble is their absence. Here's the fundamental limit: <b class="hl">silence cannot tell you why it's silent.</b></p>
    <p>A crashed node, a node in a 40-second GC pause, and a healthy node behind a dropped link all produce the <b class="hl">exact same observation</b>: no heartbeat. No amount of waiting distinguishes them — the paused node may wake up one millisecond after you give up on it. So an honest detector never says <i>dead</i>. It says <b class="hl">suspect</b>, and everything built on top of it must act on suspicion, not certainty.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">heartbeats &middot; then silence &middot; the node is paused, not dead</div>
      <svg class="estage" viewBox="0 0 340 150" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="10" y="55" width="76" height="40" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="48" y="72" fill="#57e0b0" font-size="9" text-anchor="middle">NODE N</text>
        <text x="48" y="86" fill="#8b90ab" font-size="8" text-anchor="middle">beating&hellip;</text>
        <text x="48" y="112" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">GC pause — still alive
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.48;0.53;1" values="0;0;1;1"/></text>
        <rect x="250" y="55" width="80" height="40" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="290" y="72" fill="#8e86f0" font-size="9" text-anchor="middle">DETECTOR</text>
        <text x="290" y="86" fill="#57e0b0" font-size="8" text-anchor="middle">N: alive ✓
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.63;1" values="1;1;0;0"/></text>
        <text x="290" y="86" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">N: SUSPECT?
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.6;0.63;1" values="0;0;1;1"/></text>
        <line x1="86" y1="75" x2="250" y2="75" stroke="#2c3350" stroke-width="1.2"/>
        <text x="168" y="66" fill="#6a7090" font-size="8" text-anchor="middle">heartbeat every 10ms</text>
        <circle r="5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.1;1" keyPoints="0;1;1" path="M 86 75 L 250 75"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.1;0.12;1" values="1;1;0;0"/>
        </circle>
        <circle r="5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.26;1" keyPoints="0;0;1;1" path="M 86 75 L 250 75"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.16;0.26;0.28;1" values="0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.32;0.42;1" keyPoints="0;0;1;1" path="M 86 75 L 250 75"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.32;0.42;0.44;1" values="0;1;1;0;0"/>
        </circle>
        <text x="168" y="102" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">&hellip;silence&hellip;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.48;0.52;1" values="0;0;1;1"/></text>
        <text x="170" y="136" fill="#6a7090" font-size="8" text-anchor="middle">timeout fires &rarr; verdict flips — and the node is fine</text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">crashed</div><div class="lstep seq" style="--i:0">no heartbeat arrives</div>
        <div class="lanehead seq" style="--i:1">paused</div><div class="lstep seq" style="--i:1">no heartbeat arrives</div>
        <div class="lanehead seq" style="--i:2">partitioned</div><div class="lstep seq" style="--i:2">no heartbeat arrives</div>
        <div class="lanehead seq" style="--i:3">detector</div><div class="lstep bad seq pop" style="--i:3">three different worlds &rarr; ONE identical observation</div>
      </div>
      <div class="dnote seq" style="--i:4">The verdict is <b style="color:var(--race)">suspect</b>, never dead — because the evidence can't support anything stronger.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The timeout itself is a dial, not a truth. Set it short and you detect real crashes fast — but every GC pause and network blip becomes a <b class="hl">false positive</b>, triggering failovers nothing needed. Set it long and false positives vanish — but a genuinely dead leader keeps its crown for seconds while writes pile up. Phi-accrual detectors are the adaptive version of this dial: they learn each node's heartbeat-interval distribution and report a continuously-scaled <i>suspicion level</i> instead of a fixed cutoff.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the honest detector</div>
      <pre class="code">class FailureDetector {
  #last = new Map(); #timeout;
  constructor(timeout) { this.#timeout = timeout; }
  beat(node, now) { this.#last.set(node, now); }   <span class="cm">// every heartbeat refreshes the record</span>
  status(node, now) {
    const t = this.#last.get(node);
    if (t == null) return "unknown";
    <span class="ok">return (now - t) &gt; this.#timeout
      ? "suspect" : "alive";</span>                       <span class="cm">// never "dead" — silence proves nothing</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> everything downstream inherits this uncertainty. Acting on suspicion — electing a new leader over a node that might still be alive — is only safe if the system can <b class="hl">neutralize the suspect when it comes back</b>. That machinery is fencing, and it's the spine of the next four lessons.</p>` });

  /* ---- 17 · leader election ---- */
  LESSONS.push({ eb: eb("coordination"), title: "Leader election", html: `
    <p class="big">Most coordination problems get radically easier if <b class="hl">one node decides</b> — one serialization point for writes, one assigner of work, one clock that counts. The catch: the leader can die, and the cluster must agree on a replacement <b class="hl">without ever agreeing on two</b>.</p>
    <p>Two ingredients make that safe. First, <b class="hl">terms</b> (Raft's word; epochs elsewhere): a counter that increments with every election, acting as logical time for leadership — a message from term 7 is visibly stale next to term 8, no wall clock consulted. Second, <b class="hl">majority votes</b>: a candidate leads only if more than half the cluster grants its term. Two disjoint majorities can't exist, so two leaders can't coexist in one term. Candidates can split the vote and elect nobody in a round — randomized retry timeouts make a repeat collision vanishingly unlikely.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">5 nodes &middot; the leader dies &middot; term 7 becomes term 8</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">term 7</div><div class="lstep seq" style="--i:0">node 5 leads &middot; heartbeats keep four followers loyal</div>
        <div class="lanehead seq" style="--i:1">crash</div><div class="lstep bad seq" style="--i:1">node 5 goes silent &mdash; detectors flip to suspect</div>
        <div class="lanehead seq" style="--i:2">timeout</div><div class="lstep seq" style="--i:2">node 4 times out first &rarr; increments to term 8, requests votes</div>
        <div class="lanehead seq" style="--i:3">votes</div><div class="lstep good seq pop" style="--i:3">1, 2, 3 grant term 8 &rarr; 4/5 votes &mdash; majority &mdash; node 4 leads</div>
      </div>
      <div class="flowarrow seq" style="--i:4">&darr; now partition the cluster &darr;</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:5">
          <div class="dlabel">5 nodes, split 2 | 3</div>
          <div class="lstep good">3-side: majority &rarr; elects</div>
          <div class="lstep">2-side: leaderless, on purpose</div>
        </div>
        <div class="dcol seq" style="--i:6">
          <div class="dlabel">6 nodes, split 3 | 3</div>
          <div class="lstep bad">3 is not a majority of 6</div>
          <div class="lstep bad">NOBODY elects &mdash; writes stop</div>
        </div>
      </div>
      <div class="dnote seq" style="--i:7">Majority of 5 is 3; majority of 6 is 4. The sixth node bought <b style="color:var(--race)">no extra fault tolerance</b> — and added a split that ties.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>That 3&nbsp;|&nbsp;3 column is why clusters run <b class="hl">odd sizes</b>. Three nodes tolerate one failure (majority 2). Four nodes tolerate&hellip; one failure (majority 3) — the fourth machine adds cost and a perfectly tie-able split, but no headroom. The minority side of any partition stays leaderless <i>by design</i>: refusing to serve is what keeps the two sides from writing divergent histories.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the strict-majority guard</div>
      <pre class="code">function electLeader(nodes, term) {
  const up = nodes.filter(n =&gt; n.up);
  <span class="ok">if (up.length * 2 &lt;= nodes.length)</span>             <span class="cm">// STRICT majority — exactly half fails</span>
    return { leader: null, term, votes: up.length }; <span class="cm">// no quorum &rarr; leaderless, on purpose</span>
  const winner = up.reduce((a, b) =&gt; a.id &gt; b.id ? a : b);
  return { leader: winner.id, term: term + 1,      <span class="cm">// the term advances with the crown</span>
           votes: up.length };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the election answers <i>who leads now</i> — but nothing about it reaches the old leader, which may be mid-GC-pause, fully convinced it still reigns. A majority protects the vote; it does not silence the deposed. What happens when that node wakes up and keeps writing is the next lesson.</p>` });

  /* ---- 18 · split brain & fencing ---- */
  LESSONS.push({ eb: eb("coordination"), title: "Split brain & fencing", html: `
    <p class="big">Plan for this, always: <b class="hl">the deposed leader comes back.</b> The GC pause ends, the partition heals, the VM un-freezes — and a node that missed its own dethroning resumes exactly where it left off, still believing it leads.</p>
    <p>If both the zombie and the new leader accept writes, you have <b class="hl">split brain</b>: two histories diverging from the same past — two customers sold the same last seat, two branches of a ledger that no merge can reconcile. Detection can't prevent this (the zombie looked dead <i>because detection can't tell dead from slow</i>). The fix has to live where the writes land: the storage layer must be able to <b class="hl">reject the past</b>.</p>
    <p>That's the <b class="hl">fencing token</b>: every leadership grant comes with a number that is strictly larger than every grant before it. Writers attach their token; storage remembers the highest it has seen and refuses anything lower. No clock, no membership view, no opinion about who leads — <b class="hl">just an integer compare</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the zombie's write bounces &middot; the rightful write lands</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">t=0</div><div class="lstep seq" style="--i:0">A leads with token <b>8</b> &middot; writes land &middot; store's highest = 8</div>
        <div class="lanehead seq" style="--i:1">t=1</div><div class="lstep wait seq" style="--i:1">A stalls in a GC pause &mdash; lease lapses, nobody tells A</div>
        <div class="lanehead seq" style="--i:2">t=2</div><div class="lstep seq" style="--i:2">B is elected &middot; granted token <b>9</b></div>
        <div class="lanehead seq" style="--i:3">t=3</div><div class="lstep good seq" style="--i:3">B writes with 9 &rarr; 9 &ge; 8 &rarr; accepted &middot; highest = 9 &nbsp;&#10003;</div>
        <div class="lanehead seq" style="--i:4">t=4</div><div class="lstep bad seq pop" style="--i:4">A wakes, writes with 8 &rarr; 8 &lt; 9 &rarr; <b>rejected</b> &nbsp;&#10007; the zombie bounces</div>
      </div>
      <div class="dnote seq" style="--i:5">A never learned it was deposed — it didn't have to. <b style="color:var(--ordered)">The store compared two integers</b> and the stale reign ended at the door.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Look at what the comparison is <i>not</i>: it rejects <b class="hl">below</b> the highest, not at-or-below. The same token stays valid for its holder's entire reign — one grant, many writes. And asking "who is the current leader?" instead would be answering a distributed question with local state: the store's opinion of leadership is exactly as stale as the zombie's.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; storage rejects the past</div>
      <pre class="code">class FencedStore {
  #highest = 0;
  log = [];
  write(token, who, value) {
    <span class="ok">if (token &lt; this.#highest) return false;</span>   <span class="cm">// the past knocks — refused</span>
    this.#highest = token;                       <span class="cm">// equal is fine: same reign, many writes</span>
    this.log.push(who + ":" + value);
    return true;
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "how do you prevent split brain?" is a canonical senior-interview probe, and the losing answer is always some flavor of <i>better detection</i>. The winning answer names the invariant: elections limit how many nodes <b class="hl">believe</b> they lead; fencing at storage limits how many can <b class="hl">act</b> on the belief. You need both — and the second one is an integer.</p>` });

  /* ---- 19 · consensus: the Raft intuition ---- */
  LESSONS.push({ eb: eb("coordination"), title: "Consensus: the Raft intuition", html: `
    <p class="big">Everything so far agrees on one value at a time. Real systems need to agree on a <b class="hl">sequence</b> — a replicated log where every node applies the same operations in the same order. Raft's whole shape: <b class="hl">the leader appends, followers ack, and an entry is COMMITTED once a majority holds it.</b></p>
    <p>Why majority is the magic threshold is one overlap argument, and it's worth saying out loud: a committed entry lives on a majority of nodes, and any future leader must win a majority of votes. <b class="hl">Two majorities always intersect</b> — so every possible next leader shares at least one node with every committed entry. With the right election rules, that means a committed entry can never be elected out of existence. Commit &equiv; survives any leader crash.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">5 nodes &middot; one append &middot; watch the commit line move</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">leader</div><div class="lstep seq" style="--i:0">appends "x=1" to its own log (term 3) &rarr; 1/5 hold it</div>
        <div class="lanehead seq" style="--i:1">replicate</div><div class="lstep seq" style="--i:1">followers B and C ack &rarr; 3/5 hold it &middot; D slow &middot; E partitioned</div>
        <div class="lanehead seq" style="--i:2">commit</div><div class="lstep good seq pop" style="--i:2">3/5 is a majority &rarr; COMMITTED &mdash; leader answers the client &#10003;</div>
        <div class="lanehead seq" style="--i:3">later</div><div class="lstep seq" style="--i:3">D catches up from the log &mdash; stragglers converge, commits never waited</div>
        <div class="lanehead seq" style="--i:4">stale</div><div class="lstep bad seq" style="--i:4">a deposed term-2 leader tries to append &rarr; followers on term 3 reject it</div>
      </div>
      <div class="qbox macro seq" style="--i:5">
        <div class="dlabel">the overlap argument</div>
        <p style="margin:4px 0 0">Commit majority: {leader, B, C}. Any election majority of 5 has 3 members &mdash; it <b class="hl">must</b> include the leader, B, or C. Whoever wins next has the entry. That intersection IS the durability guarantee.</p>
      </div>
      <div class="dnote seq" style="--i:6">Waiting for ALL five would let one slow node freeze the cluster; committing at one ack lets a confirmed write die with the leader. <b style="color:var(--ordered)">Majority is the deliberate middle.</b></div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Terms do double duty here: they elect (lesson before) and they <b class="hl">fence</b>. Every append carries the leader's term, and followers reject any term below their own — so a stale leader's appends bounce off the cluster exactly like a zombie's writes bounce off a fenced store. Same integer trick, applied to the log.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; commit = majority ack</div>
      <pre class="code">class LogLeader {
  #commitIndex = -1;
  constructor(replicas, term) { this.replicas = replicas; this.term = term; }
  async append(entry, reachable = this.replicas) {
    <span class="cm">// each follower rejects any term below its own — the stale-leader fence</span>
    const acks = await this.replicate(entry, reachable);
    <span class="ok">if (acks * 2 &gt; this.replicas.length) this.#commitIndex++;</span>  <span class="cm">// majority &rarr; committed</span>
    return { acks, committed: this.#commitIndex };
  }
}</pre>
    </div>
    <p>Honesty clause: full Raft is this intuition plus the machinery that keeps logs identical — the log-matching check on every append, and the election restriction that only lets up-to-date candidates win. Those details are exactly where hand-rolled implementations die in production, which is why the professional move is a library or a service (etcd, ZooKeeper, or your cloud's equivalent) — and this lesson so you know what it's promising.</p>
    <p><b class="hl">Why it matters:</b> the replicated log is the load-bearing wall of modern infrastructure — Kafka's controller, etcd under Kubernetes, every managed database's failover. When you can explain <i>why committed entries survive leader crashes</i> in one sentence about intersecting majorities, you understand consensus well enough to be trusted near it.</p>` });

  /* ---- 20 · distributed locks & leases ---- */
  LESSONS.push({ eb: eb("coordination"), title: "Distributed locks & leases", html: `
    <p class="big">Take a mutex and stretch it across a network and it acquires a lethal failure mode: <b class="hl">the holder can die holding it.</b> A non-expiring distributed lock plus one crashed client equals a system deadlocked forever — no stack unwinds across machines, no finally block runs on a dead node.</p>
    <p>So every real distributed lock is a <b class="hl">lease</b>: a lock with a TTL, kept alive by renewal. Holder healthy &rarr; it renews and works on. Holder dead &rarr; the lease lapses and someone else proceeds. The deadlock is cured — and a new gap opens.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the lease timeline &middot; the overlap window is the whole problem</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">t=0</div><div class="lstep seq" style="--i:0">A acquires the lease &middot; TTL 30s &middot; fencing token <b>5</b></div>
        <div class="lanehead seq" style="--i:1">t=10</div><div class="lstep wait seq" style="--i:1">A enters a long GC pause &mdash; renewals stop, work frozen mid-step</div>
        <div class="lanehead seq" style="--i:2">t=30</div><div class="lstep seq" style="--i:2">lease expires &mdash; A is still paused, still "holding" it in its own mind</div>
        <div class="lanehead seq" style="--i:3">t=31</div><div class="lstep seq" style="--i:3">B acquires &middot; token <b>6</b> &middot; starts the same job</div>
        <div class="lanehead seq" style="--i:4">t=40</div><div class="lstep bad seq pop" style="--i:4">A wakes and resumes AS IF NOTHING HAPPENED &mdash; two holders, one resource</div>
        <div class="lanehead seq" style="--i:5">storage</div><div class="lstep good seq" style="--i:5">A's next write carries token 5 &lt; 6 &rarr; rejected &mdash; the window closes at the resource &#10003;</div>
      </div>
      <div class="dnote seq" style="--i:6">t=30 to t=40 is the <b style="color:var(--race)">overlap window</b>: the lease said A was gone; A's CPU disagreed. No TTL tuning removes it — a pause can outlast any TTL you dare set.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Sit with that window. A checked its lease before pausing — it was valid. It wakes and continues; <b class="hl">it has no way to know time passed.</b> The lease alone is therefore insufficient: it bounds how long a dead holder blocks others, but it cannot stop a paused holder from acting after expiry. Which is why every lease grant carries a <b class="hl">fencing token</b>, and the <i>resource</i> — not the lock service — checks it on every operation. The complete recipe, and the phrase to say in interviews: <b class="hl">lock service for coordination, fencing at storage for safety.</b></p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; a lease grant mints a token</div>
      <pre class="code">class LeaseServer {
  #holder = null; #expires = 0; #token = 0;
  acquire(node, now, ttl) {
    if (this.#holder !== null &amp;&amp; now &lt; this.#expires)
      return null;                      <span class="cm">// a live lease exists — refused</span>
    this.#holder = node;
    this.#expires = now + ttl;          <span class="cm">// the TTL is the deadlock insurance</span>
    <span class="ok">return ++this.#token;</span>               <span class="cm">// new grant, strictly bigger token — the fencing half</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "just use a Redis lock" is one of the most common ways real systems corrupt data. The failure isn't the lock — it's believing the lease's word at the moment it matters least. If the resource being protected can't check a token, the lock is an optimization for the happy path, not a guarantee, and you should say so out loud in the design review.</p>` });

  /* ---- 21 · two-phase commit ---- */
  LESSONS.push({ eb: eb("transactions"), title: "Two-phase commit", html: `
    <p class="big">Sometimes one operation must land on several nodes <b class="hl">atomically</b> — debit here, credit there, both or neither. Two-phase commit is the classic answer: a coordinator asks everyone to <b class="hl">prepare</b> (phase 1: each participant votes, holding locks on what it promised), then broadcasts <b class="hl">commit or abort</b> (phase 2: unanimity commits; any single "no" aborts everyone).</p>
    <p>A "yes" vote is a hard promise: <i>I have durably staged this and CAN commit, no matter what happens to me</i>. That promise is exactly what makes the protocol atomic — and exactly what makes its failure mode ugly.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">votes flow in &middot; the coordinator dies at the decision point</div>
      <svg class="estage" viewBox="0 0 340 170" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="127" y="8" width="86" height="32" rx="8" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="170" y="28" fill="#8e86f0" font-size="9" text-anchor="middle">COORD</text>
        <rect x="127" y="8" width="86" height="32" rx="8" fill="none" stroke="#ff9a6b" stroke-width="1.5" stroke-dasharray="4 4" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.54;1" values="0;0;1;1"/></rect>
        <text x="170" y="56" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">✗ dies before deciding
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.5;0.54;1" values="0;0;1;1"/></text>
        <rect x="16" y="116" width="86" height="34" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="59" y="137" fill="#57e0b0" font-size="9" text-anchor="middle">P1: yes</text>
        <rect x="127" y="116" width="86" height="34" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="170" y="137" fill="#57e0b0" font-size="9" text-anchor="middle">P2: yes</text>
        <rect x="238" y="116" width="86" height="34" rx="8" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="281" y="137" fill="#57e0b0" font-size="9" text-anchor="middle">P3: yes</text>
        <line x1="59" y1="116" x2="160" y2="40" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="170" y1="116" x2="170" y2="40" stroke="#2c3350" stroke-width="1.2"/>
        <line x1="281" y1="116" x2="180" y2="40" stroke="#2c3350" stroke-width="1.2"/>
        <circle r="5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.14;1" keyPoints="0;1;1" path="M 160 40 L 59 116"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.14;0.16;1" values="1;1;0;0"/>
        </circle>
        <circle r="5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.14;1" keyPoints="0;1;1" path="M 170 40 L 170 116"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.14;0.16;1" values="1;1;0;0"/>
        </circle>
        <circle r="5" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.14;1" keyPoints="0;1;1" path="M 180 40 L 281 116"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.14;0.16;1" values="1;1;0;0"/>
        </circle>
        <circle r="5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.24;0.42;1" keyPoints="0;0;1;1" path="M 59 116 L 160 40"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.42;0.44;1" values="0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.24;0.42;1" keyPoints="0;0;1;1" path="M 170 116 L 170 40"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.42;0.44;1" values="0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#57e0b0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.24;0.42;1" keyPoints="0;0;1;1" path="M 281 116 L 180 40"/>
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.24;0.42;0.44;1" values="0;1;1;0;0"/>
        </circle>
        <text x="170" y="164" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">prepared &middot; locks held &middot; can't commit, can't abort &middot; waiting&hellip;
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.58;0.62;1" values="0;0;1;1"/></text>
        <text x="170" y="76" fill="#6a7090" font-size="8" text-anchor="middle">phase 1: prepare &darr; &middot; votes &uarr; &middot; phase 2: never arrives</text>
      </svg>
      <div class="dnote seq" style="--i:0">Every participant voted yes, so none may unilaterally abort &mdash; the coordinator might have committed others. None may commit &mdash; it might have aborted. <b style="color:var(--race)">They are stuck, locks held, until the coordinator recovers.</b></div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>That's the blocking flaw, and it isn't an implementation bug — it's the protocol. A prepared participant has surrendered its right to decide. Crash the coordinator between the phases and everyone who promised sits frozen, <b class="hl">holding locks that block unrelated transactions</b>, until the coordinator's log comes back. The blast radius of one machine's crash becomes cluster-wide lock contention.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; unanimity or nothing</div>
      <pre class="code">async function twoPhaseCommit(participants) {
  <span class="cm">// phase 1: everyone votes; "yes" = durably prepared, locks held</span>
  const votes = await Promise.all(participants.map(p =&gt; p.prepare()));
  <span class="ok">if (votes.every(v =&gt; v === "yes")) {</span>                 <span class="cm">// unanimity — and only unanimity</span>
    await Promise.all(participants.map(p =&gt; p.commit()));
    return "committed";
  }
  await Promise.all(participants.map(p =&gt; p.abort()));   <span class="cm">// one "no" aborts everyone</span>
  return "aborted";
}
<span class="cm">// the dark side: die between the phases and every prepared</span>
<span class="cm">// participant waits, locks held, for the coordinator's return</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the blocking flaw draws 2PC's boundary in production. Inside one trust domain, over short transactions, with a coordinator whose recovery you control — a database's internal atomic commit — it earns its keep. Across services, over seconds, holding locks while HTTP calls wander? That's how outages are born. Cross-service atomicity trades isolation for availability and goes to the saga — next lesson.</p>` });

  /* ---- 22 · sagas ---- */
  LESSONS.push({ eb: eb("transactions"), title: "Sagas", html: `
    <p class="big">A trip booking spans three services and thirty seconds — no coordinator can hold locks across that. The saga's move: give up on distributed atomicity. <b class="hl">Each step commits LOCALLY</b>, immediately, for real. If a later step fails, you don't roll back — there's nothing to roll back into. You run <b class="hl">compensations</b>: new transactions that undo the completed steps, in reverse order.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">book a trip &middot; the card declines &middot; unwind the stack you built</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">step 1</div><div class="lstep good seq" style="--i:0">book flight &rarr; committed locally &#10003; (a real reservation exists)</div>
        <div class="lanehead seq" style="--i:1">step 2</div><div class="lstep good seq" style="--i:1">book hotel &rarr; committed locally &#10003;</div>
        <div class="lanehead seq" style="--i:2">step 3</div><div class="lstep bad seq pop" style="--i:2">charge card &rarr; DECLINED &#10007; &mdash; two real bookings, zero payment</div>
      </div>
      <div class="flowarrow seq" style="--i:3">&darr; compensate in REVERSE &mdash; last committed, first undone &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:4">undo 2</div><div class="lstep seq" style="--i:4">cancel hotel &mdash; the booking that depended on the flight goes first</div>
        <div class="lanehead seq" style="--i:5">undo 1</div><div class="lstep seq" style="--i:5">cancel flight &mdash; the foundation comes out last</div>
      </div>
      <div class="dnote seq" style="--i:6">Forward order builds a dependency stack; <b style="color:var(--ordered)">reverse order unwinds it</b> &mdash; exactly like a call stack. Undo the flight first and you're cancelling the itinerary the hotel booking still references.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Compensations are not free — they are <b class="hl">business logic you must design</b>. "Cancel the reservation" and "refund the charge" are real product decisions with real edge cases (the refund fee, the non-cancellable room), not something a framework generates. And because each compensation is itself a network call that can fail and be retried, every one must be <b class="hl">idempotent and retriable</b> — undo-twice must equal undo-once, or the recovery path becomes its own incident.</p>
    <p>Backward recovery (compensate everything) isn't the only shape: some sagas choose <b class="hl">forward recovery</b> — retry the failed step until it succeeds — when the later steps are guaranteed-completable and abandoning the transaction is worse than finishing it late.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the catch block IS the saga</div>
      <pre class="code">async run(log = []) {
  const done = [];
  for (const s of this.#steps) {
    try { await s.action(); log.push("ok:" + s.name); done.push(s); }
    catch (e) {
      <span class="ok">for (const d of done.reverse()) {</span>          <span class="cm">// unwind the stack you built</span>
        await d.compensate();                    <span class="cm">// business logic — idempotent, retriable</span>
        log.push("undo:" + d.name);
      }
      return { ok: false, log };
    }
  }
  return { ok: true, log };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the saga's honest trade is <b class="hl">isolation</b>. Between step 1 and the last undo, the world can see the intermediate state — a flight booked for a trip that will never happen. You're accepting temporary inconsistency, bounded by compensations, in exchange for never holding a cross-service lock. Say that trade out loud in a design review and you sound like someone who has operated one; pretend a saga is "a distributed transaction" and you sound like someone who hasn't.</p>` });

  /* ---- 23 · partitioning & consistent hashing ---- */
  LESSONS.push({ eb: eb("scale"), title: "Partitioning & consistent hashing", html: `
    <p class="big">When the data outgrows one node, you <b class="hl">partition by key</b>: every key gets exactly one owner, and any node can compute who that owner is. The naive scheme — <code>hash(key) % N</code> — works beautifully until the moment N changes: add or remove one node and <b class="hl">nearly every key's modulus changes</b>, so nearly every key migrates at once. A membership change becomes a cluster-wide reshuffle.</p>
    <p>The <b class="hl">ring</b> fixes the blast radius. Hash both nodes and keys onto a circle; each node owns the arc that ends at its point; a key belongs to the <b class="hl">first node point clockwise</b> from the key's hash. Now membership changes are local: a node leaving hands only <i>its own arcs</i> to its clockwise successors — about K/N keys move, not K.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the ring &middot; a key walks clockwise &middot; its owner leaves</div>
      <svg class="estage" viewBox="0 0 340 170" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <circle cx="170" cy="85" r="58" fill="none" stroke="#2c3350" stroke-width="1.5"/>
        <circle cx="170" cy="27" r="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="170" y="16" fill="#57e0b0" font-size="8" text-anchor="middle">n1</text>
        <circle cx="228" cy="85" r="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="246" y="88" fill="#57e0b0" font-size="8" text-anchor="start">n2</text>
        <circle cx="228" cy="85" r="11" fill="none" stroke="#ff9a6b" stroke-width="1.5" stroke-dasharray="3 3" opacity="0">
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.46;0.5;1" values="0;0;1;1"/></circle>
        <circle cx="170" cy="143" r="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="170" y="161" fill="#57e0b0" font-size="8" text-anchor="middle">n3</text>
        <circle cx="112" cy="85" r="7" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="94" y="88" fill="#57e0b0" font-size="8" text-anchor="end">n4</text>
        <circle cx="211" cy="44" r="3" fill="none" stroke="#8e86f0" stroke-width="1.2"/>
        <text x="222" y="36" fill="#8b90ab" font-size="8" text-anchor="start">key K hashes here</text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.12;0.3;0.5;0.7;1" keyPoints="0;0;0.33;0.33;1;1"
            path="M 211 44 A 58 58 0 0 1 228 85 A 58 58 0 0 1 170 143"/>
        </circle>
        <text x="262" y="104" fill="#57e0b0" font-size="8" text-anchor="middle" opacity="0">owner: n2 ✓
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.3;0.34;0.46;0.5;1" values="0;0;1;1;0;0"/></text>
        <text x="262" y="104" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">n2 leaves ✗
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.46;0.5;1" values="0;0;1;1"/></text>
        <text x="230" y="146" fill="#57e0b0" font-size="8" text-anchor="start" opacity="0">new owner: n3 ✓
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;1" values="0;0;1;1"/></text>
        <text x="52" y="52" fill="#6a7090" font-size="8" text-anchor="middle">only n2's arc
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;1" values="0;0;1;1"/></text>
        <text x="52" y="63" fill="#6a7090" font-size="8" text-anchor="middle">reassigns — the
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;1" values="0;0;1;1"/></text>
        <text x="52" y="74" fill="#6a7090" font-size="8" text-anchor="middle">rest never move
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.7;0.74;1" values="0;0;1;1"/></text>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">hash % N</div><div class="lstep bad seq" style="--i:0">N: 4 &rarr; 3 &hellip; almost EVERY key changes owner &mdash; mass migration</div>
        <div class="lanehead seq" style="--i:1">the ring</div><div class="lstep good seq pop" style="--i:1">n2 leaves &hellip; only n2's ~K/N keys move, to its clockwise neighbors</div>
      </div>
      <div class="dnote seq" style="--i:2">Placement survives membership change because a key's position never depends on <b style="color:var(--ordered)">how many</b> nodes exist &mdash; only on what's clockwise of it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two refinements make the ring production-grade. <b class="hl">Virtual nodes</b>: hash each physical node onto the ring at many points, so arcs are small and numerous — a leaving node's load sprinkles across everyone instead of dumping onto one unlucky successor, and unequal machines can carry unequal vnode counts. And know the ring's blind spot: it balances <b class="hl">keys</b>, not <b class="hl">load</b>. One celebrity key — one hot tenant, one viral post — can melt its owner while the ring reports perfect balance. The fixes are key-level: split the hot key with a shard suffix, cache it in front, or isolate the tenant.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; first point clockwise, wrap at the top</div>
      <pre class="code">class HashRing {
  #ring = [];                                    <span class="cm">// sorted [{h, node}] — vnodes per node</span>
  add(node) {
    for (let i = 0; i &lt; this.vnodes; i++)
      this.#ring.push({ h: hash(node + "#" + i), node });
    this.#ring.sort((a, b) =&gt; a.h - b.h);
  }
  owner(key) {
    const h = hash(key);
    <span class="ok">for (const e of this.#ring) if (e.h &gt;= h) return e.node;</span>  <span class="cm">// first point clockwise</span>
    return this.#ring[0].node;                   <span class="cm">// past twelve o'clock — wrap around</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the placement function inside Dynamo-style databases, distributed caches, and most sharded queues — and it's a favorite whiteboard question because it packs three judgments into one design: why modulo fails, why the ring bounds migration, and why even a perfect ring can't save you from a hot key. Answer all three unprompted and the interview changes tone.</p>` });

  /* ---- 24 · retries, backoff & jitter ---- */
  LESSONS.push({ eb: eb("scale"), title: "Retries, backoff & jitter", html: `
    <p class="big">Say the uncomfortable part first: <b class="hl">a retry is load you add during a failure.</b> The dependency is at its weakest, and your response is to send more traffic. Retries are still right — transient failures are real — but only when engineered to not become the second wave of the outage.</p>
    <p>The failure mode has a name: the <b class="hl">retry storm</b>. A dependency blips, and N clients all see the failure <i>at the same instant</i>. Naive clients retry after the same fixed delay — so the fleet re-arrives as one synchronized spike, exactly N requests tall, on a service mid-recovery. It buckles; everyone fails together again; the wave repeats, now with interest.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">10,000 clients fail together &middot; two very different retry schedules</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">t=0</div><div class="lstep bad seq" style="--i:0">dependency hiccups &mdash; 10,000 requests fail in the same instant</div>
        <div class="lanehead seq" style="--i:1">no jitter</div><div class="lstep bad seq" style="--i:1">all sleep exactly 8ms &rarr; 10,000 arrive in ONE millisecond &nbsp;&#9612;&#9608;&#9612;</div>
        <div class="lanehead seq" style="--i:2">again</div><div class="lstep bad seq" style="--i:2">all fail together &rarr; all sleep 16ms &rarr; the spike repeats, synchronized forever</div>
        <div class="lanehead seq" style="--i:3">full jitter</div><div class="lstep good seq pop" style="--i:3">each sleeps random(0, 8ms) &rarr; arrivals smear across the window &nbsp;&#9601;&#9602;&#9601;&#9602;&#9601;&#9602;&#9601;&#9602;</div>
      </div>
      <div class="dnote seq" style="--i:4">Backoff spreads <b style="color:var(--ordered)">one client over time</b>; jitter spreads <b style="color:var(--ordered)">the fleet apart</b>. You need both — exponential backoff alone keeps the herd perfectly synchronized, just less often.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p><b class="hl">Full jitter</b> is the strong form: sleep a uniform random duration in [0, ceiling), where the ceiling doubles per attempt (capped). The exponential ceiling bounds total patience; the randomness decorrelates every client from every other. A &plusmn;10ms wobble on a multi-second wait decorrelates nothing — the randomness must span the whole window.</p>
    <p>Two more guards make retries adult-grade. A <b class="hl">retry budget</b>: bound attempts (and ideally the fleet-wide retry fraction), because a dependency that's <i>down</i> converts unlimited retries into a self-inflicted DDoS. And <b class="hl">only retry retriable errors</b>: a 503 deserves another try; a 400 will fail identically forever; and a non-idempotent operation — a charge, a send — must never be retried without an idempotency key (lesson 13), because "again" without dedupe is "twice".</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the jitter line is the whole point</div>
      <pre class="code">async function retryBackoff(fn, { tries, base, cap, jitter, wait, random }) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (err) {
      if (++attempt &gt;= tries) throw err;              <span class="cm">// the budget — then fail loudly</span>
      const ceiling = Math.min(cap, base * 2 ** (attempt - 1));  <span class="cm">// exponential, capped</span>
      <span class="ok">await wait(jitter ? Math.floor(random() * ceiling) : ceiling);</span> <span class="cm">// full jitter: uniform in [0, ceiling)</span>
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> retry policy is fleet behavior, not a local convenience — the client-side line you write becomes server-side load multiplied by every caller that copied it. The AWS incident literature is full of outages extended by their own clients' synchronized retries. "Exponential backoff with full jitter, a retry budget, retriable errors only" is one sentence, and it's the difference between a blip and a story.</p>` });

  /* ---- 25 · circuit breakers, bulkheads & hedging ---- */
  LESSONS.push({ eb: eb("scale"), title: "Circuit breakers, bulkheads & hedging", html: `
    <p class="big">Three isolation patterns keep one sick dependency from taking your whole service down with it: the <b class="hl">circuit breaker</b> stops you hammering what's already drowning, the <b class="hl">bulkhead</b> stops a slow dependency from eating every thread, and <b class="hl">hedging</b> clips the latency tail without doubling your load.</p>
    <p>The breaker is a tiny state machine. <b class="hl">Closed</b>: traffic flows, failures counted. Hit the threshold &rarr; <b class="hl">open</b>: every call fails instantly, no network touched — the dependency gets silence in which to recover, and your callers get a fast "no" instead of a slow timeout. After a cooldown &rarr; <b class="hl">half-open</b>: exactly one probe goes through. Success closes the breaker; failure re-opens it and the cooldown restarts.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the breaker state machine &middot; one full lap</div>
      <svg class="estage" viewBox="0 0 340 175" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="20" y="30" width="86" height="34" rx="9" fill="#11131c" stroke="#57e0b0" stroke-width="1.5"/>
        <text x="63" y="51" fill="#57e0b0" font-size="9" text-anchor="middle">CLOSED</text>
        <rect x="234" y="30" width="86" height="34" rx="9" fill="#11131c" stroke="#ff9a6b" stroke-width="1.5"/>
        <text x="277" y="51" fill="#ff9a6b" font-size="9" text-anchor="middle">OPEN</text>
        <rect x="122" y="120" width="100" height="34" rx="9" fill="#11131c" stroke="#8e86f0" stroke-width="1.5"/>
        <text x="172" y="141" fill="#8e86f0" font-size="9" text-anchor="middle">HALF-OPEN</text>
        <line x1="106" y1="47" x2="234" y2="47" stroke="#2c3350" stroke-width="1.2"/>
        <text x="170" y="40" fill="#8b90ab" font-size="8" text-anchor="middle">failures hit threshold</text>
        <line x1="250" y1="64" x2="196" y2="120" stroke="#2c3350" stroke-width="1.2"/>
        <text x="258" y="98" fill="#8b90ab" font-size="8" text-anchor="start">cooldown ends</text>
        <line x1="140" y1="120" x2="80" y2="64" stroke="#2c3350" stroke-width="1.2"/>
        <text x="82" y="98" fill="#8b90ab" font-size="8" text-anchor="end">probe succeeds</text>
        <text x="277" y="76" fill="#6a7090" font-size="7" text-anchor="middle">probe fails &rarr; re-opens</text>
        <circle r="6" fill="#8e86f0" stroke="#11131c" stroke-width="1.5">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.12;0.3;0.46;0.6;0.74;0.92;1" keyPoints="0;0;0.434;0.434;0.714;0.714;1;1"
            path="M 63 47 L 277 47 L 172 137 L 63 47"/>
        </circle>
        <text x="170" y="170" fill="#57e0b0" font-size="8" text-anchor="middle">traffic flows &middot; failures counted
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.12;0.3;0.34;1" values="1;1;1;0;0"/></text>
        <text x="170" y="170" fill="#ff9a6b" font-size="8" text-anchor="middle" opacity="0">every call fast-fails &middot; the dependency gets silence
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.34;0.38;0.6;0.64;1" values="0;0;1;1;0;0"/></text>
        <text x="170" y="170" fill="#8e86f0" font-size="8" text-anchor="middle" opacity="0">ONE probe asks — the crowd waits
          <animate attributeName="opacity" dur="6s" repeatCount="indefinite" keyTimes="0;0.64;0.68;0.92;0.96;1" values="0;0;1;1;0;0"/></text>
      </svg>
      <div class="dnote seq" style="--i:0">Half-open is the clever state: recovery gets discovered by <b style="color:var(--ordered)">one careful probe</b>, not rediscovered by 100% of traffic slamming a service that's barely back on its feet.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The <b class="hl">bulkhead</b> handles the failure the breaker can't: a dependency that's <i>slow</i>, not failing. Without one, every caller piles up waiting on it until your whole thread pool — including the parts serving healthy traffic — is parked behind one sick service. The fix is a per-dependency concurrency cap plus a tiny bounded queue: a burst gets absorbed, anything past it is rejected instantly, and the slow dependency drowns alone in its own compartment.</p>
    <p><b class="hl">Hedging</b> attacks the tail from the other side: most requests take 8ms, the p99 takes 300ms. Fire a backup request only after ~p95 of silence — the fastest answer wins, the loser is discarded. Only the slowest ~5% of requests ever pay for a second attempt, so the tail collapses without doubling fleet load — which is exactly what hedging immediately on every request would do.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the open branch: fast-fail, then one probe</div>
      <pre class="code">async call(fn) {
  if (this.#state === "open") {
    <span class="ok">if (this.now() - this.#openedAt &lt; this.cooldown)
      throw new Error("open — fast fail");</span>         <span class="cm">// don't even dial the number</span>
    this.#state = "half-open";                       <span class="cm">// cooldown over: let ONE probe through</span>
  }
  try { const v = await fn();
        this.#state = "closed"; this.#fails = 0; return v; }
  catch (err) {
    this.#fails++;
    if (this.#state === "half-open" || this.#fails &gt;= this.threshold) {
      this.#state = "open"; this.#openedAt = this.now();
    }
    throw err;
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> these three are the standard kit for "how do you stop a failure from cascading?" — and the senior detail is knowing which failure each one owns. Breaker: a dependency that's <b class="hl">failing</b>. Bulkhead: one that's <b class="hl">slow</b>. Hedging: one that's <b class="hl">occasionally slow</b>. Name the pattern <i>and</i> its trigger, and you've demonstrated you've been paged for all three.</p>` });

  /* ---- 26 · timeout budgets & deadline propagation ---- */
  LESSONS.push({ eb: eb("scale"), title: "Timeout budgets & deadline propagation", html: `
    <p class="big">A request's deadline is set <b class="hl">once, at the edge</b> — "this page has 50ms" — and it must <b class="hl">travel with the request</b>. Every hop offers its downstream call <code>min(own default, remaining budget)</code>. Every hop that instead uses its own fresh timeout is quietly promising time that no longer exists.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">50ms budget &middot; edge &rarr; A &rarr; B &middot; watch the remainder shrink</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">edge</div><div class="lstep seq" style="--i:0">stamps the deadline: <b>50ms</b> budget &mdash; set once, carried on the request</div>
        <div class="lanehead seq" style="--i:1">A</div><div class="lstep seq" style="--i:1">spends 35ms &rarr; <b>15ms</b> remain &rarr; offers B min(40 default, 15) = <b>15ms</b></div>
        <div class="lanehead seq" style="--i:2">B</div><div class="lstep good seq pop" style="--i:2">gets 15ms &mdash; the caller's patience, inherited &nbsp;&#10003;</div>
        <div class="lanehead seq" style="--i:3">naive B</div><div class="lstep bad seq" style="--i:3">uses its 40ms default &rarr; still working <b>25ms after the caller gave up</b> &#10007;</div>
        <div class="lanehead seq" style="--i:4">t=50</div><div class="lstep wait seq" style="--i:4">edge answers (an error) &middot; naive B still burns threads, connections, DB time&hellip;</div>
      </div>
      <div class="dnote seq" style="--i:5">Work whose caller is gone is <b style="color:var(--race)">orphaned work</b> &mdash; it consumes real capacity and can help nobody. Now multiply by retries at every layer: 3 edge tries &times; 3 A tries = up to 9 executions of B for one dead page.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The budget's best moment is <b class="hl">before</b> the call: if the remaining budget is already zero, don't dial at all — throw <i>deadline exceeded</i> as a first-class fast failure. That check costs nothing, sheds load exactly when the system is slowest, and turns "we timed out somewhere downstream after burning four hops of capacity" into an instant, attributable answer at the first hop that couldn't afford the trip.</p>
    <p>This is why RPC frameworks (gRPC most visibly) carry the deadline in <b class="hl">request metadata</b> rather than leaving timeouts to each client's config: propagation only works if the number crosses process boundaries. Deep call trees without it develop a signature pathology — inner services report healthy latencies while serving answers <b class="hl">nobody is waiting for</b>, and the capacity they burn belongs to live requests.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; offer the remainder, refuse the impossible</div>
      <pre class="code">async function callWithDeadline(deadline, defaultTimeout, work) {
  <span class="ok">const allow = Math.min(defaultTimeout, deadline.remaining());</span>  <span class="cm">// the REMAINING budget, never more</span>
  if (allow &lt;= 0) throw new Error("deadline exceeded before the call");  <span class="cm">// fast failure — zero work wasted</span>
  const r = await Promise.race([
    work(allow),                                   <span class="cm">// downstream inherits the allowance</span>
    sleep(allow).then(() =&gt; ({ timedOut: true })),
  ]);
  if (r &amp;&amp; r.timedOut) throw new Error("deadline exceeded");
  return r;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> timeout budgets are the pattern that makes every other resilience pattern honest. Retries respect the budget or they multiply orphaned work; hedges respect it or the backup outlives the caller; breakers trip faster because failures surface at the first unaffordable hop. One number, stamped at the edge and shrinking at every hop — that's the entire design, and it's the last invariant of this course worth saying in every review: <b class="hl">never promise time you don't have.</b></p>` });

})();
