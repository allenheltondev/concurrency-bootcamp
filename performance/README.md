# Performance & Queueing Bootcamp ("Why Is It Slow")

A mobile-first, dependency-free web app for learning and practicing
performance engineering — built from the course pattern extracted in
`../docs/COURSE_PATTERN.md`, sharing the root course's engine, styles, and
animations. Everything runs in the browser: every drill's ▶ button executes a
**real queueing computation in virtual time** (seeded PRNG, no wall clock)
against its invariant, and every write-it build actually runs in a sandboxed
worker.

The whole course grows from two axioms: **every system is a queue** (or a
network of them — arrivals, service times, servers) and **latency explodes as
utilization approaches saturation**. "How will this behave at 10× traffic?"
is the senior-engineer question; this course replaces the vibes-based answer
with arithmetic.

It opens with an illustrated **Lessons** primer (26 stepped chapters with
animated HTML/CSS/SVG diagrams — tap ▶ replay to watch each sequence step
through), in five arcs: **foundations** (latency vs throughput, every system
is a queue, Little's law L = λW, utilization and the hockey stick
W = S/(1−ρ)), **the tail** (latency as a distribution, percentiles and why
you can't average them, fan-out tail amplification 1−(1−p)ⁿ, variability as
the queue's fuel, coordinated omission, histograms as the honest primitive),
**load behavior** (open vs closed loop load, goodput collapse and metastable
failure, deadline shedding, backpressure and bounded queues, FIFO vs LIFO
under overload, AIMD adaptive concurrency), **measurement** (benchmarking
lies, queue wait vs service time vs client-observed, USE and RED, on-CPU vs
off-CPU profiling, throughput-latency curves and the knee), and **capacity**
(capacity math from a measured knee, autoscaling lag and the backlog it owes,
retry amplification and budgets, caching as capacity and hit-ratio cliffs,
speed of light and batching).

Then the hands-on modules, one concept per animated lesson and one drill per
concept: **the model** (predict-the-behavior quiz — mental-math scenarios:
given arrival rate, service time, utilization, or fan-out, predict what
breaks), **primitives** (tap-to-choose drills that run real reference code —
Little's law solver, streaming histogram, EWMA, M/M/1 wait estimator, fan-out
tail amplifier, open-loop load generator, deadline shedder, AIMD limiter),
the **saturation simulator** (a single queue in virtual time — slide the
arrival rate toward the service rate and watch the queue and the p99 explode
as ρ→1; flip on load shedding and trade errors for a bounded tail),
**trade-offs** flashcards, a **problem bank** (diagnose the knee, retry-storm
math, the percentile-merging trap, coordinated-omission correction, queue
discipline under fire, autoscaling-lag sizing, cache hit-ratio capacity),
**spot-the-bug** (full implementations, one subtle fault, tap the line),
**write it** (assemble each implementation from a shuffled line bank — graded
by actually running it against assertions in a sandboxed worker), a
**production map** reference sheet (every concept mapped to the construct
that embodies it — Prometheus histograms, wrk2/k6, Envoy admission control,
Netflix concurrency-limits, CoDel, retry budgets, USE/RED — with interview
bridge lines), and **test mode** (quick test / full test / 25-minute
interview sim, each ending in a build round; missed questions persist to a
review list).

Finally, `practice/` takes it off the phone and into your editor: seven
blank-file pattern skeletons (histogram, EWMA, Little's law, M/M/1 queue sim,
deadline shedder, AIMD limiter, retry budget) with runnable Node tests and
reference solutions — `node practice/histogram.test.mjs`, implement until
green, diff against the solution, redo from blank tomorrow.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup + all CSS (same design system as the root course). No build step. |
| `js/core.js` | Helpers, the queueing-math reference implementations, and the demo runners. |
| `js/content.js` | Course config + authored content: modules, quiz, drills, cards, bugs, write-it, lessons 1–4, cross-links. |
| `js/sim.js` | The saturation simulator module (seeded M/M/1 in virtual time). |
| `js/packs/10-…40-…` | Lesson packs: the tail, load behavior, measurement, and capacity arcs. |
| `js/packs/50-hunt-build.js` | The rest of spot-the-bug and write-it. |
| `js/packs/60-production-map.js` | The production map sheet and four flashcards. |
| `../js/app.js` | The shared course engine (see `../docs/COURSE_PATTERN.md`). |
| `practice/` | Blank-file pattern reps with runnable Node tests. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-first PWA shell, scoped to this directory. |

## Validate

From the repo root:

```bash
node tools/validate-content.mjs --root performance
node tools/test-solutions.mjs   --root performance
```

Both run in CI; a drill demo that fails its invariant, a write-it reference
that fails its own tests, or a broken practice pair cannot merge.

The math holds itself to the same bar as the code: Little's law is used only
where its stability assumption holds, W = S/(1−ρ) is labeled as the exact
M/M/1 result (with the pole guarded), Kingman's formula is presented as the
approximation it is, and every percentile claim survives the merging test.

Progress is saved to `localStorage` under the `perf:` prefix — independent of
the other courses. No accounts required, installable, and fully offline after
first load, same as the root course.
