# Observability Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview and
the design review actually ask for: **writing the pattern from a blank file,
test-driven, in a real editor.**

No dependencies. Node ≥ 20. Plain ESM. Nothing here imports anything you have
to install. Every telemetry system is simulated in-process — scrapes are
arrays of `{t, v}` samples, spans are plain objects, hashes stand in for
randomness — so the tests are deterministic and nothing depends on wall-clock
time, a collector, or an API key.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes** (run from the `observability/`
   directory):
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read the
   failure, it is written to teach ("an ERROR must be kept even on a trace id
   the sampler would drop").
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

Learn them **metrics → traces → logs → SLOs**: make the aggregates honest
first, then localize inside one request, then keep the evidence affordable,
then wire the pager to the promise.

### Metrics — aggregates you can trust

- **counter-rate** — reset-proof increase and per-second rate: a counter that
  drops didn't go backwards, it was reborn at zero — the post-reset value IS
  the increase. This rule is why deploy days don't show negative traffic.
- **histogram** — bucketed latency: LE bucket semantics, the quantile as a
  linear interpolation inside one bucket (the +Inf rank returns the largest
  finite bound), and merge-by-summing-counts — the only honest fleet p99.
- **cardinality-budget** — series = the PRODUCT of label cardinalities; a
  canonical sorted-key identity so reordered labels don't mint phantom
  series; greedy triage that sheds the widest label first.

### Traces — where inside THIS request

- **span-tree** — assemble a trace from an out-of-order bag of spans (root =
  the parentless span; orphans skipped, never fatal) and walk the
  last-finisher chain — the first-order critical path.
- **head-sampler** — the deterministic keep/drop decision: a pure function of
  the trace id, so every service reaches the same verdict alone and traces
  never fragment.

### Logs — evidence at a survivable price

- **log-sampler** — two rules in strict order: errors are ALWAYS kept (no
  dice), the happy path is sampled deterministically by trace id with
  `sample_rate` stamped on every survivor so totals can reweigh.

### SLOs — the pager, derived from the promise

- **burn-rate** — burn = error rate / (1 − SLO), and the canonical
  multi-window pager: 14.4× on (1h AND 5m), 6× on (6h AND 30m), 1× on
  (3d AND 6h) as a ticket. The AND is the design.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an
empty editor, because assembling from a line bank hides the two hardest steps:
recalling the *shape* and typing the *load-bearing detail* (the `d >= 0 ? d :
samples[i].v` reset rule, the `(rank - prev) / counts[i]` interpolation, the
error check that must run BEFORE the sampling dice, the `&&` joining the burn
windows). The test is your pair; the blank file is the interview.
