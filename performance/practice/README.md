# Performance & Queueing Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview and
the capacity review actually ask for: **writing the pattern from a blank file,
test-driven, in a real editor.**

No dependencies. Node ≥ 20. Plain ESM. Everything runs in **virtual time** —
timestamps are numbers you pass around, arrivals come from arithmetic, and no
test ever asserts on the wall clock — so the suites are deterministic on any
machine, loaded or idle.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes** (run from the `performance/`
   directory):
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read
   the failure, it is written to teach ("a SHED request must not occupy the
   queue").
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

Learn them **foundations → the tail → load behavior → capacity**: get the
law and the curve first, then honest measurement, then the overload defenses,
then the budget math.

### Foundations — the law and the curve

- **little-law** — L = λW solved in all three directions (loud when
  unsolvable), plus the pool-sizing corollary λmax = N/W. No distribution
  assumptions; units are half the battle.
- **mm1-queue** — the virtual-time single-server simulator
  (`start = max(arrival, free)` is where queueing comes from) and the exact
  M/M/1 wait `W = S/(1−ρ)` — Infinity at ρ ≥ 1, never a negative number.

### The tail — honest measurement

- **histogram** — bucketed counts with conservative percentiles (report the
  bucket's UPPER bound; never under-report an SLO breach) and index-wise
  merging — the only valid way to aggregate percentiles across hosts.
- **ewma** — the smoother behind alerts and autoscaler signals: alpha is the
  NEW sample's weight, and the first sample seeds the average (the zero-seed
  and transposed-weight bugs both ship constantly).

### Load behavior — the overload defenses

- **load-shedder** — deadline-aware admission control: project finish time
  through the queue; shed what can't make it, instantly and free; shed
  requests never pollute the queue estimate.
- **aimd-limiter** — discover capacity instead of configuring it: +1 per
  full window of successes, HALVE on an overload signal, floor at 1 so the
  limiter can always probe its way back.

### Capacity — the budget math

- **retry-budget** — retries capped as a fraction of live first-try traffic,
  so offered load can never exceed (1 + ratio) × traffic during an outage.
  The subtle part is what NOT to write: retries never count into the base.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an
empty editor, because assembling from a line bank hides the two hardest
steps: recalling the *shape* and typing the *load-bearing detail* (the
`max(arrival, free)`, the `ceil` in the rank, the guard on the ρ = 1 pole,
the halving that outruns the overload, the denominator that only counts
first tries). The test is your pair; the blank file is the interview.
