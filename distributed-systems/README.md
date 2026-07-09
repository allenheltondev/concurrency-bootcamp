# Distributed Systems Bootcamp

A mobile-first, dependency-free web app for learning and practicing
distributed systems — built from the course pattern extracted in
`../docs/COURSE_PATTERN.md`, sharing the root course's engine, styles, and
animations. Everything runs in the browser: every drill's ▶ button executes a
**real simulated cluster** (replicas, lossy links, zombie leaders) against its
invariant, and every write-it build actually runs in a sandboxed worker.

It opens with an illustrated **Lessons** primer (28 stepped chapters with
animated HTML/CSS/SVG diagrams — tap ▶ replay to watch each sequence step
through), starting with a four-lesson **foundations** arc built on the two
axioms that generate the whole field — the network is unreliable (lost,
delayed, duplicated, reordered) and there is no shared clock — through the
two-generals impossibility, then arcs on **time** (Lamport clocks, vector
clocks, the ordering ladder), **replication** (leaders & followers, quorums
R+W>N, read repair & anti-entropy), **consistency** (linearizability vs
eventual, CAP & PACELC), **delivery** (why exactly-once is a lie, idempotency,
the transactional outbox, queues & poison messages), **coordination** (failure
detection, leader election, split brain & fencing, the Raft intuition,
distributed locks & leases), **transactions** (two-phase commit, sagas),
**scale** (consistent hashing, backoff & jitter, circuit breakers & bulkheads
& hedging, timeout budgets), and **testing** distributed systems without
flakes.

Then the hands-on modules, one concept per animated lesson and one drill per
concept: **the model** (predict-the-outcome quiz), **primitives**
(tap-to-choose drills that run real reference code — Lamport clock, vector
clock, quorum write, failure detector, lease + fencing token, idempotent
consumer, hash ring, leader election), the **unreliable network** simulator
(clients retry payments through a lossy network — flip idempotency keys on and
off and watch the ledger), **trade-offs** flashcards, a **problem bank**
(saga, two-phase commit, outbox, fencing the zombie leader, gossip, read
repair, replicated-log commit, poison messages + DLQ), a **resilience kit**
(backoff + jitter, circuit breaker, hedged requests, timeout budgets,
bulkhead, quorum fan-out), **spot-the-bug** (full implementations, one subtle
fault, tap the line), **write it** (assemble each implementation from a
shuffled line bank — graded by actually running it against assertions in a
sandboxed worker), a **cloud map** reference sheet (every concept mapped to
the managed construct that embodies it, with interview bridge lines), and
**test mode** (quick test / full test / 25-minute interview sim, each ending
in a build round; missed questions persist to a review list).

Finally, `practice/` takes it off the phone and into your editor: eight
blank-file pattern skeletons (Lamport clock, vector clock, quorum store,
idempotent consumer, retry with backoff + jitter, circuit breaker, hash ring,
saga) with runnable Node tests and reference solutions —
`node practice/lamport-clock.test.mjs`, implement until green, diff against
the solution, redo from blank tomorrow.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup + all CSS (same design system as the root course). No build step. |
| `js/core.js` | Helpers, the simulated-cluster reference implementations, and the demo runners. |
| `js/content.js` | Course config + authored content: modules, quiz, drills, cards, bugs, write-it, lessons 1–7, cross-links. |
| `js/sim.js` | The unreliable-network simulator module. |
| `js/packs/10-…, 20-…` | Lesson packs: replication/consistency/delivery and coordination/transactions/scale arcs. |
| `js/packs/30-hunt-build.js` | The rest of spot-the-bug and write-it. |
| `js/packs/40-cloud-map.js` | The cloud map sheet, the testing lesson, and four flashcards. |
| `../js/app.js` | The shared course engine (see `../docs/COURSE_PATTERN.md`). |
| `practice/` | Blank-file pattern reps with runnable Node tests. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-first PWA shell, scoped to this directory. |

## Validate

From the repo root:

```bash
node tools/validate-content.mjs --root distributed-systems
node tools/test-solutions.mjs   --root distributed-systems
```

Both run in CI; a drill demo that fails its invariant, a write-it reference
that fails its own tests, or a broken practice pair cannot merge.

Progress is saved to `localStorage` under the `dsys:` prefix — independent of
the root course. No accounts, no tracking; installable and fully offline after
first load, same as the root course.
