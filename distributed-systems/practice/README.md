# Distributed Systems Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview
actually asks for: **writing the pattern from a blank file, test-driven, in a
real editor.**

No dependencies. Node ≥ 20. Plain ESM. Nothing here imports anything you have
to install. Every "node", "replica", and "network" is simulated in-process —
the tests inject clocks, wait functions, and orderings, so nothing depends on
wall-clock time.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes** (run from the `distributed-systems/`
   directory):
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read the
   failure, it is written to teach ("a stale record overwrote a newer one —
   replicas must keep the highest version").
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

Learn them **time → data → resilience → transactions**: order events first,
then replicate and route the data, then survive the failures, then coordinate
work you can't make atomic.

### Time — ordering events without a shared clock

- **lamport-clock** — one scalar counter; `recv` is max(local, remote) + 1, so
  every receive lands strictly after its send — even when the receiver is
  ahead of the sender.
- **vector-clock** — one counter per node; merge element-wise max THEN count
  your own slot, and `vcCompare` detects the concurrency a Lamport clock
  flattens away.

### Data — replication, delivery, placement

- **quorum-store** — N replicas, W write acks, R read replies; R + W > N
  forces the read to overlap the write, and the highest version wins.
- **idempotent-consumer** — at-least-once delivery in, effectively-once effect
  out: dedupe by message id, forever.
- **hash-ring** — consistent hashing with virtual nodes; removing a node moves
  only its arc, and adding it back restores the mapping exactly.

### Resilience — surviving a flaky dependency

- **retry-backoff** — exponential `base * 2^(attempt-1)` capped at `cap`, full
  jitter via injected `random`, waits via injected `wait` — time is a
  parameter, not a side effect.
- **circuit-breaker** — closed → open at a streak of failures; open fails fast
  WITHOUT touching the dependency; half-open lets one probe decide.

### Transactions — atomicity you have to build yourself

- **saga** — local steps paired with compensations; on failure, undo the
  completed prefix in reverse and leave the failed step alone.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an empty
editor, because assembling from a line bank hides the two hardest steps: recalling
the *shape* and typing the *load-bearing detail* (the max-then-+1, the
`Promise.allSettled` before counting, the `>=` in last-writer-wins, the
reverse unwind). The test is your pair; the blank file is the interview.
