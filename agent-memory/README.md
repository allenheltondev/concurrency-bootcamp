# Agent Memory Bootcamp

A mobile-first, dependency-free web app for learning and practicing **AI agent
memory** — built from the course pattern extracted in
`../docs/COURSE_PATTERN.md`, sharing the root course's engine, styles, and
animations. Everything runs in the browser: every drill's ▶ button executes a
**real simulated memory system** (token-budgeted buffers, deterministic
embeddings, superseding fact stores, an evolving profile) against its
invariant, and every write-it build actually runs in a sandboxed worker.

It opens with an illustrated **Lessons** primer (16 stepped chapters with
animated HTML/CSS/SVG diagrams — tap ▶ replay to watch each sequence step
through), starting with a **foundations** arc built on the two axioms that
generate the whole field — the model is stateless (every request starts from
nothing but the tokens you send) and the context window is finite — through
the memory hierarchy (session vs long-term; episodic / semantic / procedural),
session buffers and the token budget, and the rolling summary. Then arcs on
**retrieval** (embeddings as geometry, top-k and its failure modes, the
relevance + recency + importance score, assembling the context window),
**long-term memory** (the episodic event log and the salience gate, semantic
facts extracted at write time, contradiction & supersession, procedural
rules), and **evolution** — the arc the course is named for: **consolidation**
(episodic memories fold into one continuously-evolving aggregate profile —
repetition strengthens with a cap, contradiction supersedes with a reset),
**reflection** (batches of episodes distilled into insights), **forgetting on
purpose** (decay, capacity, eviction), and **the write path** (salience,
dedupe, provenance, memory poisoning).

Then the hands-on modules, one concept per animated lesson and one drill per
concept: **the model** (predict-what-it-remembers quiz), **primitives**
(tap-to-choose drills that run real reference code — session buffer, rolling
summary, top-k search, retrieval scoring, salience gate, fact upsert,
write-path dedupe), the **evolving profile** simulator (two weeks of episodes
stream in — flip consolidation on and off and watch what the next session
inherits), **trade-offs** flashcards, a **problem bank** (consolidation,
reflection triggers, forgetting policy, context assembly, the write-path
guard), **spot-the-bug** (full implementations, one subtle fault, tap the
line), **write it** (assemble each implementation from a shuffled line bank —
graded by actually running it against assertions in a sandboxed worker), a
**production map** reference sheet (every concept mapped to the construct
that embodies it in a real agent stack, with design-review bridge lines), and
**test mode** (quick test / full test / interview sim, each ending in a build
round; missed questions persist to a review list).

Finally, `practice/` takes it off the phone and into your editor: six
blank-file pattern skeletons (session buffer, memory index, retrieval score,
fact store, profile aggregator, forgetting policy) with runnable Node tests
and reference solutions — `node practice/session-buffer.test.mjs`, implement
until green, diff against the solution, redo from blank tomorrow.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup + all CSS (same design system as the root course). No build step. |
| `js/core.js` | Helpers, the simulated-memory reference implementations, and the demo runners. |
| `js/content.js` | Course config + authored content: modules, quiz, drills, cards, bugs, write-it, lessons 1–6, cross-links. |
| `js/sim.js` | The evolving-profile simulator module. |
| `js/packs/10-…, 20-…` | Lesson packs: retrieval/long-term and evolution arcs. |
| `js/packs/30-production-map.js` | The production map sheet and four flashcards. |
| `../js/app.js` | The shared course engine (see `../docs/COURSE_PATTERN.md`). |
| `practice/` | Blank-file pattern reps with runnable Node tests. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-first PWA shell, scoped to this directory. |

## Validate

From the repo root:

```bash
node tools/validate-content.mjs --root agent-memory
node tools/test-solutions.mjs   --root agent-memory
```

Both run in CI; a drill demo that fails its invariant, a write-it reference
that fails its own tests, or a broken practice pair cannot merge.

Progress is saved to `localStorage` under the `amem:` prefix — independent of
the other courses. No accounts required, no tracking; installable and fully
offline after first load, same as the other courses.
