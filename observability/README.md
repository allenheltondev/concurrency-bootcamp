# Observability Bootcamp

A mobile-first, dependency-free web app for learning and practicing
production debugging — built from the course pattern extracted in
`../docs/COURSE_PATTERN.md`, sharing the root course's engine, styles, and
animations. Everything runs in the browser: every drill's ▶ button executes a
**real simulated telemetry pipeline** (counter scrapes across restarts,
bucketed histograms, span trees, burn-rate windows) against its invariant,
and every write-it build actually runs in a sandboxed worker.

It opens with an illustrated **Lessons** primer (29 stepped chapters with
animated HTML/CSS/SVG diagrams — tap ▶ replay to watch each sequence step
through), starting with a four-lesson **foundations** arc built on the two
axioms that generate the whole field — you can't attach a debugger to
production, only interrogate telemetry emitted in advance; and aggregates
lie, because every signal is a lossy compression — through the three signals
and cardinality, then arcs on **metrics** (reset-proof counters and rate(),
gauges and the scrape gap, histograms as buckets, the p99 as an
interpolation, the aggregation trap, RED/USE), **tracing** (spans and the
trace tree, W3C traceparent context propagation, reading a waterfall, head vs
tail sampling, exemplars), **logging** (structured events, why WARN is where
signals die, the canonical log line, error-preserving log sampling), **SLOs &
alerting** (SLI/SLO/error budget, deriving the 14.4×/6× multi-window
burn-rate pager, symptom vs cause paging, alert fatigue as a system failure,
the release as prime suspect), **debugging production** (the
impact→when→where→why triage loop, dashboard forensics, correlated-failure
signatures), and **verifying observability** (telemetry assertions in CI,
game days).

Then the hands-on modules, one concept per animated lesson and one drill per
concept: **the 3am test** (read-the-incident quiz — predict what the
dashboards, alerts, and traces show), **primitives** (tap-to-choose drills
that run real reference code — reset-proof counter rate, bucket quantile
estimator, histogram merge, trace assembler, head sampler, burn-rate
calculator, canonical log line, series accountant), the **incident
simulator** (a seeded service graph — edge → api ×4 → db + cache — with one
hidden fault per run: read the sparkline dashboards, flip symptom vs cause
alerts, name the culprit), **trade-offs** flashcards, a **problem bank**
(pick-the-signal, find-the-culprit-hop, buckets for the SLO, design-the-page,
cardinality triage, the missing instrumentation, deploy correlation),
**spot-the-bug** (full implementations, one subtle fault, tap the line —
negative RPS after deploys, the sampler that shreds traces, the burn alert
that pages on blips), **write it** (assemble each implementation from a
shuffled line bank — graded by actually running it against assertions in a
sandboxed worker), a **stack map** reference sheet (every concept mapped to
the real construct — rate(), histogram_quantile, traceparent, the OTel
collector's tail sampling, Sloth-style burn alerts, canonical log lines —
with interview bridge lines), and **test mode** (quick test / full test /
25-minute interview sim, each ending in a build round; missed questions
persist to a review list).

Finally, `practice/` takes it off the phone and into your editor: seven
blank-file pattern skeletons (counter-rate, histogram, span-tree,
head-sampler, burn-rate, log-sampler, cardinality-budget) with runnable Node
tests and reference solutions — `node practice/counter-rate.test.mjs`,
implement until green, diff against the solution, redo from blank tomorrow.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup + all CSS (same design system as the root course). No build step. |
| `js/core.js` | Helpers, the simulated-telemetry reference implementations, and the demo runners. |
| `js/content.js` | Course config + authored content: modules, quiz, drills, cards, bugs, write-it, lessons 1–10, cross-links. |
| `js/sim.js` | The incident-simulator module (seeded PRNG, virtual time, symptom/cause alert toggle). |
| `js/packs/10-…, 20-…` | Lesson packs: tracing/logging and SLOs/debugging/verification arcs. |
| `js/packs/30-hunt-build.js` | The rest of spot-the-bug and write-it. |
| `js/packs/40-stack-map.js` | The stack map sheet and four flashcards. |
| `../js/app.js` | The shared course engine (see `../docs/COURSE_PATTERN.md`). |
| `practice/` | Blank-file pattern reps with runnable Node tests. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-first PWA shell, scoped to this directory. |

## Validate

From the repo root:

```bash
node tools/validate-content.mjs --root observability
node tools/test-solutions.mjs   --root observability
```

Both run in CI; a drill demo that fails its invariant, a write-it reference
that fails its own tests, or a broken practice pair cannot merge.

Progress is saved to `localStorage` under the `obs:` prefix — independent of
the other courses. Installable and fully offline after first load, with
optional sign-in + cloud sync via the shared `../js/account.js` (dormant
unless the deployment publishes `/auth-config.json`), same as the other
courses.
