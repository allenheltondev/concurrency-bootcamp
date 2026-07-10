# Agent Memory Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview and
the design review actually ask for: **writing the pattern from a blank file,
test-driven, in a real editor.**

No dependencies. Node ≥ 20. Plain ESM. Nothing here imports anything you have
to install. Every "model call" is simulated in-process — embeddings are plain
vectors, timestamps are parameters, importance ratings are numbers — so the
tests are deterministic and nothing depends on wall-clock time or an API key.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes** (run from the `agent-memory/`
   directory):
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read the
   failure, it is written to teach ("a revised fact must not inherit the old
   streak — a revision is not a confirmation").
5. **Diff against the reference** once you pass:
   ```
   diff <(sed -n '/./p' practice/<name>.mjs) practice/solutions/<name>.mjs
   ```
   or just open `solutions/<name>.mjs` side by side. Note the ONE thing you
   missed or did the long way.
6. **Reset and re-do from blank tomorrow.** `git checkout practice/<name>.mjs`
   restores the skeleton. A pattern you can only assemble is not yet a pattern
   you can write; a pattern you can write cold, twice, on two different days,
   is yours.

Run the whole pack at once:

```bash
for f in practice/*.test.mjs; do node "$f"; done
```

## Layout

```
practice/
  README.md              this file
  _harness.mjs           sleep, deferred, and the suite() runner
  <name>.mjs             the skeleton you write into (signature + spec + "implement me")
  <name>.test.mjs        the runnable spec: node practice/<name>.test.mjs
  solutions/<name>.mjs   the reference — for diffing AFTER you pass, not before
```

The harness prints each `log` line, then `✓ PASS — <verdict>` or
`✗ FAIL — <message>`, sets a non-zero exit code on failure, and fails any
suite that hangs past 5s with a deadlock message. A skeleton you haven't
touched fails cleanly with a "not implemented yet" line — no stack-trace mess.

## The patterns, in learning order

Learn them **session → retrieval → long-term → evolution**: budget the window
first, then find things by meaning, then store durable truths, then make the
whole store evolve and forget.

### Session — the window is a budget

- **session-buffer** — token-budgeted message buffer; evict the oldest
  UNPINNED message, repeatedly, until the budget holds — the pinned system
  prompt never leaves, and one oversized turn can cost several evictions.

### Retrieval — finding memories by meaning, ranking them by more

- **memory-index** — cosine similarity (dot product on unit vectors) and
  top-k search: rank descending, cut at k — retrieval is a scored
  competition, and the classic silent bug is the sort direction.
- **retrieval-score** — relevance + recency + importance, weighted; recency
  is half-life decay DOWN from 1 (the classic inversion makes old memories
  win), importance normalizes 1-10 into [0,1] so the weights mean something.

### Long-term — durable truths that supersede

- **fact-store** — facts keyed by subject|attribute: added / confirmed /
  superseded. One question, one current answer; the old value is history,
  not a rival, and a revision resets the confirmation streak.

### Evolution — the aggregate that keeps up

- **profile-aggregator** — the evolving aggregate: each episodic memory folds
  in as learned / reinforced (capped, so beliefs stay overturnable) /
  revised (reset, so new beliefs stay humble). The profile is always current,
  always compact, and never forgets that it used to believe something else.
- **forgetting-policy** — a capacity-bounded store that evicts the LOWEST
  decayed score: pins score Infinity, touch() refreshes relevance, and the
  weakest candidate can be the newcomer itself.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an
empty editor, because assembling from a line bank hides the two hardest steps:
recalling the *shape* and typing the *load-bearing detail* (the `while` in the
trim loop, the `b.sim - a.sim`, the decay that runs down from 1, the
confidence reset on a revision, the `findIndex(m => !m.pin)`). The test is
your pair; the blank file is the interview.
