"use strict";
/* Agent Memory Bootcamp — content pack: the production map.
   Loaded after content.js and the lesson packs, before the engine (same
   shared-global model as a classic <script> tag). Registers:
     1. a "production map" sheet module — every concept in this course mapped
        to the construct that embodies it in a real agent stack, with a
        bridge line to SAY out loud in an interview or design review
     2. four flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  /* =========================================================
     1. THE PRODUCTION MAP — a static "sheet" module
        concept -> production construct -> a line to SAY out loud
     ========================================================= */
  const mapHtml = `
    <p class="big">Every primitive you drilled has a <b class="hl">production twin</b> in real agent stacks. When the design question comes, answer the concept — then say the bridge line. That's the move: show you know the pattern, then show you know which piece of the stack is quietly running it.</p>

    <div class="impl">
      <div class="dlabel">session buffer + trim loop &rarr; framework message-history management</div>
      <p>Every agent framework ships this: message-history trimming utilities, "keep the last N turns under X tokens" middleware, and the agent-loop equivalent of the pinned system prompt. The design questions are exactly this course's drill: <b class="hl">what's pinned, what's evicted first, and does the trim keep going until the budget actually holds</b>. When a provider truncates for you, it answers those questions without asking you — that's rarely the answer you wanted.</p>
    </div>

    <div class="impl">
      <div class="dlabel">rolling summary &rarr; auto-compaction / summarization middleware</div>
      <p>Long-running coding agents and chat products all hit the same wall and ship the same fix: when the window nears its cap, an LLM pass compresses the oldest span into a summary that rides at the front. The bridge line: compaction is <b class="hl">lossy by design</b> — narrative survives, verbatim dies — so anything exact (IDs, flags, decisions) must ALSO live in a retrievable store before the compactor eats it.</p>
    </div>

    <div class="impl">
      <div class="dlabel">memory index + top-k &rarr; a vector database</div>
      <p>pgvector, OpenSearch, Pinecone, Chroma — different engines, one contract: embed, store, nearest-k. The senior fine print: the index ranks by <b class="hl">distance alone</b>. Recency, importance, supersession, and tenancy are all things the database does NOT do — they're your scoring function and your write path, or they're nowhere.</p>
    </div>

    <div class="impl">
      <div class="dlabel">relevance + recency + importance &rarr; the generative-agents scoring stack</div>
      <p>The three-signal weighted score comes straight from the Stanford "generative agents" work, and production memory services (Mem0, Zep, and friends) all implement a variant. The bridge line: "a vector DB gives me one of the three signals — <b class="hl">my scoring function is where memory policy actually lives</b>."</p>
    </div>

    <div class="impl">
      <div class="dlabel">fact store with supersession &rarr; structured memory / knowledge graphs</div>
      <p>Letta (MemGPT) memory blocks, LangGraph's key-value stores, Zep's fact triples with <code>valid_at</code>/<code>invalid_at</code>, Mem0's add/update/delete memory operations — all are the same move: <b class="hl">facts as structured records keyed by the question</b>, updated in place, with history preserved. When a vendor says "our memory updates itself," this upsert is what's underneath.</p>
    </div>

    <div class="impl">
      <div class="dlabel">the evolving aggregate &rarr; persistent profile blocks / user-preference memory</div>
      <p>Letta's always-in-context core memory blocks that the agent itself edits, managed user-preference memory strategies (e.g. Bedrock AgentCore's), the user-profile records every serious assistant product keeps — each is the consolidation loop shipped: <b class="hl">episodes fold into a compact profile that's always injected and always current</b>. The invariants travel too: repetition strengthens with a cap, contradiction supersedes with a reset.</p>
    </div>

    <div class="impl">
      <div class="dlabel">reflection &rarr; background consolidation jobs / sleep-time compute</div>
      <p>Production systems run reflection where latency doesn't hurt: end-of-session jobs, nightly consolidation, "sleep-time" agents that reprocess the day's episodes into insights and profile updates. The bridge line: <b class="hl">write-time work is done once; read-time work is paid on every request</b> — so distillation belongs in the background, triggered by accumulated novelty, not by the clock alone.</p>
    </div>

    <div class="impl">
      <div class="dlabel">forgetting policy &rarr; TTLs, decay scores, and eviction jobs</div>
      <p>Redis and DynamoDB TTLs are the cliff (gone at expiry — right for PII and compliance); a decayed relevance score with periodic eviction sweeps is the slope (fades unless used — right for ranking). Mature stacks run both, and the bridge line names the difference: <b class="hl">retention wants cliffs, ranking wants slopes</b> — and a deletion request must also chase embeddings and derived records.</p>
    </div>

    <div class="impl">
      <div class="dlabel">per-user scoping &rarr; tenancy keys in the store, not the prompt</div>
      <p>Every memory record keys by user (and org) at the <b class="hl">storage layer</b> — a partition key, a namespace, a filter the query can't omit. The bridge line: retrieval doesn't know about tenancy unless the store enforces it; "the prompt says only use this user's memories" is not an access control.</p>
    </div>

    <div class="impl">
      <div class="dlabel">the write-path guard &rarr; injection defenses + provenance tags</div>
      <p>Production memory pipelines tag every record with its source (user turn, tool result, model inference) and refuse memory-writes from retrieved content — because a stored injection replays with your own store's trust in every future session. The bridge line: <b class="hl">a memory write is a privilege escalation</b>, so the write path is a security boundary, reviewed like one.</p>
    </div>

    <div class="impl">
      <div class="dlabel">episodic log &rarr; conversation/event stores + audit trails</div>
      <p>The dated, append-mostly episode log maps to conversation history tables and event stores — the substrate consolidation and reflection read from, and the audit trail you reach for when the agent "remembers" something odd. The bridge line: <b class="hl">episodic is the source of truth; everything else is a derived view</b> — rebuildable from it, and traceable back to it.</p>
    </div>

    <div class="qbox" style="margin-top:18px">
      <div class="dlabel">say this out loud</div>
      <p>Agent memory isn't a vector database — it's a <b class="hl">write path and a read path around one</b>. Writes gate on salience, dedupe into strength, supersede contradictions, tag provenance, and scope by user; reads score relevance-recency-importance and pack a budgeted window; consolidation keeps a living profile current; forgetting keeps retrieval clean and compliance honest. The products keep changing; those jobs don't.</p>
    </div>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "prodmap",
    label: "production map",
    type: "sheet",
    eyebrow: "reference · design-review bridge",
    title: "The production map",
    lead: "Every concept in this course, mapped to the construct that embodies it in a real agent stack — and the one sentence that bridges your theory answer to the system the interviewer's company actually runs.",
    html: mapHtml,
  });

  /* =========================================================
     2. CARDS — four flashcards (checked against content.js's
        fourteen to avoid duplicates)
     ========================================================= */
  CARDS.push(
    ["A vendor says their memory layer 'just works — agents remember automatically.' What do you ask?",
     "The write-path questions: what gets stored (salience gate?), from which sources (provenance?), how do duplicates and contradictions resolve (reinforce/supersede?), how is it scoped per user, and what does deletion actually delete (records, embeddings, derived facts?). If they can only demo retrieval, the hard half is missing."],
    ["When does long-term memory make an agent WORSE?",
     "When the write path is naive: stored noise crowds retrieval, stale facts answer with confidence, the assistant's own guesses come back as 'memories', and stored injections replay forever. An agent with no memory beats an agent with polluted memory — quality is a write-side property."],
    ["Interviewer: 'Design memory for a support agent with a million users.' First three sentences?",
     "Scope everything per user at the storage key. Split by type: episodic event log (append, salience-gated), semantic facts (upsert with supersession), a consolidated per-user profile injected every session, rules pinned. Then the read path: score relevance+recency+importance, pack a budgeted window, and reserve time for the deletion/compliance path."],
    ["The team wants to embed and store every raw conversation turn 'so nothing is lost.' What's the counter?",
     "Nothing is lost — and nothing is findable: every junk turn competes in every future top-k, duplicates blanket the slots, and PII you never needed sits unredacted in an index. Keep the raw log as an archive if you must; what enters the RETRIEVAL store must pass salience, dedupe, and extraction. Memory is curation, not capture."],
  );

})();
