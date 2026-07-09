# Concurrency Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview
actually asks for: **writing the pattern from a blank file, test-driven, in a
real editor.**

No dependencies. Node ≥ 20. Plain ESM. Nothing here imports anything you have
to install.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes:**
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read the
   failure, it is written to teach ("the lock looked free for an instant — a
   barger got in").
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
suite that hangs past 5s with a deadlock message (a parked await with nobody
left to wake it). A skeleton you haven't touched fails cleanly with a "not
implemented yet" line — no stack-trace mess.

## The patterns, in learning order

Learn them **primitives → patterns → toolkit**: build the locks first, then the
problems you solve with them, then the everyday async utilities.

### Primitives — the parked-promise skeleton

- **mutex** — a direct-handoff lock; one holder at a time, never observably
  free while a waiter exists.
- **async-queue** — producer/consumer handoff; every item delivered exactly
  once, FIFO, `pop()` parks when empty.
- **abortable-semaphore** — N permits where an `AbortSignal` cancels a waiting
  `acquire()` without leaking a permit or waking a ghost.

### Patterns — problems built from primitives

- **pool** — `mapPool(items, limit, fn)`: bounded concurrency via a shared
  cursor, results in input order.
- **token-bucket** — a rate limiter: burst up to capacity, then a capped drip;
  deny at zero.
- **ordered-merge** — `OrderedMerger`: k-way merge of timestamped streams under
  a watermark; an open, silent producer stalls the flush.
- **reorder-buffer** — `Reorderer`: hold out-of-order arrivals, release the
  contiguous prefix (a `while`, not an `if`).

### Toolkit — the everyday async utilities

- **debounce** — trailing edge; a burst collapses to one run with the last args.
- **throttle** — leading edge; run at most once per interval.
- **promise-all** — from scratch: input order preserved, first rejection wins,
  empty input handled.
- **promise-any** — from scratch: first fulfillment wins, all-rejected →
  `AggregateError` with errors in input order.
- **retry** — bounded retry with exponential backoff; `await` inside the `try`.
- **dedupe** — share one in-flight promise per key; evict on settle.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an empty
editor, because assembling from a line bank hides the two hardest steps: recalling
the *shape* and typing the *load-bearing detail* (the direct handoff, the
`await` inside the `try`, the store-by-index). The test is your pair; the blank
file is the interview.
