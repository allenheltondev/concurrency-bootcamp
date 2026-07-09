"use strict";
/* Distributed Systems Bootcamp — content pack: the cloud map.
   Loaded after content.js and the lesson packs, before the engine (same
   shared-global model as a classic <script> tag). Registers:
     1. a "cloud map" sheet module — every concept in this course mapped to
        the managed-cloud construct that embodies it, with a bridge line to
        SAY out loud in an interview
     2. one lesson: testing distributed systems without flakes
     3. four flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  /* =========================================================
     1. THE CLOUD MAP — a static "sheet" module
        concept -> managed construct -> a line to SAY out loud
     ========================================================= */
  const mapHtml = `
    <p class="big">Every primitive you drilled has a <b class="hl">managed twin</b> in the cloud. When the interviewer asks the theory question, answer it — then say the bridge line. That's the move: show you know the pattern, then show you know which service is quietly running it for you.</p>

    <div class="impl">
      <div class="dlabel">at-least-once + idempotent consumer &rarr; SQS &plus; a dedupe table</div>
      <p>SQS standard queues are openly <b class="hl">at-least-once</b> — a consumer that crashes after processing but before deleting gets the message again. So my handler dedupes on an idempotency key with a <b class="hl">conditional write</b> (attribute_not_exists) before the side effect — exactly the check-record-apply drill. FIFO queues add 5-minute deduplication ids, but the consumer-side key is what makes it safe at any horizon.</p>
    </div>

    <div class="impl">
      <div class="dlabel">transactional outbox &rarr; DynamoDB Streams / CDC</div>
      <p>The outbox pattern needs a relay that publishes what the transaction committed. A DynamoDB Stream (or Postgres logical decoding) <b class="hl">is that relay, managed</b>: the write commits once, and the change record is emitted from the storage engine's own log — no dual write, no ghost events. I don't publish events; I let the database's history publish them.</p>
    </div>

    <div class="impl">
      <div class="dlabel">fencing token &rarr; conditional writes / version attributes</div>
      <p>My FencedStore compares a monotonic token and rejects the past. DynamoDB's <code>ConditionExpression</code> is that compare-and-reject at the item level: <code>version = :expected</code> on every update. A zombie writer carrying stale state fails its condition instead of clobbering — optimistic concurrency is fencing wearing a different name.</p>
    </div>

    <div class="impl">
      <div class="dlabel">lease + election &rarr; a lock item with a TTL and a monotonic counter</div>
      <p>The classic DynamoDB lock client is this course's LeaseServer verbatim: acquire = conditional put if the lease is absent or expired; the record carries a <b class="hl">fencing counter</b> the winner presents downstream. One workflow instance per business key (a Step Functions execution named by the order id) is the same idea one level up — the execution ID is the lock.</p>
    </div>

    <div class="impl">
      <div class="dlabel">total order per key &rarr; partition/message-group keys</div>
      <p>Global total order is the most expensive ask in the field — so managed streams sell the cheap rung of the ladder: <b class="hl">order within a partition key</b>. A Kinesis/Kafka partition or an SQS FIFO message group serializes one entity's events and lets different entities run in parallel. Choosing the partition key IS choosing the ordering scope.</p>
    </div>

    <div class="impl">
      <div class="dlabel">quorum replication &rarr; the storage tier you don't see</div>
      <p>Aurora commits when <b class="hl">4 of 6</b> storage nodes across three AZs ack — R+W&gt;N with N=6, W=4, R=3. DynamoDB acks writes at a majority of replicas. The quorum math didn't disappear when I went managed; it moved below the API, and it's why a single AZ failure doesn't lose acknowledged writes.</p>
    </div>

    <div class="impl">
      <div class="dlabel">LWW and its skew problem &rarr; global tables' honest fine print</div>
      <p>DynamoDB global tables resolve concurrent cross-region writes with <b class="hl">last-writer-wins</b> — the lesson-3 hazard, shipped at planet scale. That's the right trade for most workloads, and the fine print I say out loud: concurrent writes to the same item in two regions will silently drop one. If both edits must survive, I need my own merge (or a single writer region per key).</p>
    </div>

    <div class="impl">
      <div class="dlabel">saga &rarr; Step Functions with compensation states</div>
      <p>A Step Functions workflow with <code>Catch</code> branches routing to compensation states is the saga runner: each state commits locally, and on failure the machine walks the undo path — in reverse — durably, surviving worker crashes mid-saga. The state machine definition makes the compensation design <b class="hl">reviewable</b>, which is half the battle.</p>
    </div>

    <div class="impl">
      <div class="dlabel">2PC, scoped down &rarr; DynamoDB transactions</div>
      <p><code>TransactWriteItems</code> gives me all-or-nothing across 100 items — atomic commit inside ONE trust domain with short lock hold times, which is exactly where 2PC belongs. Across services, I don't reach for it; I reach for the saga. Same answer as the drill: unanimity inside the wall, compensation across it.</p>
    </div>

    <div class="impl">
      <div class="dlabel">backoff + jitter &rarr; the SDK's retry policy</div>
      <p>Every AWS SDK ships exponential backoff with <b class="hl">full jitter</b> on by default (the formula from the AWS Architecture blog that popularized it), plus adaptive client-side rate limiting. My job is the parts it can't know: cap TOTAL attempts across layers so gateway-retries-times-SDK-retries doesn't multiply, and never retry a non-idempotent call without a key.</p>
    </div>

    <div class="impl">
      <div class="dlabel">poison messages &rarr; DLQ + redrive</div>
      <p>SQS's <code>maxReceiveCount</code> + dead-letter queue is the drill's catch block, managed: bounded retries, then park it where a human can inspect and <b class="hl">redrive</b> after the fix. Lambda event source mappings add bisect-on-error for batches — the same instinct, applied to finding the poison record inside a batch.</p>
    </div>

    <div class="impl">
      <div class="dlabel">backpressure &rarr; bounded buffers you configure, lag you alarm on</div>
      <p>Managed queues are effectively unbounded, so the discipline moves to the edges: reserved concurrency caps the consumer, API throttling pushes back at the front door, and <b class="hl">queue depth / iterator age</b> is the health metric that says the debt is growing. An unbounded backlog isn't resilience — it's an outage on layaway.</p>
    </div>

    <div class="impl">
      <div class="dlabel">heartbeats, gossip, membership &rarr; the provider's problem now</div>
      <p>I no longer run failure detectors for my database's nodes — the managed control plane gossips, suspects, fences, and fails over for me. What I still own is the <b class="hl">application-level</b> version of every one of those: timeouts and deadline budgets on my calls, circuit breakers on my dependencies, idempotency on my handlers. Managed services move the problems; they don't delete them.</p>
    </div>

    <div class="qbox" style="margin-top:18px">
      <div class="dlabel">say this out loud</div>
      <p>The cloud didn't repeal distributed systems — it <b class="hl">productized</b> them. Quorums became Aurora's 4-of-6, the outbox became a change stream, fencing became a condition expression, the saga became a state machine, and backoff-with-jitter became an SDK default. I'm not learning services; I'm recognizing the primitives inside them — and the failure modes each one still leaves on my side of the shared-responsibility line.</p>
    </div>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "cloudmap",
    label: "cloud map",
    type: "sheet",
    eyebrow: "reference · interview bridge",
    title: "The cloud map",
    lead: "Every concept in this course, mapped to the managed construct that embodies it — and the one sentence that bridges your theory answer to the service the interviewer's company actually runs.",
    html: mapHtml,
  });

  /* =========================================================
     2. LESSON — testing distributed systems without flakes
        cites this course's own drills and practice tests
     ========================================================= */
  LESSONS.push({
    eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · testing`,
    title: "Testing distributed systems without flakes",
    html: `
    <p class="big">A distributed-systems test that "passes most of the time" tests nothing. The fix is the same discipline this whole course runs on: <b class="hl">simulate the physics deterministically</b> — make time, loss, and ordering script-controlled instead of weather.</p>

    <p>The enemy: your assertions fire at a moment picked by real timers and a real network. Every technique below seizes one of those inputs back. All five are already in this app's own tests.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the same test &middot; two relationships with time</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">flaky</div><div class="lstep bad seq" style="--i:0">sleep(30) &hellip; hope the failover happened &hellip; assert &mdash; passes on your laptop, dies in CI</div>
        <div class="lanehead seq" style="--i:1">flaky</div><div class="lstep wait seq" style="--i:1">rerun &times; 3 until green &mdash; the race you were hunting is now hidden in the retry</div>
        <div class="lanehead seq" style="--i:2">scripted</div><div class="lstep good seq pop" style="--i:2">fd.status("n2", <b>60</b>) &mdash; the test SETS the clock; the timeline can't drift</div>
        <div class="lanehead seq" style="--i:3">scripted</div><div class="lstep good seq" style="--i:3">reps[1].up = false &mdash; the lost message is a fixture, not luck</div>
      </div>
      <div class="dnote seq" style="--i:4">Same assertions, opposite epistemics: one test <b style="color:var(--race)">samples</b> the race, the other <b style="color:var(--ordered)">constructs</b> it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>

    <div class="impl">
      <div class="dlabel">1 &middot; manual clocks &mdash; time is a parameter, not a fact</div>
      <p>The failure detector and the circuit breaker both take <code>now</code> as an argument. The test doesn't wait 30ms of wall time — it <b class="hl">sets</b> the clock:</p>
      <pre class="code">fd.beat("node-2", 0);
let status = fd.status("node-2", 20);   <span class="cm">// 20ms of silence — alive</span>
status = fd.status("node-2", 60);       <span class="cm">// 40ms of silence — suspect</span>
<span class="ok">// no sleep() anywhere: the timeline is scripted, so it can't flake</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">2 &middot; inject the randomness &mdash; jitter you can assert on</div>
      <p>retryBackoff takes <code>wait</code> and <code>random</code> as parameters. The test passes a recorder and a constant, then asserts the exact delays:</p>
      <pre class="code">const delays = [];
const wait = async (ms) =&gt; { delays.push(ms); };  <span class="cm">// records, never sleeps</span>
await retryBackoff(flaky, { base: 8, wait, jitter: true,
                            <span class="ok">random: () =&gt; 0.5</span> });
assert(delays.join(",") === "4,8");   <span class="cm">// exact, every run</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">3 &middot; script the network &mdash; loss is a fixture, not luck</div>
      <p>Don't run 1000 iterations hoping to hit the lost-ack path — build it. The quorum drills flip a replica's <code>up</code> flag at exactly the step under test:</p>
      <pre class="code">reps[1].up = false;               <span class="cm">// B misses the write — by design</span>
await store.put("cart", "v1");    <span class="cm">// acked by A + C (W=2)</span>
reps[1].up = true; reps[0].up = false;
const r = await store.get("cart");
assert(r.value === "v1");         <span class="cm">// the overlap MUST save the read</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">4 &middot; assert invariants, not timings</div>
      <p>"The zombie's write was rejected" and "only one concurrent duplicate applied" are <b class="hl">invariants</b> — true regardless of scheduling. The idempotency practice test races two deliveries and pins the count, not the order:</p>
      <pre class="code">const [a, b] = await Promise.all([
  c.handle({ id: "chg-2" }, apply),
  c.handle({ id: "chg-2" }, apply),   <span class="cm">// concurrent duplicate</span>
]);
<span class="ok">assert(c.applied === 1);</span>              <span class="cm">// the invariant, not a timing guess</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">5 &middot; timeout-as-hang-detector &mdash; a stuck cluster is a finding</div>
      <p>A test that <i>can</i> hang (a quorum that can't assemble, a saga that never compensates) must race a deadline whose failure names the cause. The write-it sandbox kills any build at 3s and says so; the practice harness does the same at 5s. A hung run is a <b class="hl">finding</b>, not a flake to retry.</p>
    </div>

    <p><b class="hl">The industrial version:</b> this is deterministic simulation testing — FoundationDB's simulator, Antithesis, Jepsen's fault schedules. One process pretends to be the whole cluster, the scheduler and network are seeded PRNGs, and a failing seed <b class="hl">replays exactly</b>. This course's simulated cluster is that idea at classroom scale.</p>

    <p><b class="hl">The rule:</b> a flaky distributed test is a real bug — in the test's control of time and loss, or in the code it exercises. There is no third option called "retry it until it's green." Retrying a flake into a pass hides exactly the class of failure you're being paid to find.</p>
    <p class="sub" style="margin-top:14px">That's the full map. Work back through the modules &mdash; tap a chip above to start drilling.</p>`,
  });
  LESSON_PRACTICE[LESSONS.length - 1] = { mod: "write" };

  /* =========================================================
     3. CARDS — four flashcards (checked against content.js's
        eighteen to avoid duplicates)
     ========================================================= */
  CARDS.push(
    ["A managed service is 'serverless and fault-tolerant.' What did you still not outsource?",
     "Everything above the API: your timeouts and deadline budgets, your retry policy and its idempotency, your circuit breakers, your saga compensations, your dedupe keys. The provider runs the quorums and the failure detectors — the application-level failure semantics are still yours."],
    ["Your integration test for the retry path passes 97% of runs. What's the senior read?",
     "That test is a coin, not a test. Either it doesn't control time/loss (inject the clock, the wait fn, and the failure — make the lost-ack path a fixture), or the 3% is a real race it keeps almost-catching. Fix the determinism first; if it still fails, you found a bug."],
    ["DynamoDB global tables are multi-region active-active. What's the fine print you say unprompted?",
     "Conflicts between regions resolve by last-writer-wins — concurrent writes to the same item and one edit is silently gone (lesson 3's skew hazard, managed). If both edits must survive: one writer region per key, or an application-level merge."],
    ["Interviewer: 'How would you get exactly-once processing with SQS + Lambda?'",
     "Rename it first: delivery is at-least-once, full stop — the goal is effectively-once EFFECTS. Consumer dedupes on a caller-chosen idempotency key with a conditional write BEFORE the side effect, handler stays idempotent for the crash-after-effect redelivery, and FIFO dedup ids only paper over a 5-minute window."],
  );

})();
