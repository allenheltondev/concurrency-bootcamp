# DFS & Recursive Traversal Bootcamp — the practice pack

The app trains **recognition** (spot the bug) and **assembly** (tap the lines
into place). This directory trains the last motion, the one the interview
actually asks for: **writing the traversal from a blank file, test-driven, in
a real editor.**

No dependencies. Node ≥ 20. Plain ESM. Nothing here imports anything you have
to install. Every structure is a plain object literal defined inside the test
— an n-ary tree, a nested menu, an adjacency map — so the suites are
deterministic and nothing depends on wall-clock time, a network, or an API
key.

## The rep

One pattern, one 25-minute rep:

1. **Pick a pattern** — go in the learning order below, or grab the one that
   burned you last time.
2. **Start a 25-minute timer.** The clock is the point: the interview is timed.
3. **Open the skeleton** (`<name>.mjs`). It gives you the exact signature, an
   invariant-first spec comment, and `throw new Error("implement me")` bodies.
   Do not open the solution.
4. **Implement until the test passes** (run from the `dfs/` directory):
   ```
   node practice/<name>.test.mjs
   ```
   Green is `✓ PASS`. Red tells you exactly which invariant you broke — read
   the failure, it is written to teach ("a declared price of 0 must be
   inherited, not treated as unset").
5. **Say it out loud while you type.** Not optional here: the module that
   grades this skill in the app is called "say it out loud" for a reason.
   Name the shape, the base case, what travels down, and the complexity, the
   way you would with someone watching.
6. **Diff against the reference** once you pass:
   ```
   diff <(sed -n '/./p' practice/<name>.mjs) practice/solutions/<name>.mjs
   ```
   or just open `solutions/<name>.mjs` side by side. Note the ONE thing you
   missed or did the long way.
7. **Reset and re-do from blank tomorrow.** `git checkout practice/<name>.mjs`
   restores the skeleton. A traversal you can only assemble is not yet one you
   can write; one you can write cold, twice, on two different days, is yours.

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
suite that hangs past 5s. A skeleton you haven't touched fails cleanly with a
"not implemented yet" line — no stack-trace mess.

## The patterns, in learning order

Go **tree → menu → inherited state → follow-ups**: get the traversal
reflexive first, then the interview's real shape, then the idea the whole
problem is built to test, then the questions that come after it works.

### The traversal itself

- **find-node** — DFS over an n-ary tree with a real short-circuit: capture
  the recursive result, return it only on a hit, and let a miss advance to the
  next sibling. The suite counts nodes entered, so the early return is proved
  rather than claimed — and `findAllNodes` shows what deleting it costs.

### The interview's shape

- **menu-find** — the same traversal over a menu with **two kinds of
  children** (items are leaves, groups recurse), plus the path to the item.
  `|| []` guards because real payloads omit empty arrays; `concat` for the
  trail so a failed branch leaves nothing behind.

### DFS with inherited state — the one that matters

- **menu-price** — prices declared at any level, inherited by the closest
  ancestor that declared one. Resolve at the node, use it on this level's
  items, pass it down. `??` and not `||`, `!== null` and not truthiness,
  because a $0 promo price is real. `priceEveryItem` is the same walk with an
  accumulator — one pass, not one search per item.
- **flatten-menu** — two carried values (price and path) and one accumulator,
  in a single traversal, emitting rows in menu order. Name the cost honestly:
  O(n) nodes visited, plus O(h) per row to copy its path — O(n·h) with the
  output.

### The follow-ups

- **iterative-dfs** — recursion converted to an explicit stack. `pop()` takes
  the newest, so children are pushed **reversed**; carried state is pushed
  alongside each node, because the call stack is no longer holding it. Proved
  on a chain 50,000 deep, where the recursion would die.
- **graph-dfs** — when a group can appear twice or link back upward. One
  `visited` Set, checked and marked on **entry**, never unmarked → O(V+E).
  Then `hasCycle`, which needs the *other* set — the one that IS unmarked on
  the way out, because a diamond is not a cycle.
- **menu-index** — preprocess once, answer in O(1): O(n + k) instead of
  O(k·n). The suite counts traversals, so a lookup that secretly walks the
  menu fails — and `rebuild()` is in the spec because the real cost of an
  index is invalidation, not the build.

## Why blank-file reps

You can pass every tap-to-assemble drill in the app and still freeze at an
empty editor, because assembling from a line bank hides the two hardest steps:
recalling the *shape* and typing the *load-bearing detail* (the
`const found = ...; if (found) return found;` pair, the `node.price ??
inherited` that must be passed down and not the value you received, the
reversed push order, the `visited.add` that belongs on entry). The test is
your pair; the blank file is the interview.
