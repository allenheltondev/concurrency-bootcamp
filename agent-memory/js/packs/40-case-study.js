"use strict";
/* Agent Memory Bootcamp — content pack: the voice-memory case study.
   A real production system (a content-tracking platform's "voice" feature)
   that ships this course's whole evolution arc: saved posts become episodic
   vector memories, and every N new samples a reflection re-derives an
   aggregated per-platform voice profile that keeps evolving as posts come in.

   Loaded after content.js and the other packs, before the engine. Registers:
     1. one lesson (appended — index LESSONS.length): the case study
     2. one problem-bank drill + its demo: the reflect-once counter
     3. two quiz questions on the pipeline's failure modes
     4. four flashcards on its design decisions
   Cross-links are registered here (content.js only covers lessons 0-15). */
(function () {

  /* =========================================================
     1. THE LESSON — the pipeline, end to end
     ========================================================= */
  const caseLesson = LESSONS.length;   // final index of the lesson we append
  LESSONS.push({
    eb: `lesson ${String(LESSONS.length + 1).padStart(2, "0")} · case study`,
    title: "Case study: a voice that learns",
    html: `
    <p class="big">Everything in this course, shipped: a content platform where a creator's saved posts become <b class="hl">episodic memories</b>, and every few samples a <b class="hl">reflection</b> re-derives an aggregated per-platform <b class="hl">voice profile</b> — so the system's sense of "how this person writes" keeps evolving as posts come in.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the write path &middot; one saved post, stream-driven</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">save</div><div class="lstep seq" style="--i:0">a post is saved as an immutable <b>VoiceSample</b> row &mdash; the table's change stream does the rest</div>
        <div class="lanehead seq" style="--i:1">filter</div><div class="lstep seq" style="--i:1">the stream consumer only sees <code>entity = VoiceSample</code> &mdash; the profile rows it WRITES carry other entities, so its own output can never re-trigger it</div>
        <div class="lanehead seq" style="--i:2">embed</div><div class="lstep seq" style="--i:2">sample &rarr; vector, upserted under the deterministic key <code>tenant#platform#sampleId</code> &mdash; a retry overwrites in place</div>
        <div class="lanehead seq" style="--i:3">count</div><div class="lstep good seq pop" style="--i:3">one TRANSACTION: mark the sample (if not already marked) + increment <code>samplesSinceReflection</code> &mdash; exactly-once counting under at-least-once delivery</div>
        <div class="lanehead seq" style="--i:4">threshold</div><div class="lstep seq" style="--i:4">counter &ge; 5 &rarr; reflection: the last ~10 samples + the CURRENT profile go to the model</div>
        <div class="lanehead seq" style="--i:5">evolve</div><div class="lstep good seq" style="--i:5">the model emits a FULL replacement profile + a change_summary &rarr; version+1, counter reset to 0, one audit row per reflection</div>
      </div>
      <div class="qbox micro seq" style="--i:6">
        <div class="dlabel">the read path — both memories, together</div>
        <p style="margin:4px 0 0">"Draft a post about X": embed the topic &rarr; <b class="hl">top-k nearest past samples</b> (episodic, injected as few-shot examples) + <b class="hl">the current voice profile</b> (the semantic aggregate, always injected) &rarr; compose. Exactly this course's assembly: retrieved details riding next to the evolving profile.</p>
      </div>
      <div class="dnote seq" style="--i:7">Nothing here is exotic &mdash; it's the drills you've already run, wired to a table stream: <b style="color:var(--ordered)">salience</b> (only saved posts become samples), <b style="color:var(--ordered)">dedupe</b> (deterministic keys, content-hash no-op guards), <b style="color:var(--ordered)">reflection on accumulated novelty</b>, <b style="color:var(--ordered)">supersession with an audit trail</b>.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the consumer, condensed from the real system</div>
      <pre class="code">async function recordVoiceSample(sample) {
  const embedding = await embedText(sample.text);
  await putVoiceSample({ ...sample, embedding });   <span class="cm">// idempotent: deterministic key</span>
  <span class="ok">const { counted, count } = await countSampleOnce(sample);</span>
  if (!counted) return;                             <span class="cm">// redelivery — already counted</span>
  if (count &gt;= REFLECTION_THRESHOLD) {
    await runReflection(sample.platform);           <span class="cm">// best-effort: on failure the</span>
  }                                                 <span class="cm">// counter is NOT reset, so the</span>
}                                                   <span class="cm">// next sample re-triggers it</span></pre>
    </div>
    <p>Read the ordering like an invariant, because it is one. The vector write runs <b class="hl">first</b> (a counted sample always has a vector). The mark and the increment are <b class="hl">atomic</b> (a crash can't leave a sample marked-but-uncounted, and a redelivered stream record simply skips). And reflection is a <b class="hl">best-effort follow-up</b>: if the model call fails, the counter stays at-or-past the threshold, so the very next sample re-triggers it — the design heals itself instead of losing work.</p>
    <p>Notice what the aggregate <i>is</i> here: not a running average of vectors, but a <b class="hl">structured profile the model re-derives</b> — tone, audience, sentence structure, signature phrases, dos and don'ts — from the current profile plus the newest batch. Replacement-plus-version beats in-place edits: it's idempotent to apply, trivially auditable (the diff lives in the reflection row's change_summary), and there's nothing to merge.</p>
    <p><b class="hl">Why it matters:</b> this is what the evolution arc looks like with production physics attached — at-least-once delivery instead of tidy function calls, transactions instead of Sets, a table stream instead of a loop. The concepts didn't change; they grew guards. When you design your own memory pipeline, steal the ordering above before you steal anything else.</p>`,
  });

  /* =========================================================
     2. DRILL — the reflect-once counter (problem bank)
     ========================================================= */
  class ReflectionCounter {
    #marked = new Set();
    count = 0;
    countOnce(sampleId) {
      if (this.#marked.has(sampleId)) return { counted: false, count: this.count };
      this.#marked.add(sampleId);        // mark + increment together — atomic in the real system
      this.count++;
      return { counted: true, count: this.count };
    }
  }

  async function demoCountOnce() {
    const THRESHOLD = 3;
    const c = new ReflectionCounter();
    const deliveries = ["s1", "s2", "s1", "s3", "s2"];   // s1 and s2 redelivered
    let naive = 0;
    const results = deliveries.map((id) => { naive++; return c.countOnce(id); });
    const counted = results.filter((r) => r.counted).length;
    const skipped = results.filter((r) => !r.counted).length;
    const fired = c.count >= THRESHOLD;
    const pass = counted === 3 && skipped === 2 && c.count === 3
      && results[2].counted === false && fired && naive === 5;
    return { lines: [
      { t: `5 stream deliveries of 3 distinct samples (s1, s2 arrive twice)` },
      { t: `naive counter reads ${naive} — reflection would fire on phantoms` },
      { t: `count-once: ${counted} counted, ${skipped} redeliveries skipped → threshold ${THRESHOLD} hit by real samples` },
    ], pass, verdict: pass
      ? "the counter tracks samples, not deliveries — reflection fires on the Nth post, never on a retry"
      : `counted=${counted} skipped=${skipped} count=${c.count}` };
  }

  DRILLS.bank.push({
    id: "countonce", title: "Reflect-Once Counter", why: "at-least-once delivery must not fire phantom reflections", demo: demoCountOnce,
    pre: `// the table stream redelivers: every sample can arrive
// MORE than once. reflection fires when count crosses N —
// and reflections cost a model call each.
class ReflectionCounter {
  #marked = new Set();
  count = 0;
  countOnce(sampleId) {`,
    blank: { q: "A redelivered sample arrives while the counter sits at threshold−1. Which body makes reflection fire on the Nth real sample — never on a phantom?",
      options: [
`    if (this.#marked.has(sampleId))
      return { counted: false, count: this.count };
    this.#marked.add(sampleId);
    this.count++;
    return { counted: true, count: this.count };`,
`    this.count++;
    return { counted: true, count: this.count };`,
`    if (this.#marked.has(sampleId))
      return { counted: false, count: this.count };
    this.count++;
    return { counted: true, count: this.count };`],
      answer: 0,
      whys: ["Right. Check the mark, set the mark, then count — a redelivery hits the guard and skips. In the real system the mark and the increment are one DynamoDB transaction, so a crash can't split them: a sample can never end up marked-but-uncounted or counted twice.",
             "Counting deliveries instead of samples: five deliveries of three posts reads 5, reflection fires early on phantoms, and every burst of retries buys another expensive model call to re-learn nothing new.",
             "Checks but never RECORDS — #marked stays empty forever, so every redelivery is 'first' and the count inflates exactly like the naive counter. The mark is what turns at-least-once delivery into exactly-once counting."] },
    post: `  }
}
// on success, the reflection resets count to 0. on FAILURE it
// doesn't — count stays >= N, so the next sample re-triggers.` });

  /* =========================================================
     3. QUIZ — two pipeline failure modes
     ========================================================= */
  QUIZ.push(
    { code: `// stream-driven memory: every saved post is embedded,
// counted, and reflection fires at count >= 5.
// the stream redelivers a batch after a timeout —
// samples s3 and s4 arrive a SECOND time.`,
      options: ["nothing changes — the counter marks each sample and counts it exactly once, so redeliveries skip",
                "the counter reads 7 and reflection fires two posts early — retries are indistinguishable from new samples",
                "the vector index now holds duplicate embeddings for s3 and s4"],
      answer: 0,
      whys: [
        "Right — because the system was BUILT for at-least-once delivery: the per-sample mark and the counter increment are one atomic transaction, so a redelivered record fails the mark's condition and the whole unit skips. Streams redeliver; that's a fact to design for, not a bug to hope away.",
        "That's what happens WITHOUT the idempotency sentinel — and it's the default if you just increment a counter in the handler. Counting deliveries instead of samples fires reflections on phantoms, each one a paid model call.",
        "The vector write is idempotent by construction: the key is deterministic (tenant#platform#sampleId), so a re-put overwrites the same record in place. Deterministic keys are what make retries harmless on the vector side."] },

    { code: `// count crosses the threshold; the reflection's model
// call FAILS (throttled). the counter was designed to
// reset only inside a successful profile write.
// what happens to the pending reflection?`,
      options: ["nothing is lost — the counter still reads >= threshold, so the very next sample re-triggers reflection (and a manual reflect endpoint exists besides)",
                "the batch is lost — those samples will never be reflected into the profile",
                "the handler must retry the model call in a loop until it succeeds"],
      answer: 0,
      whys: [
        "Right. Reset-only-on-success makes the failure mode self-healing: the trigger condition persists until a reflection actually lands. The samples themselves are safely stored either way — reflection is a derived view, so 'later' is just as correct as 'now'.",
        "The samples are durable rows and the counter never went down — nothing about the failure erased the evidence. Loss would require resetting the counter BEFORE the profile write succeeded, which is exactly the ordering the design forbids.",
        "A retry loop inside a stream handler holds the whole batch hostage to one throttled dependency (and can retry into the same throttle). Deferring to the next natural trigger — or a manual endpoint — sheds the work instead of amplifying the failure."] },
  );

  /* =========================================================
     4. CARDS — the design decisions, as judgment calls
     ========================================================= */
  CARDS.push(
    ["Why does the reflected profile fully REPLACE the old one instead of patching it?",
     "Replacement + a version number is idempotent to apply, impossible to half-apply, and trivially auditable — the diff lives in the reflection's change_summary row, not in the state. The model sees the current profile as INPUT, so continuity comes from the prompt, not from merge logic you'd have to debug."],
    ["Why are vector keys deterministic (tenant#platform#sampleId) instead of random?",
     "Idempotency and cheap deletes: a retried write overwrites the same record in place (no duplicates from at-least-once delivery), and deleting a sample needs no scan — the key is derivable from the row. Random keys turn every retry into a duplicate and every delete into a search."],
    ["Why does the reflection counter reset inside the profile write, not before the model call?",
     "So failure is self-healing: if the model call dies, the counter still reads >= threshold and the next sample re-triggers the reflection. Reset-first would drop the trigger on the floor exactly when the system is already having a bad day. Reset is the LAST step because it's the one that says 'this batch is consumed.'"],
    ["A stream consumer writes rows to the same table it consumes. What's the loop guard?",
     "Filter by entity: the consumer only receives the sample rows, and the profile/reflection rows it writes carry different entity values — so its own output can never re-trigger it. Same discipline as any memory write path: know exactly which writes are inputs and which are derived, or the pipeline feeds itself."],
  );

  /* =========================================================
     5. CROSS-LINKS
     ========================================================= */
  DRILL_LESSON.countonce = caseLesson;
  LESSON_PRACTICE[caseLesson] = { mod: "bank", drill: "countonce" };

})();
