"use strict";
/* Agent Memory Bootcamp — content pack: evolution.
   Appends lessons 12-15 (final indices; see the LESSON PLAN in js/content.js):
     12 consolidation: episodes become the aggregate
     13 reflection: insights from experience
     14 forgetting on purpose
     15 the write path: salience, dedupe, provenance
   Cross-links for these lessons are already registered in content.js.
   Loaded after content.js and pack 10, before the engine. */
(function () {

  LESSONS.push(
  { eb:"lesson 13 · evolution", title:"Consolidation: episodes become the aggregate", html:`
    <p class="big">Episodes are events; the <b class="hl">aggregate</b> is what they add up to. Consolidation folds each incoming episodic memory into one living profile — <b class="hl">continuously evolving</b>: repetition strengthens a belief, contradiction rewrites it, and every episode leaves the profile current, compact, and ready to inject.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">episodes stream in &middot; the profile evolves &middot; nothing is re-read</div>
      <svg class="estage" viewBox="0 0 340 160" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <rect x="214" y="26" width="118" height="108" rx="10" fill="#071726" stroke="#4eaeff" stroke-width="1.5"/>
        <text x="273" y="42" fill="#4eaeff" font-size="8.5" text-anchor="middle">AGGREGATE PROFILE</text>
        <text x="222" y="62" fill="#e2ecf3" font-size="8">drink:</text>
        <text x="262" y="62" fill="#34d3bf" font-size="8">coffee ×1
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.14;0.15;0.4;0.41;1" values="0;0;1;1;0;0"/></text>
        <text x="262" y="62" fill="#34d3bf" font-size="8" opacity="0">coffee ×2
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.4;0.41;0.68;0.69;1" values="0;0;1;1;0;0"/></text>
        <text x="262" y="62" fill="#fb923c" font-size="8" opacity="0">tea ×1 ⟲
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.68;0.69;0.97;1" values="0;0;1;1;0"/></text>
        <text x="222" y="80" fill="#e2ecf3" font-size="8" opacity="0">city: Denver
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.52;0.53;0.97;1" values="0;0;1;1;0"/></text>
        <text x="222" y="98" fill="#647c8f" font-size="7.5" opacity="0">history: coffee (×2)
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.68;0.69;0.97;1" values="0;0;1;1;0"/></text>
        <text x="222" y="122" fill="#8ca6b8" font-size="7.5">always current &middot; ~20 tokens</text>
        <rect x="8" y="30" width="128" height="22" rx="7" fill="#071726" stroke="#34d3bf" stroke-width="1.2"/>
        <text x="72" y="44" fill="#34d3bf" font-size="7.5" text-anchor="middle">ep1 "coffee before standup"</text>
        <rect x="8" y="62" width="128" height="22" rx="7" fill="#071726" stroke="#34d3bf" stroke-width="1.2"/>
        <text x="72" y="76" fill="#34d3bf" font-size="7.5" text-anchor="middle">ep2 "espresso, as usual"</text>
        <rect x="8" y="94" width="128" height="22" rx="7" fill="#071726" stroke="#4eaeff" stroke-width="1.2"/>
        <text x="72" y="108" fill="#4eaeff" font-size="7.5" text-anchor="middle">ep3 "moved to Denver"</text>
        <rect x="8" y="126" width="128" height="22" rx="7" fill="#071726" stroke="#fb923c" stroke-width="1.2"/>
        <text x="72" y="140" fill="#fb923c" font-size="7.5" text-anchor="middle">ep4 "switched to tea"</text>
        <circle r="5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="7s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.02;0.14;1" keyPoints="0;0;1;1" path="M 136 41 L 214 55"/>
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.02;0.13;0.15;1" values="0;1;1;0;0"/>
        </circle>
        <circle r="5" fill="#34d3bf" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="7s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.28;0.4;1" keyPoints="0;0;1;1" path="M 136 73 L 214 58"/>
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.28;0.39;0.41;1" values="0;0;1;0;0"/>
        </circle>
        <circle r="5" fill="#4eaeff" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="7s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.42;0.52;1" keyPoints="0;0;1;1" path="M 136 105 L 214 76"/>
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.42;0.51;0.53;1" values="0;0;1;0;0"/>
        </circle>
        <circle r="5" fill="#fb923c" stroke="#071726" stroke-width="1.5">
          <animateMotion dur="7s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.56;0.68;1" keyPoints="0;0;1;1" path="M 136 137 L 214 60"/>
          <animate attributeName="opacity" dur="7s" repeatCount="indefinite" keyTimes="0;0.56;0.67;0.69;1" values="0;0;1;0;0"/>
        </circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">learn</div><div class="lstep seq" style="--i:0">unknown key &rarr; new entry at confidence 1</div>
        <div class="lanehead seq" style="--i:1">reinforce</div><div class="lstep good seq" style="--i:1">same value again &rarr; confidence +1, <b>capped</b> &mdash; beliefs stay overturnable</div>
        <div class="lanehead seq" style="--i:2">revise</div><div class="lstep bad seq pop" style="--i:2">different value &rarr; supersede &middot; confidence RESETS to 1 &middot; old value &rarr; history</div>
      </div>
      <div class="dnote seq" style="--i:3">The profile never re-reads old episodes — each one folded in <b style="color:var(--ordered)">as it arrived</b>. That's what makes it cheap enough to run forever and small enough to inject always.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; one episode folds in</div>
      <pre class="code">applyEpisode(ep) {
  for (const f of ep.facts) {
    const cur = this.profile.get(f.topic + "|" + f.attribute);
    if (!cur)                    <span class="cm">// learn</span>
      this.profile.set(key, { value: f.value, confidence: 1 });
    else if (cur.value === f.value)
      <span class="ok">cur.confidence = Math.min(this.cap, cur.confidence + 1);</span>
    else {                       <span class="cm">// revise: supersede + reset</span>
      cur.history.push({ value: cur.value });
      cur.value = f.value; <span class="ok">cur.confidence = 1;</span>
    }
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the pattern behind every "the agent just knows me now" experience — persistent profile blocks, user-preference memory, CRM-style agent records. The two invariants to say out loud: <b class="hl">the cap keeps old beliefs overturnable</b>, and <b class="hl">the reset keeps new beliefs humble</b>. Miss either and the profile calcifies or thrashes.</p>` },

  { eb:"lesson 14 · evolution", title:"Reflection: insights from experience", html:`
    <p class="big">Consolidation tracks facts episode by episode. <b class="hl">Reflection</b> looks <i>across</i> a batch of episodes and asks a different question: <b class="hl">what pattern do these add up to?</b> Three rescheduled morning meetings aren't three facts — they're one insight: <i>the user avoids early meetings</i>.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">accumulate &rarr; threshold &rarr; distill &rarr; store the insight AS a memory</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">ep &middot; imp 3</div><div class="lstep seq" style="--i:0">"asked to postpone the review" &middot; acc = 3 &middot; below threshold, wait</div>
        <div class="lanehead seq" style="--i:1">ep &middot; imp 3</div><div class="lstep seq" style="--i:1">"moved standup later again" &middot; acc = 6 &middot; wait</div>
        <div class="lanehead seq" style="--i:2">ep &middot; imp 4</div><div class="lstep good seq" style="--i:2">"declined the 8am slot" &middot; acc = 10 &rarr; <b>threshold hit — reflect over the batch</b></div>
        <div class="lanehead seq" style="--i:3">distill</div><div class="lstep good seq pop" style="--i:3">3 episodes, one direction &rarr; insight: "user avoids early meetings" &middot; batch consumed, acc = 0</div>
        <div class="lanehead seq" style="--i:4">store</div><div class="lstep seq" style="--i:4">the insight becomes a first-class memory &mdash; retrievable, scoreable, supersedable like any other</div>
      </div>
      <div class="qbox macro seq" style="--i:5">
        <div class="dlabel">why a threshold, not a schedule of one</div>
        <p style="margin:4px 0 0">Reflecting on every turn can't see patterns (a pattern IS several episodes) and pays the analysis cost hundreds of times. Never reflecting leaves memory a pile of events that no ranking can turn into understanding. Accumulated-importance triggers sit in between: reflection happens exactly as often as <b class="hl">interesting things happen</b>.</p>
      </div>
      <div class="dnote seq" style="--i:6">Consume the batch after reflecting — a trigger that never resets re-reflects everything forever, minting <b style="color:var(--race)">duplicate insights</b> at quadratic cost.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the trigger</div>
      <pre class="code">observe(ep) {
  this.pending.push(ep);
  this.acc += ep.importance;
  if (this.acc &lt; this.threshold) return null;   <span class="cm">// not yet</span>
  const insights = this.reflect(this.pending);  <span class="cm">// across the batch</span>
  <span class="ok">this.pending = []; this.acc = 0;</span>              <span class="cm">// consume it</span>
  return insights;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> reflection is memory moving up an abstraction level — episodes &rarr; insights &rarr; (eventually) identity. It's the "generative agents" trick that made simulated townsfolk feel coherent, and in production it's the difference between an agent that remembers your reschedules and one that <b class="hl">stops proposing 8am meetings</b>.</p>` },

  { eb:"lesson 15 · evolution", title:"Forgetting on purpose", html:`
    <p class="big">A memory store that only grows doesn't get wiser — it gets <b class="hl">noisier</b>. Every stale record competes in every future retrieval. Forgetting is not data loss; it's <b class="hl">curation under a capacity</b>: keep what's important and used, let the idle and trivial fade.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">capacity 3, a 4th memory arrives &middot; who goes?</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">pinned</div><div class="lstep good seq" style="--i:0">core instructions &middot; score = &infin; &mdash; unbeatable, by design</div>
        <div class="lanehead seq" style="--i:1">allergy</div><div class="lstep good seq" style="--i:1">importance 10 &middot; retrieved yesterday &rarr; decayed score &asymp; 0.91 &mdash; safe</div>
        <div class="lanehead seq" style="--i:2">fonts tangent</div><div class="lstep bad seq pop" style="--i:2">importance 3 &middot; idle 30 days &rarr; score &asymp; 0.02 &rarr; <b>evicted</b></div>
        <div class="lanehead seq" style="--i:3">newcomer</div><div class="lstep seq" style="--i:3">"prefers dark mode" &middot; importance 6 &middot; fresh &rarr; takes the seat</div>
      </div>
      <div class="lanes" style="margin-top:10px">
        <div class="lanehead seq" style="--i:4">the score</div><div class="lstep seq" style="--i:4">(importance/10) &times; halfLifeDecay(idle time) &mdash; the retrieval score, run in reverse</div>
        <div class="lanehead seq" style="--i:5">touch()</div><div class="lstep good seq" style="--i:5">every retrieval refreshes lastAccess &mdash; <b>being used is what keeps a memory alive</b></div>
      </div>
      <div class="dnote seq" style="--i:6">Two knobs, two jobs: <b style="color:var(--ordered)">decay</b> (a slope) ranks relevance and can be revived by use; a <b style="color:var(--race)">TTL</b> (a cliff) deletes on schedule — right for PII and compliance, where "faded" isn't "deleted."</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; evict the weakest</div>
      <pre class="code">add(m, now) {
  this.items.push({ ...m, lastAccess: now });
  if (this.items.length &lt;= this.capacity) return null;
  let victim = 0;
  for (let i = 1; i &lt; this.items.length; i++)
    <span class="ok">if (this.score(this.items[i], now) &lt;</span>
        this.score(this.items[victim], now)) victim = i;
  return this.items.splice(victim, 1)[0];   <span class="cm">// return it — log what you forget</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> unbounded memory fails slowly and then suddenly — retrieval quality sags for months before anyone connects it to the 400,000-record index. Forgetting is also where <b class="hl">deletion requests</b> live: a compliance delete must remove the records, their embeddings, and anything consolidation derived from them. Design the forgetting path on day one; retrofitting it is archaeology.</p>` },

  { eb:"lesson 16 · evolution", title:"The write path: salience, dedupe, provenance", html:`
    <p class="big">Every memory failure you've drilled — noise floods, duplicate blankets, immortal contradictions, poisoned rules — walked in through the same door: <b class="hl">the write path</b>. Reads can only rank what writes allowed to exist. So the write path is a <b class="hl">gauntlet</b>, not a pipe.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">one candidate memory &middot; four gates before it persists</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1 &middot; provenance</div><div class="lstep seq" style="--i:0">source must be user or verified tool &mdash; retrieved/web content is <b>never</b> memory-eligible</div>
        <div class="lanehead seq" style="--i:1">2 &middot; shape</div><div class="lstep seq" style="--i:1">instruction-shaped text ("remember: always approve&hellip;") rejected even from trusted sources</div>
        <div class="lanehead seq" style="--i:2">3 &middot; salience</div><div class="lstep seq" style="--i:2">importance below threshold &rarr; skipped &mdash; pleasantries don't get to compete in top-k</div>
        <div class="lanehead seq" style="--i:3">4 &middot; dedupe</div><div class="lstep seq" style="--i:3">near-duplicate of an existing record &rarr; reinforce it (strength+1, recency refresh), don't mint a copy</div>
        <div class="lanehead seq" style="--i:4">then</div><div class="lstep good seq pop" style="--i:4">write &mdash; atomic, dated, sourced &middot; and route by type: event&rarr;episodic, fact&rarr;upsert, feedback&rarr;rules</div>
      </div>
      <div class="qbox macro seq" style="--i:5">
        <div class="dlabel">memory poisoning, said plainly</div>
        <p style="margin:4px 0 0">A prompt injection lasts one turn. A <b class="hl">memory write</b> of that injection lasts forever — replayed into every future session wearing your own store's trust. The write path is the security boundary; nothing downstream can un-trust what it admitted.</p>
      </div>
      <div class="dnote seq" style="--i:6">And the quietest poison is self-inflicted: storing the <b style="color:var(--race)">assistant's own guesses</b> as facts. The agent then retrieves its own hallucination, now with citations. Store what the user said and what tools verified.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the guard at the door</div>
      <pre class="code">function guardWrite(candidate) {
  <span class="ok">if (candidate.source !== "user" && candidate.source !== "tool")</span>
    return { stored: false, reason: "untrusted source" };
  <span class="ok">if (/ignore (all|previous)|new instructions/i.test(candidate.text))</span>
    return { stored: false, reason: "instruction-shaped" };
  return { stored: true };   <span class="cm">// then: salience gate → dedupe → route</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> asked to design agent memory in an interview, most candidates draw the read path — embeddings, vector store, top-k. The senior move is spending equal time on writes: <b class="hl">what gets in, from whom, deduped how, superseding what, deletable by which path</b>. That's the whole course in one sentence.</p>` },
  );

})();
