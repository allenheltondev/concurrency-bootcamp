"use strict";
/* Agent Memory Bootcamp — content pack: retrieval scoring + long-term memory.
   Appends lessons 6-11 (final indices; see the LESSON PLAN in js/content.js):
     6  scoring: relevance + recency + importance
     7  assembling the context window
     8  episodic memory: the event log
     9  semantic memory: facts, extracted
     10 contradiction and supersession
     11 procedural memory: learned rules
   Cross-links for these lessons are already registered in content.js.
   Loaded after content.js, before the engine — same shared-global model as a
   classic <script> tag. */
(function () {

  LESSONS.push(
  { eb:"lesson 07 · retrieval", title:"Scoring: relevance, recency, importance", html:`
    <p class="big">Similarity finds memories that <b class="hl">sound like</b> the question. A good assistant surfaces what's relevant <i>and current and consequential</i>. So production retrieval scores each candidate on <b class="hl">three signals</b> and ranks by the weighted sum.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">score = w&#8347;&middot;similarity + w&#7523;&middot;recency + w&#7522;&middot;importance &middot; every term in [0,1]</div>
      <div class="dcols">
        <div class="dcol seq" style="--i:0">
          <div class="dlabel">m1 &middot; "lives in Austin" &middot; day 3</div>
          <div class="lstep">sim .83 &middot; recency &asymp; 0.004</div>
          <div class="lstep">score = .498 + .001 + .09 = <b>.59</b></div>
        </div>
        <div class="dcol seq" style="--i:1">
          <div class="dlabel">m2 &middot; "moved to Denver" &middot; day 60</div>
          <div class="lstep">sim .81 &middot; recency &asymp; 0.91</div>
          <div class="lstep good">score = .486 + .227 + .09 = <b>.80</b> &#10003;</div>
        </div>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:2">recency</div><div class="lstep seq" style="--i:2">half-life decay: 1 when fresh &middot; 0.5 after one half-life &middot; &rarr; 0, never negative</div>
        <div class="lanehead seq" style="--i:3">importance</div><div class="lstep seq" style="--i:3">rated 1-10 at WRITE time, normalized to [0,1] &mdash; allergies outrank jokes</div>
        <div class="lanehead seq" style="--i:4">the trap</div><div class="lstep bad seq pop" style="--i:4">recency that GROWS with age (base 2, raw days) &mdash; the oldest junk wins everything, unbounded</div>
      </div>
      <div class="dnote seq" style="--i:5">Every term bounded in [0,1] is what makes the weights <b style="color:var(--ordered)">be the policy</b>: w = {.6, .25, .15} means "relevance first, freshness breaks ties, stakes get a thumb on the scale."</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; three signals, one sum</div>
      <pre class="code">function scoreMemory(m, sim, now, w) {
  const age = now - m.ts;
  return w.sim * sim
       + <span class="ok">w.rec * Math.pow(0.5, age / (w.halfLife * DAY))</span>
       + w.imp * (m.importance / 10);
}
<span class="cm">// the shape popularized by the "generative agents" paper:</span>
<span class="cm">// relevance &middot; recency &middot; importance, weighted and summed</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this one function fixes two of the four top-k failure modes outright — stale-wins and trivia-outranks — and it's ten lines. When someone proposes "just use a vector DB," the senior question is: <b class="hl">what's your scoring function?</b> Distance alone is a third of one.</p>` },

  { eb:"lesson 08 · retrieval", title:"Assembling the context window", html:`
    <p class="big">Everything converges on one moment: building the next request. System prompt, standing rules, the profile, retrieved memories, the rolling summary, recent turns — all want in, and they share <b class="hl">one token budget</b>. Assembly is a packing problem with priorities.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">packing an 8k window &middot; most vital first</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">p0 &middot; required</div><div class="lstep good seq" style="--i:0">system prompt + procedural rules &middot; can't fit &rarr; <b>loud error</b>, never a skip</div>
        <div class="lanehead seq" style="--i:1">p1</div><div class="lstep seq" style="--i:1">the aggregate profile &mdash; small, always useful</div>
        <div class="lanehead seq" style="--i:2">p2</div><div class="lstep seq" style="--i:2">rolling summary &mdash; the story so far</div>
        <div class="lanehead seq" style="--i:3">p3</div><div class="lstep seq" style="--i:3">top-k retrieved memories &mdash; scored, deduped, capped</div>
        <div class="lanehead seq" style="--i:4">p4</div><div class="lstep seq" style="--i:4">recent turns &mdash; as many as still fit</div>
        <div class="lanehead seq" style="--i:5">doesn't fit</div><div class="lstep bad seq pop" style="--i:5">30k of raw history &rarr; <b>dropped whole</b>, not truncated mid-sentence</div>
      </div>
      <div class="qbox macro seq" style="--i:6">
        <div class="dlabel">the failure that hides for months</div>
        <p style="margin:4px 0 0">A packer that <b class="hl">silently drops a required section</b> ships an agent with no system prompt. It still answers — weirdly — and no log says why. Required-that-can't-fit must throw; optional-that-can't-fit must be dropped <i>whole</i>.</p>
      </div>
      <div class="dnote seq" style="--i:7">More context is not better context: irrelevant memories <b style="color:var(--race)">dilute attention</b> and add cost. The budget slice for memory is a product decision, enforced here.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; priority packing</div>
      <pre class="code">function assembleContext(sections, budget) {
  const chosen = []; let used = 0;
  for (const s of sortBy(sections, "priority")) {
    const t = approxTokens(s.text);
    if (used + t &lt;= budget) { chosen.push(s.name); used += t; }
    <span class="ok">else if (s.required) throw new Error("won't fit: " + s.name);</span>
  }
  return { chosen, used };
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> assembly is where memory becomes behavior — a perfect store read by a sloppy packer produces a confused agent. It's also your cost lever: the difference between a 4k and a 40k average prompt is a 10&times; bill for the same product.</p>` },

  { eb:"lesson 09 · long-term", title:"Episodic memory: the event log", html:`
    <p class="big">Episodic memory answers <b class="hl">"what happened?"</b> — a dated, append-mostly log of events worth remembering: <i>user reported the sync bug on Tuesday; the March 3rd deadline was agreed; the refund was issued</i>. It is the raw material every other long-term store is derived from.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the write path &middot; a day of chat becomes a few episodes</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">turns</div><div class="lstep seq" style="--i:0">"thanks!" &middot; "I'm allergic to peanuts — never include them" &middot; "ok cool" &middot; "deadline is March 3" &middot; "hi again"</div>
        <div class="lanehead seq" style="--i:1">rate</div><div class="lstep seq" style="--i:1">importance 1-10 per candidate: 1 &middot; <b>8</b> &middot; 1 &middot; <b>5</b> &middot; 1</div>
        <div class="lanehead seq" style="--i:2">gate &ge; 4</div><div class="lstep good seq pop" style="--i:2">2 episodes stored &middot; 3 pleasantries skipped &#10003;</div>
        <div class="lanehead seq" style="--i:3">record</div><div class="lstep seq" style="--i:3">{ ts, text, importance, tags, source } &mdash; atomic, dated, self-contained</div>
      </div>
      <div class="qbox micro seq" style="--i:4">
        <div class="dlabel">what makes a good episode record</div>
        <p style="margin:4px 0 0"><b class="hl">Atomic</b> (one event), <b class="hl">self-contained</b> (readable without the transcript), <b class="hl">dated</b> (staleness is computable), <b class="hl">sourced</b> (user said it / tool verified it / model inferred it). "User is allergic to peanuts (stated 2026-03-14)" — not a 40-turn blob.</p>
      </div>
      <div class="dnote seq" style="--i:5">The gate is a <b style="color:var(--ordered)">retrieval-quality</b> feature, not a storage optimization: every record you refuse to write is a competitor that can never crowd the top-k.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the salience gate</div>
      <pre class="code">record(ep) {                    <span class="cm">// ep = { ts, text, importance }</span>
  <span class="ok">if (ep.importance &lt; this.threshold) {</span>
    this.skipped++;             <span class="cm">// count it — you want this metric</span>
    return false;
  }
  this.episodes.push(ep);
  return true;
}
<span class="cm">// real systems ask the model to rate importance; this course's</span>
<span class="cm">// rateImportance() is a keyword stand-in with the same contract</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> episodic memory is the audit trail — when the agent misbehaves, this is where you find out what it experienced. And it feeds everything downstream: facts are <i>extracted</i> from episodes, reflections are <i>distilled</i> from batches of them, and the evolving profile is their running total.</p>` },

  { eb:"lesson 10 · long-term", title:"Semantic memory: facts, extracted", html:`
    <p class="big">Semantic memory answers <b class="hl">"what's true?"</b> Instead of storing "we chatted about coffee for six turns," store the distilled claim: <b class="hl">user | drink | espresso</b>. Structured facts are tiny to inject, trivial to update, and impossible to mis-retrieve as forty turns of chat.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">extraction at write time &middot; conversation in, triples out</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">episode</div><div class="lstep seq" style="--i:0">"I moved to Denver last month, still hunting for a good espresso place near the office"</div>
        <div class="lanehead seq" style="--i:1">extract</div><div class="lstep good seq" style="--i:1">{user | city | Denver} &middot; {user | drink | espresso}</div>
        <div class="lanehead seq" style="--i:2">store</div><div class="lstep seq" style="--i:2">upsert each triple &mdash; keyed by subject|attribute</div>
        <div class="lanehead seq" style="--i:3">next session</div><div class="lstep good seq pop" style="--i:3">profile section: "city: Denver &middot; drink: espresso" &mdash; 8 tokens, zero retrieval needed</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">why extraction happens at WRITE time</div>
        <p style="margin:4px 0 0">Write time happens <b class="hl">once</b>; read time happens on every request. Distilling facts when they arrive means read time is a cheap key lookup — extracting at read time means re-analyzing transcripts on every single call, at interactive latency.</p>
      </div>
      <div class="dnote seq" style="--i:5">Facts carry <b style="color:var(--ordered)">provenance</b>: who said it, when, from which episode. A fact you can't trace is a fact you can't debug — or delete.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; the shape of the store</div>
      <pre class="code"><span class="cm">// key = the QUESTION; value = the current answer</span>
facts.upsert("user", "city",  "Denver",   ts);
facts.upsert("user", "drink", "espresso", ts);

facts.get("user", "city");   <span class="ok">// "Denver" — one answer, instantly</span>
<span class="cm">// vs. episodic: search("where does the user live?") — a ranked</span>
<span class="cm">// GUESS over k candidates. store facts as facts.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> the biggest quality jump in most memory systems is exactly this move — from "embed the transcript and hope" to "extract structured facts and upsert them." What happens when a new fact <i>contradicts</i> an old one is the next lesson, and it's where most implementations quietly rot.</p>` },

  { eb:"lesson 11 · long-term", title:"Contradiction and supersession", html:`
    <p class="big">People change. Facts don't stop being stored because they stopped being true — unless the write path makes them. The rule: <b class="hl">one key, one current answer</b>. A new value <b class="hl">supersedes</b> the old; the old becomes <b class="hl">history</b>, not a rival.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">user|city over three months &middot; upsert's three verdicts</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">march</div><div class="lstep seq" style="--i:0">"Austin" &rarr; <b>added</b> &middot; confirmations 1</div>
        <div class="lanehead seq" style="--i:1">april</div><div class="lstep seq" style="--i:1">"Austin" again &rarr; <b>confirmed</b> &middot; confirmations 2</div>
        <div class="lanehead seq" style="--i:2">june</div><div class="lstep good seq pop" style="--i:2">"Denver" &rarr; <b>superseded</b> &middot; value replaced &middot; confirmations RESET to 1 &middot; Austin &rarr; history</div>
        <div class="lanehead seq" style="--i:3">query</div><div class="lstep good seq" style="--i:3">get(user, city) &rarr; "Denver" &mdash; exactly one answer, every time</div>
      </div>
      <div class="dcols" style="margin-top:10px">
        <div class="dcol seq" style="--i:4">
          <div class="dlabel">without supersession</div>
          <div class="lstep bad">Austin AND Denver both retrievable</div>
          <div class="lstep bad">agent alternates by phrasing &middot; forever</div>
        </div>
        <div class="dcol seq" style="--i:5">
          <div class="dlabel">with supersession</div>
          <div class="lstep good">read time is boring &mdash; one truth</div>
          <div class="lstep good">history answers "since when?" &amp; audits</div>
        </div>
      </div>
      <div class="dnote seq" style="--i:6">The reset matters: a revision is <b style="color:var(--race)">not</b> a confirmation. Carrying the old streak makes the newest flip-flop look like the store's best-established fact.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the contradiction branch</div>
      <pre class="code"><span class="cm">// same key, different value — the moment that matters:</span>
cur.history.push({ value: cur.value, ts: cur.ts });  <span class="cm">// old = provenance</span>
cur.value = value; cur.ts = ts;
<span class="ok">cur.confirmations = 1;</span>          <span class="cm">// a new belief re-earns its standing</span>
return "superseded";</pre>
    </div>
    <p><b class="hl">Why it matters:</b> contradiction handling is the difference between memory that <i>tracks</i> a person and memory that <i>accumulates residue</i> about them. Resolve conflicts once, at write time — or pay for them on every read, forever, at the model's discretion. This exact rule scales up one level in lesson 13, where the whole profile evolves this way.</p>` },

  { eb:"lesson 12 · long-term", title:"Procedural memory: learned rules", html:`
    <p class="big">Procedural memory answers <b class="hl">"how should I behave?"</b> — standing rules distilled from feedback: <i>always run the linter before committing; never email the client directly; confirm before booking anything over $500</i>. Not facts about the user — <b class="hl">policies for the agent</b>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">feedback becomes policy &middot; the promotion path</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">tuesday</div><div class="lstep seq" style="--i:0">"you committed without running the linter — please don't"</div>
        <div class="lanehead seq" style="--i:1">thursday</div><div class="lstep seq" style="--i:1">"again: linter FIRST, then commit"</div>
        <div class="lanehead seq" style="--i:2">promote</div><div class="lstep good seq pop" style="--i:2">rule minted: "always run the linter before committing" &rarr; <b>pinned</b> into every future session</div>
        <div class="lanehead seq" style="--i:3">friday</div><div class="lstep good seq" style="--i:3">the agent lints first &mdash; without being told, without retrieval winning a ranking</div>
      </div>
      <div class="qbox macro seq" style="--i:4">
        <div class="dlabel">rules are different from facts — treat them differently</div>
        <p style="margin:4px 0 0"><b class="hl">Few</b> (they're always injected — each one taxes every request), <b class="hl">pinned</b> (a rule that loses a retrieval ranking isn't a rule), <b class="hl">audited</b> (a human can list and delete them), and minted <b class="hl">only from explicit user feedback</b> — never from retrieved content. A "rule" any web page can write is an injection vector with tenure.</p>
      </div>
      <div class="dnote seq" style="--i:5">Cap the list. Ten sharp rules beat eighty stale ones &mdash; and when a rule is contradicted by new feedback, it <b style="color:var(--ordered)">supersedes</b> like any fact.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference &middot; rules ride in the required section</div>
      <pre class="code">const sections = [
  { name: "system",  text: instructions,        priority: 0, required: true },
  <span class="ok">{ name: "rules",   text: rules.join("\\n"),   priority: 0, required: true },</span>
  { name: "profile", text: profile.render(),    priority: 1 },
  { name: "memories", text: retrieved.join("\\n"), priority: 3 },
];
<span class="cm">// rules are part of WHO THE AGENT IS — they never compete for a seat</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> procedural memory is what makes an agent feel like it <i>learns</i> — correct it once and it stays corrected. It's also the highest-privilege store in the system: a poisoned fact misleads one answer; a poisoned <b class="hl">rule</b> misbehaves in every session until a human notices. Guard it accordingly.</p>` },
  );

})();
