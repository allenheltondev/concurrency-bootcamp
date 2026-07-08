"use strict";
/* Concurrency Bootcamp — content pack: the Temporal map.
   Loaded after content.js, before app.js (same shared-global model as a
   classic <script> tag). Registers:
     1. a "temporal map" sheet module (interview bridge lines)
     2. one lesson: testing concurrency without flakes
     3. four flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  /* =========================================================
     1. THE TEMPORAL MAP  — a static "sheet" module
        concept -> Temporal construct -> a line to SAY out loud
     ========================================================= */
  const mapHtml = `
    <p class="big">Every primitive you drilled has a <b class="hl">durable twin</b> in Temporal. When the interviewer asks a generic concurrency question, answer it — then say the bridge line. That's the move: show you know the pattern, then show you know its durable version.</p>

    <div class="impl">
      <div class="dlabel">mutex / critical section per entity &rarr; one workflow per business key</div>
      <p>In plain JS I'd wrap the read-modify-write in a mutex. In Temporal I don't need one: I run <b class="hl">one workflow instance per business key</b> — the order ID, the account ID — as the workflow ID, so exactly one exists. The workflow is single-threaded and its signal handlers execute serially, so the workflow instance <b class="hl">is</b> the lock. "Concurrency against one entity" becomes "route it to that entity's workflow."</p>
    </div>

    <div class="impl">
      <div class="dlabel">producer / consumer queue &rarr; buffered signals + condition()</div>
      <p>My async queue parks a consumer until a producer pushes. In Temporal the producers send <b class="hl">signals</b>; the handler appends them to workflow state and the body waits on <code>condition(() =&gt; queue.length &gt; 0)</code> — the same park-until-there's-work. When the backlog grows I <code>continueAsNew</code> before history runs unbounded; that bounding <b class="hl">is</b> the backpressure.</p>
    </div>

    <div class="impl">
      <div class="dlabel">condition variable &rarr; workflow.condition(pred, timeout)</div>
      <p>This app's makeCondition is "park until a predicate flips true, re-checking in a loop." Temporal's <code>condition(predicate, timeout)</code> is the exact same shape — and it takes a durable timeout, so "wait until approved, but give up after 3 days" is one line, and the 3 days survives a crash.</p>
    </div>

    <div class="impl">
      <div class="dlabel">setTimeout / sleep &rarr; durable timers (workflow.sleep)</div>
      <p>A <code>setTimeout</code> dies with the process. <code>workflow.sleep('15m')</code> is a <b class="hl">durable timer</b>: it's an entry in the event history, so the worker can crash mid-sleep and on replay the timer fires from history, on schedule. Same "wait N then continue," but it outlives the process that started it.</p>
    </div>

    <div class="impl">
      <div class="dlabel">retry with backoff &rarr; activity RetryPolicy</div>
      <p>My hand-written retry-with-exponential-backoff loop is just configuration here: an activity's <code>RetryPolicy</code> — <code>initialInterval</code>, <code>backoffCoefficient</code>, <code>maximumAttempts</code>. I'm declaring the loop I'd otherwise write, and the engine runs it durably across worker restarts instead of in a local <code>for</code>.</p>
    </div>

    <div class="impl">
      <div class="dlabel">idempotency &rarr; at-least-once activity execution</div>
      <p>Activities are <b class="hl">at-least-once</b>: one that ran but whose completion wasn't recorded before a crash <b class="hl">will</b> run again. So I make the side effect idempotent — dedupe on a stable idempotency key like <code>charge-{orderId}</code>, the same key I'd use to make a plain HTTP retry safe. "It might run twice" is the contract, not a bug.</p>
    </div>

    <div class="impl">
      <div class="dlabel">run-once / memoize &rarr; replay determinism (recorded values)</div>
      <p>Memoize computes once and reuses. Replay needs the same discipline: a nondeterministic value — a UUID, the clock — is <b class="hl">recorded once</b> on the first run and replayed verbatim after, so the code takes the same branch every time. Compute-once here isn't an optimization; it's what stops replay diverging from history.</p>
    </div>

    <div class="impl">
      <div class="dlabel">errgroup / structured concurrency &rarr; child workflows + Promise.all</div>
      <p>Fan out, wait for all, cancel the rest on first failure — that's errgroup. Inside a workflow I write <code>await Promise.all([executeChild(a), executeChild(b)])</code> and it just works, because the SDK's scheduler is deterministic: <code>Promise.all</code> and <code>Promise.race</code> are replay-safe inside workflow code, so the combinators I already know carry straight over.</p>
    </div>

    <div class="impl">
      <div class="dlabel">bounded queue / capping growth &rarr; continue-as-new</div>
      <p>Bounding a queue is "don't let this grow without limit." A long-lived workflow has the same failure mode from the other side — event history grows on every event, and replay cost grows with it. <code>continueAsNew</code> restarts the workflow with carried-forward state and an <b class="hl">empty</b> history. Same instinct as capping the queue, applied to the log.</p>
    </div>

    <div class="impl">
      <div class="dlabel">worker pool / bounded concurrency &rarr; task queues + worker slots</div>
      <p>My concurrency pool caps in-flight work at N. Temporal caps it at the worker: pollers pull from a <b class="hl">task queue</b>, and each worker has a bounded number of execution slots (the activity-slot limit, <code>maxConcurrentActivityTaskExecutions</code>). Backpressure is built in — when every slot is busy, tasks wait on the queue instead of overrunning the process.</p>
    </div>

    <div class="impl">
      <div class="dlabel">watchdog / liveness &rarr; activity heartbeats</div>
      <p>For long work I'd add a watchdog to tell "still alive" from "hung." Temporal's version is the <b class="hl">heartbeat</b>: a long activity heartbeats periodically, and a heartbeat timeout fails it fast when it goes silent. Better still, heartbeat <i>details</i> are recorded, so a retry can resume from the last checkpoint instead of starting over.</p>
    </div>

    <div class="impl">
      <div class="dlabel">timeout / cancel-the-loser &rarr; cancellation propagation</div>
      <p>My withTimeoutCancel races work against a timer and aborts the loser through an AbortSignal. Temporal propagates cancellation the same way: cancelling the workflow (or a CancellationScope) cancels its activities, and a running activity <b class="hl">observes</b> that cancellation via its heartbeat and cleans up. It's cooperative — cancellation is a channel the work has to check, exactly like AbortSignal.</p>
    </div>

    <div class="qbox" style="margin-top:18px">
      <div class="dlabel">say this out loud</div>
      <p>Temporal is a <b class="hl">deterministic, single-threaded event loop whose timers, queues, and locks are durable</b>. Every primitive in this app has a durable twin — the mutex is a workflow ID, the condition variable is <code>condition()</code>, <code>setTimeout</code> is a durable timer, the retry loop is a RetryPolicy, the bounded queue is <code>continueAsNew</code>. I'm not learning a new concurrency model; I'm learning the durable version of the one I already know.</p>
    </div>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "temporalmap",
    label: "temporal map",
    type: "sheet",
    eyebrow: "reference · interview bridge",
    title: "The Temporal map",
    lead: "Twelve concurrency concepts, each mapped to its Temporal construct and the one sentence that bridges your generic answer to their model. Say the pattern, then say the bridge line.",
    html: mapHtml,
  });

  /* =========================================================
     2. LESSON — testing concurrency without flakes
        cites the app's own WRITE tests (real examples)
     ========================================================= */
  LESSONS.push({
    eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · testing races`,
    title: "Testing concurrency without flakes",
    html: `
    <p class="big">A concurrency test that "passes most of the time" tests nothing. The fix is to take <b class="hl">timing out of the test</b> — script the <i>when</i> of every async event instead of racing the wall clock. Five techniques, each already used by the drills in this app.</p>

    <p>The enemy is the same everywhere: your assertions run at a moment decided by <code>setTimeout</code> and the scheduler, not by you. Every technique below is a way to seize that moment back.</p>

    <div class="impl">
      <div class="dlabel">1 · gate promises &mdash; control every deferred</div>
      <p>Hand the test the <code>resolve</code>. Now the "when" of each async event is <b class="hl">script-controlled</b>, not timing-controlled. The in-flight-dedup exercise does exactly this with a <code>gates</code> object:</p>
      <pre class="code">const gates = {};
const fetcher = (key) =&gt; { gates[key] = deferred(); return gates[key].promise; };
const get = dedupe(fetcher);
const p1 = get("a"), p2 = get("a");   <span class="cm">// both in flight</span>
assert(p1 === p2);                    <span class="cm">// shared — zero timing involved</span>
gates.a.resolve("A1");                <span class="cm">// the TEST decides when it settles</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">2 · peak-in-flight counters &mdash; assert the invariant</div>
      <p>Don't eyeball timing to check "at most 2 ran at once." Wrap the work, track the peak, and assert it. The concurrency-pool exercise pins the limit this way:</p>
      <pre class="code">let running = 0, peak = 0;
const fn = async (x) =&gt; {
  running++; peak = Math.max(peak, running);   <span class="cm">// wrap the work</span>
  await sleep(10);
  running--;
  return x * 2;
};
await mapPool([1,2,3,4,5], 2, fn);
assert(peak === 2);   <span class="cm">// the invariant, not a timing guess</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">3 · flush points &mdash; drain microtasks before you assert</div>
      <p>To check an intermediate state you must first let the queued continuations run. <code>await null</code> (or <code>sleep(0)</code>) drains the microtask queue deterministically. The mutex barge test flushes before checking that a direct hand-off left no gap for a newcomer:</p>
      <pre class="code">await m2.acquire();          <span class="cm">// hold the lock</span>
const parked = enter();      <span class="cm">// this call parks on the queue</span>
m2.release();                <span class="cm">// must hand off DIRECTLY...</span>
const barger = enter();      <span class="cm">// ...so this newcomer must queue</span>
await sleep(10);             <span class="cm">// flush: let every continuation settle</span>
assert(holders === 1);       <span class="cm">// exactly one holder — no barge</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">4 · timeout-as-deadlock-detector &mdash; a hung test is a finding</div>
      <p>A test that <i>can</i> hang must race a deadline whose failure names the cause. The async-queue exercise proves an empty <code>pop()</code> parks by racing it against a timer:</p>
      <pre class="code">const r = await Promise.race([
  q.pop(),
  sleep(15).then(() =&gt; "still-waiting"),
]);
assert(r === "still-waiting");   <span class="cm">// it parked, as intended</span></pre>
      <p>The write-it sandbox does this at the harness level: it kills any build after 3s with <i>"a deadlock, an unreleased lock, or an infinite loop is the usual suspect."</i> A hung run is a <b class="hl">finding</b>, not a flake to retry.</p>
    </div>

    <div class="impl">
      <div class="dlabel">5 · make the race a parameter &mdash; construct the ordering</div>
      <p>If a bug needs ordering X, build X explicitly. Don't run 1000 iterations hoping to hit it. The dedup test settles keys in a scripted order to prove per-key eviction:</p>
      <pre class="code">gates.a.resolve("A1");   <span class="cm">// settle A first...</span>
await sleep(1);          <span class="cm">// ...flush...</span>
get("a");                <span class="cm">// ...now prove the entry was evicted</span>
assert(launches.a === 2);   <span class="cm">// the ORDER is the test, not luck</span></pre>
    </div>

    <p><b class="hl">The ecosystem version:</b> fake timers (Jest/Sinon <code>useFakeTimers</code>) are technique 1 applied to the clock — you advance time by hand, so a "wait 15 minutes" path tests in microseconds and never flakes on a slow machine.</p>

    <p><b class="hl">The rule:</b> a flaky concurrency test is a real bug — in the test's timing assumptions, or in the code it exercises. There is no third option called "retry it until it's green." Retrying a flake into a pass hides exactly the kind of race you're being paid to find.</p>`,
  });

  /* =========================================================
     3. CARDS — four new flashcards (checked against existing
        durable/Temporal cards to avoid duplicates)
     ========================================================= */
  CARDS.push(
    ["Your generic mutex answer — how do you bridge it to Temporal?",
     "Run one workflow instance per business key (the workflow ID). A workflow is single-threaded and its signal handlers execute serially, so there's no mid-statement preemption against that entity — the workflow instance IS the lock. You don't add a mutex; you route all work for an entity to its one workflow."],
    ["What's actually durable about a durable timer?",
     "It isn't an in-memory setTimeout — it's an event in the workflow's history. sleep('15m') can outlive the worker: if the process dies mid-sleep, replay reads the timer from history on restart and the workflow wakes on the original schedule. The wait survives the death of the thing that started it."],
    ["An activity ran twice — whose bug is that?",
     "Usually nobody's: at-least-once execution is the contract. An activity that completed but crashed before its result was recorded WILL run again. It's only YOUR bug if the activity isn't idempotent — so dedupe on a stable idempotency key and a re-run is a no-op, not a double charge."],
    ["A concurrency test is flaky — what are the only two possibilities?",
     "Either the test is timing-dependent (fix: gate the async events so ordering is scripted, not raced), or the code has a real race the flake is surfacing. There is no third option. 'Retry it until green' is not a fix — it hides the exact bug you're meant to catch."],
  );

})();
