# DFS & Recursive Traversal Bootcamp

A mobile-first, dependency-free web app for learning and practicing
depth-first search and recursive tree traversal — built from the course
pattern extracted in `../docs/COURSE_PATTERN.md`, sharing the root course's
engine, styles, and animations. Everything runs in the browser: every drill's
▶ button executes a **real traversal over a real nested menu** (with a node
counter that proves the short-circuit stopped early), and every write-it
build actually runs in a sandboxed worker against real assertions.

The course is built around one interview problem — **a nested restaurant menu
whose prices are inherited from ancestors** — and teaches DFS from first
principles on the way to it, assuming you write JavaScript comfortably but
have never had to say the word "preorder" out loud.

It opens with an illustrated **Lessons** primer (22 stepped chapters with
animated HTML/CSS/SVG diagrams — tap ▶ replay to watch each sequence step
through): a five-lesson **what DFS is** arc (visit, descend, backtrack; the
vocabulary mapped to the objects you'd write anyway; the exact visit order on
a six-node tree; why the call stack IS the DFS stack; and BFS in one screen,
with the rule for when to switch), a **traversal contract** arc (the base
case and what "not found" returns, the two-line short-circuit, and `findNode`
end to end with the narration to go with it), a **nested menu** arc (two
kinds of children, finding an item at any depth), the **inherited state** arc
the whole course points at (resolve the effective value at the node, use it
here, pass it down — plus the `??`-vs-`||` trap and the down-as-parameters /
up-as-return-values rule), and an **interview follow-ups** arc (all matches,
the path, flatten, price everything in one pass, the explicit stack, graphs
and cycles, indexing repeated lookups), closing on **complexity** (O(n) time,
O(h) stack, said properly) and **saying it before you code**.

Then the hands-on modules, one concept per animated lesson and one drill per
concept: **trace it** (predict-the-output quiz — run the recursion in your
head and say the answer before you tap), the **walkthrough** (step the real
traversal one frame at a time and watch the call stack grow and shrink, the
visit tape fill in DFS order, and — in menu mode — each frame's inherited and
resolved price), **primitives** (tap-to-choose drills that run real reference
code: the recursive descent, the base case, the short-circuit, the explicit
stack, the visited set), **the menu** (find an item at any depth, resolve the
effective price, carry state down, price every item in one pass),
**trade-offs** flashcards (the judgment calls and the sentences to say out
loud), a **follow-ups** bank (all matches, the path, flatten, DFS-or-BFS,
index the repeated lookups), **spot-the-bug** (full traversals, one subtle
fault, tap the line — the loop that only ever runs once, the `||` that bills
customers for free drinks, the breadcrumb that keeps the branches it failed
in), **write it** (assemble each implementation from a shuffled line bank —
graded by actually running it against assertions in a sandboxed worker, with
a hint after two failed runs and the reference body revealed only once you
pass), **say it out loud** (the interview script: the opening narration, the
six prompts to answer before writing a line, the complexity paragraph, and
the follow-up map), and **test mode** (quick test / full test / 25-minute
interview sim, each ending in a build round; missed questions persist to a
review list).

Finally, `practice/` takes it off the phone and into your editor: seven
blank-file skeletons (find-node, menu-find, menu-price, flatten-menu,
iterative-dfs, graph-dfs, menu-index) with runnable Node tests and reference
solutions — `node practice/menu-price.test.mjs`, implement until green, diff
against the solution, redo from blank tomorrow.

## The problem it prepares you for

```js
const menu = {
  name: "Lunch", price: 12,
  groups: [
    { name: "Appetizers", price: 6, items: [
        { id: "wings", name: "Wings", price: null },
        { id: "fries", name: "Fries", price: 4 } ], groups: [] },
    { name: "Entrees", price: null, items: [
        { id: "burger", name: "Burger", price: null } ], groups: [
        { name: "Salads", price: 8, items: [
            { id: "cobb",   name: "Cobb Salad",   price: 10 },
            { id: "garden", name: "Garden Salad", price: null } ], groups: [] } ] },
  ],
};

getItemPrice(menu, "wings");   // 6   — inherited from Appetizers
getItemPrice(menu, "burger");  // 12  — Entrees declined, so Lunch's price stands
getItemPrice(menu, "garden");  // 8   — the closest ancestor that declared one
getItemPrice(menu, "sushi");   // null
```

The idea the course is built to install: **DFS can carry state down.** At each
node, resolve the effective value for this level, use it on this level's
items, and recurse with it — the value travels down as a parameter, the answer
travels up as a return value.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup + all CSS (same design system as the other courses). No build step. |
| `js/core.js` | Helpers, the tree/menu/graph fixtures, every reference traversal, and the demo runners. |
| `js/content.js` | Course config + authored content: modules, quiz, drills, cards, bugs, write-it, lessons 1–8, cross-links. |
| `js/sim.js` | The walkthrough module — an instrumented DFS you step one frame at a time. |
| `js/packs/10-lessons-menu.js` | The nested menu and the inherited-state arc (lessons 9–13). |
| `js/packs/20-lessons-interview.js` | Follow-ups, complexity, and the narration (lessons 14–22). |
| `js/packs/30-hunt-build.js` | The follow-up drill bank, the rest of spot-the-bug, and the rest of write-it. |
| `js/packs/40-interview-script.js` | The "say it out loud" sheet, two more quiz questions, three flashcards. |
| `../js/app.js` | The shared course engine (see `../docs/COURSE_PATTERN.md`). |
| `practice/` | Blank-file pattern reps with runnable Node tests. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-first PWA shell, scoped to this directory. |

## Validate

From the repo root:

```bash
node tools/validate-content.mjs --root dfs
node tools/test-solutions.mjs   --root dfs
```

Both run in CI; a drill demo that fails its invariant, a write-it reference
that fails its own tests, or a broken practice pair cannot merge.

Progress is saved to `localStorage` under the `dfs:` prefix — independent of
the other courses. Installable and fully offline after first load, with
optional sign-in + cloud sync via the shared `../js/account.js` (dormant
unless the deployment publishes `/auth-config.json`), same as the other
courses.
