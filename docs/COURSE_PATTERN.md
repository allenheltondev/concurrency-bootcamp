# The course pattern

This repo started as one course (the JavaScript Concurrency Bootcamp at the
repo root) and now hosts a **course pattern**: a shared, course-agnostic engine
plus a recipe for authoring a complete new course — lessons with animated
diagrams, tap-driven drills, a simulator, flashcards, spot-the-bug,
write-it (with honest, sandboxed grading), scored test mode, review-your-misses,
PWA/offline support, and a `practice/` pack of blank-file exercises with
runnable Node tests.

This document is the extraction. Follow it top to bottom and you get a new
course that looks, animates, grades, and validates exactly like the original.
The reference implementation of the pattern is the repo-root course; the first
reproduction is `distributed-systems/`.

---

## 1. What is shared vs. per-course

**Shared (never fork these):**

| File | Role |
| --- | --- |
| `js/app.js` | The engine: state, persistence, rendering, stepper, write-it sandbox, test/review modes. Reads everything course-specific from shared globals. |
| `tools/validate-content.mjs` | Structural + behavioral validator. `--root <courseDir>` selects the course. |
| `tools/test-solutions.mjs` | Runs every practice suite against its reference solution. `--root <courseDir>`. |

**Per-course (each course directory owns a copy):**

| File | Role |
| --- | --- |
| `index.html` | Markup + ALL CSS (the design system) + the script-tag load order. No build step. |
| `js/core.js` | Tiny helpers (`sleep`, `deferred`, `rnd`), reference implementations, and the `demo*()` runners behind every "▶ run reference" button. |
| `js/content.js` | All authored content + the `COURSE` config + `MODULES` registry + cross-links. |
| `js/sim.js` (optional) | A course-owned custom module (a simulator), registered via `MODULES[].renderFn`. |
| `js/packs/*.js` | Content packs — self-contained additions loaded before the engine boots. |
| `practice/` | Blank-file skeletons + tests + `solutions/` + `_harness.mjs`. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | PWA shell (per-course cache name, scope, icon). |

The **root course** keeps its files at the repo root (deployed URLs must not
change). Every **new course** lives in its own directory (e.g.
`distributed-systems/`) with the same internal layout, and loads the shared
engine with `<script src="../js/app.js">`.

## 2. The engine contract

`js/app.js` boots last and reads these globals, all defined by the course's
`content.js` (+ packs):

```
COURSE          { id, storagePrefix }          config
MODULES         [ {id, label, type, ...meta} ] nav registry, order = chip order
LESSONS         [ {eb, title, html} ]          the "learn" module chapters
QUIZ            [ {code, options, answer, whys} ]
DRILLS          { <moduleId>: [drill, ...] }   one key per type:"drills" module
CARDS           [ [front, back], ... ]
BUGHUNT         [ bug, ... ]
WRITE           [ exercise, ... ]
DRILL_LESSON    { drillId -> lessonIndex }     skill -> concept backlink
LESSON_PRACTICE { lessonIndex -> {mod, drill?} } concept -> skill forward link
```

`COURSE.storagePrefix` namespaces localStorage (`<prefix>:solved`,
`<prefix>:position`, `<prefix>:misses`) so courses on one origin never collide.

**Module types** (`MODULES[].type`) and the metadata each entry carries:

| type | renders | metadata used |
| --- | --- | --- |
| `learn` | one lesson at a time + stepper + practice link | — |
| `lesson` | the predict-the-outcome quiz | `eyebrow,title,lead,sub,conceptLesson,cardNote,poolTitle,poolQuestion` |
| `drills` | fill-the-blank cards from `DRILLS[id]` | `eyebrow,title,lead` |
| `cards` | tap-to-flip flashcards | `eyebrow,title,lead,conceptLesson` |
| `bugs` | spot-the-bug | `eyebrow,title,lead,sub` |
| `write` | write-it (Parsons + real sandboxed tests) | `eyebrow,title,lead,sub` |
| `sheet` | a static reference page | `eyebrow,title,lead,html` |
| `test` | scored test / interview sim / review | `eyebrow,title,lead,sub` |
| `sim` / `custom` | course-owned renderer | `renderFn` — the NAME of a global function; the engine calls `globalThis[renderFn](moduleEntry)` |

A custom renderer (see `js/sim.js` in either course) may use the engine's
shared helpers — `el()`, `main`, `stepperRow()`, `conceptLinkRow()` — because
classic scripts share one global scope and rendering happens after everything
loads.

**Progress counting:** an item is "solved" when `state.solved[id]` is set. The
header total is `sum(DRILLS.*) + BUGHUNT + WRITE` — quiz and lessons track
position, not score. Every solvable id must be globally unique.

## 3. Script load order (index.html)

```html
<script src="js/core.js"></script>      <!-- helpers + references + demos -->
<script src="js/content.js"></script>   <!-- COURSE, MODULES, all content -->
<script src="js/sim.js"></script>       <!-- optional custom module(s) -->
<script src="js/packs/....js"></script> <!-- packs, in dependency order -->
<script src="../js/app.js"></script>    <!-- the shared engine, ALWAYS last -->
```

A pack that **prepends** lessons (like the root course's `foundations.js`)
must load before every other pack and must renumber lesson `eb`s and shift
`DRILL_LESSON` values, `LESSON_PRACTICE` keys, and `MODULES[].conceptLesson`.
Packs that **append** number themselves off `LESSONS.length` and need no
fix-ups. Note the validator loads packs alphabetically — if load order
matters, name packs so alphabetical order matches the index.html order.

## 4. Data schemas (the authoring contract)

Authoring rule for every multiple-choice structure: **write the correct option
first** (readability while authoring); the engine permutes options on every
load and re-shuffles in test mode, tracking `answer`. `whys` is parallel to
`options` and every entry — right or wrong — must explain itself in 1–3
sentences. Wrong answers teach; they never just say "incorrect."

### LESSONS (see §5 for the visual conventions)

```js
{ eb: "lesson 07 · replication",   // eyebrow: number · arc name
  title: "Quorums: R + W > N",
  html: `...` }                     // the lesson body (see §5)
```

### QUIZ — predict the outcome

```js
{ code: `...`,                      // shown in a <pre class="code">; any scenario text/code
  options: ["...", "...", "..."],   // 3 is the norm
  answer: 0,
  whys: ["Right. ...", "...", "..."] }
```

### DRILLS — fill the blank, then run the reference

```js
{ id: "quorum",                     // globally unique; keys state.solved
  title: "Quorum read/write",
  why: "one-line hook shown as // comment",
  demo: demoQuorum,                 // from core.js; MUST return {lines:[{t}],pass:true,verdict}
  pre: `...code before the blank...`,
  blank: {
    q: "Sharp, scenario-style question naming the failure the wrong options cause?",
    options: [`...correct...`, `...plausible trap...`, `...plausible trap...`],
    answer: 0,
    whys: ["Right. ...", "...names the bug this causes...", "..."] },
  post: `...code after the blank...` }
```

The `demo()` functions are the honesty layer: each runs the real reference
implementation and asserts its invariant, and the validator fails CI if any
demo doesn't pass.

### CARDS — `[front, back]` string pairs. Judgment calls, not trivia.

### BUGHUNT — full implementation, tap the faulty line(s)

```js
{ id: "bug_quorum", title: "Quorum KV store", why: "hook", lesson: 12,
  scenario: "How it misbehaves in production — the symptom, not the cause.",
  lines: ["class QuorumStore {", "  ...", "}"],   // exact source lines; "" = spacer
  bug: [19],                                      // 0-based indices into lines
  explain: "Names the line, the mechanism, and the fix." }
```

The fault must be **subtle and singular** — a `>=` for a `>`, an `if` for a
`while`, a missing re-check after an await — and the code otherwise correct.

### WRITE — assemble from a line bank; graded by actually running it

```js
{ id: "w-quorum", title: "Quorum write — write it", why: "hook", lesson: 12,
  spec: "What to build and the invariant it must hold.",
  pre: `function quorumWrite(replicas, key, value) {`,   // scaffold above the build area
  post: `}`,                                             // scaffold below
  lines: ["  ...", ...],            // the reference body, in order, ≥3 lines
  distractors: [                    // plausible traps; each explains itself on failure
    { code: "  ...", why: "The precise failure this line causes." }, ...],
  test: `...appended after the assembled code in the sandbox...`,  // log()/assert()/sleep()/deferred()
  pass: "verdict line shown on PASS",
  takeaway: "the one idea to keep",
  hint: "shown after 2 failed runs" }
```

The sandbox is a throwaway Web Worker with a 3s kill switch, so deadlocks
time out instead of freezing the page. The test source must be self-contained
(no course globals) and deterministic — script orderings with `deferred()`
gates and flush points, never wall-clock guesses. The validator executes
`pre + lines + post` against `test` in CI — the reference must pass its own
assertions.

### Cross-links

- `DRILL_LESSON[drillId] = lessonIndex` puts a "Concept: …" backlink on a
  drill/bug/write card (bugs and writes carry their own `lesson` field).
- `LESSON_PRACTICE[lessonIndex] = {mod, drill?}` puts a "Check yourself"
  forward link on a lesson.
- The lesson must **teach** and the linked skill must **probe from a different
  angle** (diagnose a symptom, pick for a new requirement) — never mirror
  each other.

## 5. The design system + animation conventions

All CSS lives in `index.html`. Copy it verbatim for a new course — the palette
is the brand: `--ordered` green = correct/in-order, `--race` orange =
lost/contention/wrong, `--accent` purple = interactive. Dark only,
mobile-first (600px column), one-thumb tap targets (≥38px), `--ease`
spring curve everywhere.

Lesson bodies compose from these classes (all defined in index.html):

- `p.big` opening claim → `b.hl` highlights → `.diagram` → `.impl` (paired
  reference code) → closing `<p><b class="hl">Why it matters:</b> …</p>`.
- **Diagrams**: `.diagram.anim` container, `.dlabel` caption, then any of:
  `.dcols/.dcol` columns, `.lanes` (+`.lanehead/.lstep[.bad|.good|.wait]`)
  for interleaving timelines, `.chip2[.micro|.macro|.sync]` chips,
  `.memcell`, `.threadbox`, `.permits/.permit`, `.histtape`, `.qbox`.
- **Staggered reveal**: give elements `class="seq"` (or `seq pop`) and
  `style="--i:N"`; when the container has `.anim` and gains `.playing`, item N
  animates in at `N × --step` (default .6s; override with `style="--step:.85s"`
  on the container). Auto-plays on view; a `<button class="playbtn" data-play>`
  replays.
- **Continuous motion**: inline SVG (`.estage`/`.elsvg`) with SMIL —
  `animateMotion` with `keyTimes/keyPoints` for tokens moving between boxes,
  `<animate attributeName="opacity">` for value changes, `dur` 5–6s,
  `repeatCount="indefinite"`. Use the palette hex values directly in SVG:
  `#8e86f0` (accent), `#57e0b0` (ordered), `#ff9a6b` (race), `#11131c` boxes,
  `#2c3350` lines, `#e7e9f3`/`#8b90ab` text.
- Escape HTML inside lesson `html` (`&rarr;`, `&middot;`, `&lt;`); code samples
  in `<pre class="code">` may use `<span class="cm">` comments, `.kw`, `.ok`.

Every lesson gets **one** animated diagram minimum; every concept that the
drills test gets a lesson.

## 6. Voice

Second person, present tense, confident, compressed. Every wrong tap explains
itself. Name invariants out loud ("the lock is never observably free while a
waiter exists"). Scenario-first questions ("Run this under load and …
— which line?"). Interview framing where it fits. Lowercase mono UI labels;
sentence-case headings; em-dashes; no emoji.

## 7. The practice pack

Off-phone transfer layer: for each pattern worth rebuilding cold, three files —

- `practice/<name>.mjs` — skeleton: doc comment stating INVARIANT / EDGE
  cases, exported class/function whose bodies `throw new Error("implement me")`.
- `practice/<name>.test.mjs` — imports `./_harness.mjs` (`suite`, `sleep`,
  `deferred`) and `./<name>.mjs`; asserts the invariant deterministically;
  ends by returning a verdict string. The harness prints ✓/✗, kills hangs at
  5s with a deadlock message, and forces a clean exit code.
- `practice/solutions/<name>.mjs` — the reference. CI stages it over the
  skeleton slot and runs the suite; both directions must pair up.

The rep protocol (README): implement until green, diff against the solution,
redo from blank tomorrow.

## 8. Validation + CI + catalog

Per course, CI runs:

```
node --check <every .js>                                  # parse gate
node tools/validate-content.mjs --root <courseDir>        # content gate
node tools/test-solutions.mjs   --root <courseDir>        # practice gate
```

plus a check that `sw.js` precaches every `js/**/*.js` in the course. The
service worker: bump `CACHE` on every content change; SHELL lists every file
the course needs offline (including `../js/app.js` for subdirectory courses —
same-origin, cacheable).

Register the course in `backend/data/courses.json`:

```json
{ "id": "distributed-systems", "title": "…", "description": "…",
  "status": "active", "contentVersion": 1,
  "totalItems": "auto", "contentRoot": "distributed-systems" }
```

`totalItems: "auto"` makes the seeder compute the real solvable count from the
course content — the catalog can never drift from the app.

Deployment: add the course directory to the **Upload site to S3** step in
`.github/workflows/deploy.yml` (it is the single source of truth for what
ships).

## 9. Reproduction checklist

1. `mkdir <course>/` → copy `index.html` (rebrand: title, meta, header brand,
   tagline, progress label), `manifest.webmanifest` (name/scope/start_url),
   `icon.svg`, `sw.js` (new cache name + SHELL).
2. Write `js/core.js`: helpers + reference implementations + one `demo*()` per
   drill, every demo returning `{lines, pass:true, verdict}`.
3. Write `js/content.js`: `COURSE`, `MODULES` (with per-module copy), `QUIZ`,
   `DRILLS`, `CARDS`, `BUGHUNT`, `WRITE`, `LESSONS`, `DRILL_LESSON`,
   `LESSON_PRACTICE`.
4. Optional `js/sim.js` custom module + `js/packs/*.js`.
5. `practice/` pack (harness + triples).
6. Wire CI, sw precache check, catalog entry, deploy upload, README.
7. `node tools/validate-content.mjs --root <course>` and
   `node tools/test-solutions.mjs --root <course>` until green — the validator
   executing every reference against its own tests is what keeps a big
   authored content set honest.
