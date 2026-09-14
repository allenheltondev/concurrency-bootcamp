"use strict";
/* DFS & Recursive Traversal Bootcamp — authored content: course config,
   module registry, quiz, drills, flashcards, spot-the-bug cards, write-it
   exercises, lessons, cross-links.

   CONTENT PACKS: js/packs/*.js load AFTER this file and BEFORE the shared
   engine (../js/app.js). A pack appends content by pushing into these
   collections (LESSONS, QUIZ, DRILLS.<module>, CARDS, BUGHUNT, WRITE, MODULES)
   and registering cross-links in DRILL_LESSON / LESSON_PRACTICE.

   LESSON PLAN (final indices — the lesson packs MUST keep this order):
     content.js  0-7    what DFS is (0-4) + the traversal contract (5-7)
     pack 10     8-12   the nested menu (8-9) + DFS with inherited state (10-12)
     pack 20     13-21  interview follow-ups (13-19) + complexity (20)
                        + saying it out loud (21)
   Cross-links below reference these final indices. */

/* course config: the engine reads storage keys and defaults here */
const COURSE = {
  id: "dfs",
  storagePrefix: "dfs",
};

const MODULES = [
  { id:"learn", label:"lessons", type:"learn" },
  { id:"trace", label:"trace it", type:"lesson",
    eyebrow:"module 00", title:"Trace the recursion", conceptLesson:2,
    cardNote:"predict the output before you read the options",
    poolTitle:"Trace the recursion", poolQuestion:"What does this traversal produce?",
    lead:`One idea generates this whole course: <b style="color:var(--text)">visit a node, finish one branch completely, back out, take the next</b>. Everything else — short-circuits, inherited prices, paths, explicit stacks — is that walk with one more thing carried along. Here you do what the interviewer does: run the code in your head and say the answer before you tap.`,
    sub:`Predict each result before you tap. One at a time — answer, read why, then step on.` },
  { id:"walk", label:"walkthrough", type:"sim", renderFn:"renderDfsWalk",
    eyebrow:"module 01", title:"The walkthrough", conceptLesson:2 },
  { id:"primitives", label:"primitives", type:"drills",
    eyebrow:"module 02", title:"Build the traversal",
    lead:`The five moves every DFS is assembled from: the recursive descent, the base case, the short-circuit, the explicit stack, and the visited set. Each is two or three lines, and each has exactly one wrong version that interviewers have seen a hundred times. Choose the correct line, then run the reference and watch the node counter prove it.` },
  { id:"menu", label:"the menu", type:"drills",
    eyebrow:"module 03", title:"The nested menu",
    lead:`The interview problem, drilled piece by piece: a menu whose groups nest arbitrarily deep, whose children come in two kinds, and whose prices can be declared at any level and inherited by everything below. Find the item; resolve the price; price the whole menu in one pass.` },
  { id:"tradeoffs", label:"trade-offs", type:"cards",
    eyebrow:"module 04", title:"Trade-offs", conceptLesson:21,
    lead:`No code here — the judgment calls and the sentences to say out loud. Tap to flip, then advance. Rehearse until the answer arrives before the interviewer finishes the question.` },
  { id:"bank", label:"follow-ups", type:"drills",
    eyebrow:"module 05", title:"Interview follow-ups",
    lead:`"Nice. Now return all of them." "Now give me the path." "Now do it without recursion." "What if a group can appear under two parents?" The follow-ups are the real interview — the first function was just the setup. Each one is the same walk with one thing changed.` },
  { id:"bughunt", label:"spot the bug", type:"bugs",
    eyebrow:"module 06", title:"Spot the bug",
    lead:`A complete traversal with one scenario describing how it misbehaves, and one subtle fault hiding in the code. Every fault here is one someone shipped: a recursive call whose result is returned instead of checked, a <code>||</code> where a <code>??</code> belonged, a path array nobody popped.`,
    sub:`Reading a traversal and finding the fault is the review skill and the debugging skill at once. Read the symptom, scan the code, tap the line(s), then check.` },
  { id:"write", label:"write it", type:"write",
    eyebrow:"module 07", title:"Write it",
    lead:`No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the function, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.`,
    sub:`This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. Stuck twice? A hint appears. A runaway recursion just times out — the sandbox can't freeze the page.` },
  { id:"test", label:"test yourself", type:"test",
    eyebrow:"test yourself", title:"Test mode",
    lead:`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`,
    sub:`Prep tip: once you can pass these cold, rebuild <code>getItemPrice</code> in a blank file while narrating it out loud. That narration is the thing the interview actually grades.` },
];

/* ---- trace module: predict-the-output quiz ---- */
const QUIZ = [
  { code:`const tree = {
  name: "root",
  children: [
    { name: "A", children: [
      { name: "A1", children: [] },
      { name: "A2", children: [] } ] },
    { name: "B", children: [
      { name: "B1", children: [] } ] },
  ],
};

function walk(node) {
  console.log(node.name);
  for (const c of node.children) walk(c);
}
walk(tree);`,
    options:["root, A, A1, A2, B, B1",
             "root, A, B, A1, A2, B1",
             "A1, A2, A, B1, B, root"],
    answer:0,
    whys:[
      "Right. Log the node, then hand control to the first child and don't come back until that entire branch is exhausted. A finishes — A1, A2, and the backtrack out of both — before B is looked at even once. That is depth-first: one branch completely, then back out, then the next.",
      "That's breadth-first: every node at depth 1 before any node at depth 2. You'd get it by replacing the call stack with a queue and taking from the front. Recursion can't produce it — a recursive call goes all the way down before the loop advances to the next sibling.",
      "That's postorder — the same walk, but logging on the way back OUT (`for (...) walk(c)` first, then the log). Useful when a node's answer depends on its children (sizes, sums, deletions). Here the log comes first, so every node is announced on the way in."] },

  { code:`let visits = 0;

function findNode(root, target) {
  if (!root) return null;
  visits++;
  if (root.name === target) return root;
  for (const c of root.children) {
    const found = findNode(c, target);
    if (found) return found;
  }
  return null;
}

// tree is the 6-node tree above
findNode(tree, "A1");
console.log(visits);`,
    options:["3 — root, A, A1, and then it unwinds without touching B's branch",
             "6 — recursion always walks the whole structure before it can return",
             "4 — it must also check A2 to be sure A1 was the match"],
    answer:0,
    whys:[
      "Right. `if (found) return found` is the short-circuit: the moment a subtree hands back a node, this frame returns it instead of continuing its loop, and every frame above does the same. Three nodes entered, three frames unwound, B never touched. Worst case is still O(n) — but the average interview input is not the worst case, and the interviewer is listening for that line.",
      "That's what happens if you write `findNode(c, target)` without checking the result, or collect into an array instead of returning. The recursion CAN stop early; a `return` inside the loop is what stops it.",
      "Nothing forces a sibling check — names here are unique and the contract is 'return the first match in DFS order'. A2 would only be visited if A1's subtree had returned null. If duplicate names were possible, the interviewer would be asking for all matches, which is a different function."] },

  { code:`function findNode(root, target) {
  if (!root) return null;
  if (root.name === target) return root;
  for (const c of root.children) {
    return findNode(c, target);   // <-- note
  }
  return null;
}

console.log(findNode(tree, "B1"));`,
    options:["null — the loop returns on its FIRST child, so B's branch is never reached",
             "the B1 node — the loop keeps going until some child returns a match",
             "undefined — a return inside a for-of loop is a syntax error"],
    answer:0,
    whys:[
      "Right, and this is the single most common DFS bug. `return` inside the loop hands back whatever the FIRST child's subtree said — null, in this case — and every later sibling is abandoned. The loop body runs exactly once, ever. The fix is two lines: capture the result, return it only if it's truthy.",
      "That's the behavior of the correct version (`const found = ...; if (found) return found;`). Written like this, the loop has no second iteration to reach: `return` exits the whole function, not just this pass.",
      "It's perfectly legal JavaScript — which is exactly why this bug survives code review. It parses, it runs, and it returns the right answer whenever the target happens to live in the first branch. Your test tree is usually that tree."] },

  { code:`// the same 6-node tree, but with a QUEUE
function walk(root) {
  const q = [root];
  while (q.length) {
    const node = q.shift();
    console.log(node.name);
    for (const c of node.children) q.push(c);
  }
}
walk(tree);`,
    options:["root, A, B, A1, A2, B1 — shift() takes from the front, so it goes level by level",
             "root, A, A1, A2, B, B1 — a stack and a queue visit a tree in the same order",
             "root, B, B1, A, A2, A1 — the children come back out reversed"],
    answer:0,
    whys:[
      "Right. One character decides the whole algorithm: `shift()` (take the oldest) drains a level before descending, `pop()` (take the newest) dives. Same code, same tree, same O(n) — BFS finds the SHALLOWEST match first (which is why it's the shortest-path traversal) and pays O(width) memory for the frontier. DFS pays O(height).",
      "They visit the same NODES, never in the same ORDER. A stack is LIFO — the child you pushed last comes back first, so you plunge. A queue is FIFO — you finish the generation you're on. If order didn't matter, the distinction wouldn't exist.",
      "Reversal is what you'd get from an explicit STACK (`pop()`) with children pushed in natural order: root, B, B1, A, A2, A1. It's the classic tell that you converted recursion to a stack without reversing the pushes."] },
];

/* ===========================================================
   DRILLS — fill the blank, then run the reference
   =========================================================== */
const DRILLS = {
  primitives:[
    { id:"visitorder", title:"The recursive descent", why:"one branch completely, then back out, then the next", demo:demoVisitOrder,
      pre:`// an n-ary tree: every node has a name and any number
// of children. walk it and collect names in DFS order.
function preorder(node, out = []) {
  out.push(node.name);          // visit on the way IN`,
      blank:{ q:"The interviewer wants root, A, A1, A2, B, B1. Which line finishes each branch before starting the next?",
        options:[
`  for (const child of node.children) preorder(child, out);`,
`  out.push(...node.children.map(c => c.name));
  for (const child of node.children) preorder(child, out);`,
`  const queue = [...node.children];
  while (queue.length) preorder(queue.shift(), out);`],
        answer:0,
        whys:["Right. The recursive call doesn't return until the child's entire subtree is done, so the loop can't advance to B until every descendant of A has been visited. That blocking property IS depth-first — you don't implement the backtracking, the call stack does it for you when each frame returns.",
              "Announcing the children before descending gives you root, A, B, A, A1, A2, … — names appear twice and the order is neither depth-first nor breadth-first. A node is visited in exactly one place: at the top of its own frame.",
              "Draining a queue of children still recurses into each one fully, so this produces the same order as the plain loop — with a pointless array copy per node, and a shape that will confuse anyone reading it (a queue that isn't doing breadth-first anything). Use the loop."] },
      post:`  return out;
}
// postorder = move the push AFTER the loop: A1, A2, A, B1, B, root` },

    { id:"basecase", title:"The base case", why:"the recursion has to stop, and 'not found' is a value", demo:demoBaseCase,
      pre:`// findNode returns the matching node, or null if the
// name appears nowhere in the tree.
function findNode(root, targetName) {`,
      blank:{ q:"The interviewer asks 'what's your base case?' — which first line answers it without inventing a special case for leaves?",
        options:[
`  if (!root) return null;`,
`  if (!root.children.length) return root.name === targetName ? root : null;`,
`  if (!root) throw new Error("node not found");`],
        answer:0,
        whys:["Right. Guard the one thing that can't be walked — a missing node — and let the empty `children` array end the recursion by itself: a for-of over `[]` runs zero times, the function falls through to `return null`, and the frame pops. That's why n-ary DFS needs no leaf case at all.",
              "A special leaf branch duplicates the match check that already exists below it, and you'll fix a bug in one copy and not the other. Leaves aren't special — they're nodes whose loop happens to iterate zero times.",
              "Throwing makes 'absent' an exceptional condition, so every caller needs a try/catch and every recursive call site has to decide whether to let it propagate (it would abort the whole search on the first empty branch). Absence is an ordinary, expected outcome: return a value."] },
      post:`  if (root.name === targetName) return root;
  // ... recurse into children ...
  return null;      // this subtree doesn't contain it
}` },

    { id:"shortcircuit", title:"The short-circuit", why:"stop asking the moment you know", demo:demoShortCircuit,
      pre:`function findNode(root, targetName) {
  if (!root) return null;
  if (root.name === targetName) return root;
  for (const child of root.children) {`,
      blank:{ q:"The target sits in the LAST branch. Which body finds it — and still stops the instant it does?",
        options:[
`    const found = findNode(child, targetName);
    if (found) return found;`,
`    return findNode(child, targetName);`,
`    if (findNode(child, targetName)) return child;`],
        answer:0,
        whys:["Right. Capture, test, and return only on a hit: a miss lets the loop advance to the next sibling, and a hit unwinds every frame above immediately. Both halves matter — without the capture you abandon siblings, without the `if` you'd return null from the first branch.",
              "The classic bug. `return` exits the function, so the loop body runs exactly once and every branch after the first is unreachable. It passes any test where the target lives in the first subtree, which is most hand-written test trees.",
              "This returns the CHILD, not the match. The recursion found the node somewhere deep in the child's subtree and you threw that away in favor of its top-level ancestor — so a lookup for A1 hands back A. The value you want is the one the recursive call returned."] },
      post:`  }
  return null;
}
// found it at depth 5? every frame between returns immediately.` },

    { id:"iterstack", title:"Recursion to explicit stack", why:"the call stack was a stack all along", demo:demoIterative,
      pre:`// same preorder, no recursion — you keep the stack now.
function preorderIterative(root) {
  const out = [], stack = [root];
  while (stack.length) {
    const node = stack.pop();
    out.push(node.name);`,
      blank:{ q:"The recursive version gave root, A, A1, A2, B, B1. Which push keeps the iterative version identical to it?",
        options:[
`    for (let i = node.children.length - 1; i >= 0; i--)
      stack.push(node.children[i]);`,
`    for (const child of node.children) stack.push(child);`,
`    for (const child of node.children) stack.unshift(child);`],
        answer:0,
        whys:["Right. `pop()` takes the most recently pushed, so the child you want FIRST must be pushed LAST — push in reverse and the leftmost child comes back off the top. Same nodes, same O(n), and now the depth limit is heap memory instead of the engine's call-stack limit.",
              "Natural order reverses the traversal: you get root, B, B1, A, A2, A1. It's still a valid depth-first walk of the tree, so tests that only assert 'every node appears' pass — and the one that asserts the order fails, in production, on the menu's display sequence.",
              "`unshift` + `pop` means you add at the front and take from the back — that's a queue, so this is breadth-first with extra steps (and an O(n) shift on every push). If you meant BFS, use `shift()` and say so."] },
      post:`  }
  return out;
}
// a chain 200k deep: the recursion overflows, this doesn't.` },

    { id:"cycleguard", title:"The visited set", why:"a tree walker on a graph never comes home", demo:demoCycle,
      pre:`// it's a GRAPH now: a node can have two parents, and
// "Specials" links back up to "Lunch".
function dfs(graph, id, visited = new Set(), out = []) {`,
      blank:{ q:"Which opening makes the walk terminate AND visit each of the 5 nodes exactly once?",
        options:[
`  if (visited.has(id)) return out;
  visited.add(id);`,
`  visited.add(id);
  if (visited.size > graph.length) return out;`,
`  if (visited.has(id)) return out;
  visited.add(id);
  // ... recurse ...
  visited.delete(id);   // clean up on the way out`],
        answer:0,
        whys:["Right. Check on entry, mark on entry, never unmark. The check kills the cycle (the back edge to Lunch finds Lunch already visited and returns) and the mark kills the duplicate work (Combos is reached from two parents but entered once). That's the entire difference between tree DFS and graph DFS: O(V+E) instead of forever.",
              "A size cap is a smoke alarm, not a fix: you still re-enter shared nodes over and over, the traversal order becomes an artifact of the cap, and on a cycle you burn the whole budget before bailing. Also `graph.length` is undefined on an adjacency object — this bails never.",
              "Deleting on the way out is the right move for CYCLE DETECTION or path enumeration (you're tracking 'nodes on the current path', so a diamond isn't a cycle) — and it's the wrong move here: Combos gets re-explored from every parent, which is exponential on a wide DAG. Two different sets for two different questions."] },
      post:`  out.push(graph[id].name);
  for (const next of graph[id].children)
    dfs(graph, next, visited, out);
  return out;
}` },
  ],

  menu:[
    { id:"menufind", title:"Find an item anywhere", why:"two kinds of children, one traversal", demo:demoMenuFind,
      pre:`// menu = { name, items: [{id, name}], groups: [menu...] }
// find an item by id, no matter how deep it's nested.
function findMenuItem(node, itemId) {
  for (const item of node.items || []) {
    if (item.id === itemId) return item;
  }`,
      blank:{ q:"Items are leaves; groups nest arbitrarily deep. Which body reaches the Cobb Salad two levels down?",
        options:[
`  for (const group of node.groups || []) {
    const found = findMenuItem(group, itemId);
    if (found) return found;
  }
  return null;`,
`  for (const group of node.groups || []) {
    for (const item of group.items) {
      if (item.id === itemId) return item;
    }
  }
  return null;`,
`  return (node.groups || [])
    .map(g => findMenuItem(g, itemId))[0] || null;`],
        answer:0,
        whys:["Right. The shape gained a second child list; the algorithm didn't change at all. Check the leaves at this level, then recurse into each subgroup with the same short-circuit rule. Arbitrary nesting is handled because the function calls itself — not because you wrote a second loop.",
              "This is 'one level of nesting', hard-coded. It finds the Wings (one level down) and misses the Cobb Salad (two), which is precisely the bug an interviewer plants by nesting Salads under Entrees. Depth is not something you enumerate; it's something you recurse through.",
              "`.map()` runs the search on EVERY group before looking at any result — no short-circuit, all the work, every time — and then takes index 0, so a match in the second group is discarded and you return null. Mapping is for transforming all elements; searching wants a loop that can leave early."] },
      post:`}
// menu: Lunch -> Appetizers(wings, fries)
//             -> Entrees(burger) -> Salads(cobb)` },

    { id:"inherit", title:"The effective value", why:"the closest ancestor that defined one wins", demo:demoInherit,
      pre:`// prices may be declared on ANY group or item. an item
// with no price inherits the closest ancestor's.
function getItemPrice(node, itemId, inherited = null) {`,
      blank:{ q:"Lunch is $12, Entrees declares nothing, Salads is $8. Which line gives Salads' items 8 and Entrees' items 12?",
        options:[
`  const effective = node.price ?? inherited;`,
`  const effective = inherited ?? node.price;`,
`  const effective = node.price || inherited;`],
        answer:0,
        whys:["Right. This node's own declaration wins if it made one; otherwise the value keeps falling through from above. Entrees' null leaves `inherited` (12) standing, and Salads' 8 replaces it for everything below — 'closest defining ancestor' is exactly what one line of `??`, evaluated on the way down, means.",
              "Backwards: the ancestor's value wins whenever there is one, so Salads' $8 never applies and every item in the menu is priced at Lunch's $12. It reads almost identically to the correct line, which is why it survives to production — the overriding value must be on the LEFT of `??`.",
              "`||` is right until someone declares a free item. `0 || 12` is 12, so a $0 happy-hour price silently inherits and the customer is billed. Inheritance asks 'did this level DEFINE a value?' — that's `??` (null/undefined only), never `||` (any falsy value)."] },
      post:`  for (const item of node.items || []) {
    if (item.id === itemId) return item.price ?? effective;
  }
  for (const group of node.groups || []) {
    const found = getItemPrice(group, itemId, effective);
    if (found !== null) return found;
  }
  return null;
}` },

    { id:"carrydown", title:"Carrying state down", why:"the parameter goes down, the return value comes up", demo:demoInherit,
      pre:`// the whole pattern, in four beats:
//   at each node: resolve the effective value for HERE
//                 check this level's items
//                 recurse with that value
//                 pass results back up
function getItemPrice(node, itemId, inherited = null) {
  const effective = node.price ?? inherited;
  for (const item of node.items || []) {
    if (item.id === itemId) return item.price ?? effective;
  }`,
      blank:{ q:"Which recursive call makes a Salads item inherit $8 instead of Lunch's $12?",
        options:[
`    const found = getItemPrice(group, itemId, effective);`,
`    const found = getItemPrice(group, itemId, inherited);`,
`    const found = getItemPrice(group, itemId, group.price);`],
        answer:0,
        whys:["Right. `effective` is what this level resolved — its own price if it declared one, otherwise what it was handed. Passing that down is what makes inheritance transitive through any depth, and it's the sentence to say out loud: 'I pass the currently effective value down as a parameter of each recursive call.'",
              "Passing `inherited` skips this node's own declaration, so every level below sees the ROOT's price forever — Salads' $8 is computed, used for Salads' own items, and then thrown away at the recursive call. The bug only shows up three levels deep, which is where the interviewer's test case lives.",
              "`group.price` hands down the child's own value with no fallback, so the instant a group declares nothing the chain breaks and its items inherit `null` instead of the grandparent's price. The child already reads its own price in its first line — what it can't compute for itself is what to fall back to."] },
      post:`    if (found !== null) return found;
  }
  return null;
}
// wings -> 6 · fries -> 4 · burger -> 12 · cobb -> 10 · garden -> 8` },

    { id:"pricemap", title:"Price every item, one pass", why:"same walk, accumulator instead of early return", demo:demoPriceMap,
      pre:`// "now compute the effective price for EVERY item."
// one traversal, not one traversal per item.
function priceEveryItem(node, inherited = null, out = new Map()) {
  const effective = node.price ?? inherited;`,
      blank:{ q:"Which body fills the map in a single O(n) pass?",
        options:[
`  for (const item of node.items || [])
    out.set(item.id, item.price ?? effective);
  for (const group of node.groups || [])
    priceEveryItem(group, effective, out);
  return out;`,
`  for (const item of node.items || [])
    out.set(item.id, getItemPrice(node, item.id, inherited));
  for (const group of node.groups || [])
    priceEveryItem(group, effective, out);
  return out;`,
`  for (const item of node.items || [])
    out.set(item.id, item.price ?? effective);
  for (const group of node.groups || [])
    return priceEveryItem(group, effective, out);
  return out;`],
        answer:0,
        whys:["Right. Drop the early return, keep the carried state, and write into a shared accumulator — the map travels down by reference while the price travels down by value. One visit per node, every answer resolved, O(n) total.",
              "Calling the single-item search from inside the traversal re-walks the subtree for every item: O(n) items × O(n) search = O(n²), and it's re-deriving a value the loop already has in `effective`. This is the most common way a 'now do all of them' follow-up gets accidentally quadratic.",
              "`return` inside the group loop ends the whole traversal after the first subgroup — the map comes back holding this level's items plus one branch, silently missing everything else. Early returns and 'do it for all of them' are mutually exclusive; that's the one thing this follow-up changes."] },
      post:`}
// Map(5) { wings:6, fries:4, burger:12, cobb:10, garden:8 }` },
  ],

  /* filled by js/packs/30-hunt-build.js — the interview follow-ups */
  bank:[],
};

/* ---- flashcards: judgment calls and sentences to say out loud ---- */
const CARDS = [
  ["Define DFS in one breath, the way you'd say it in an interview.","\"Visit a node, then explore one child's entire subtree before looking at the next child — and when a branch runs out, back up to the last node with unexplored children and continue there.\" The backtracking is what the call stack does for free when a recursive call returns; that's why DFS and recursion feel like the same thing."],
  ["Why does recursion map onto DFS so naturally?","Because a function call already IS a stack push with saved local state. \"Go deeper\" is a call; \"back out\" is a return that restores exactly the loop position and variables you left behind. Writing DFS iteratively means rebuilding that bookkeeping by hand — the recursion isn't a trick, it's the data structure you'd have had to write anyway."],
  ["DFS or BFS — the one-line decision rule?","Ask what \"first\" means for this problem. Need the SHALLOWEST answer (fewest hops, shortest path, nearest match)? BFS. Need any answer, the whole structure, a path, or something computed from a subtree? DFS — and it's cheaper on memory: O(height) frames instead of O(width) frontier. On a wide, shallow menu, BFS's frontier is the whole level; on a deep chain, DFS's stack is the whole chain."],
  ["What are the three lines of a correct recursive search?","(1) a guard for the empty case, (2) a check on the current node that can return immediately, (3) a loop that captures each recursive result and returns it ONLY if it's a hit. Miss (3)'s capture and you abandon siblings; miss its `if` and you return null from the first branch. Everything else is problem-specific."],
  ["What does \"short-circuit\" actually buy you — and what does it not?","It buys the average case: the moment any frame gets a hit, every frame above returns without touching its remaining siblings. It does NOT change the worst case — an absent target still costs O(n) — and it can't be used at all once the question becomes \"find ALL of them.\" Say both halves out loud; interviewers listen for the second."],
  ["State that must travel DOWN vs results that travel UP — how do you tell them apart?","Down (a parameter): anything a node needs from its ancestors — inherited price, the path so far, the current depth, an accumulated prefix. Up (a return value): anything computed from a node's subtree — the match, a count, a height, a subtree sum. Naming which is which, before you write a line, is the sentence that makes an interviewer relax."],
  ["Inherited values: why `??` and never `||`?","`||` falls through on every falsy value, and 0 and \"\" are legitimate data — a $0 promo price inherits $12 and the customer gets billed. `??` falls through only on null/undefined, which is exactly the question inheritance asks: did this level DEFINE a value? Same for a `0` depth, an empty-string label, or a `false` flag."],
  ["When does a nested structure stop being a tree, and what breaks?","The moment a node can be reached by two paths. A shared node makes a plain DFS do exponential duplicate work on a DAG; a back edge makes it recurse until the stack overflows. One `visited` Set — checked and marked on ENTRY, never unmarked — fixes both and makes the walk O(V+E). Ask \"can a group appear in two places?\" before you write the function."],
  ["`visited.delete(id)` on the way out — right or wrong?","Depends on the question. For reachability or a one-pass computation: wrong, it re-explores shared nodes exponentially. For cycle DETECTION or enumerating all simple paths: right — that set means \"nodes on the current path,\" and a diamond must not be reported as a cycle. Two different sets, two different questions; say which one you're building."],
  ["Repeated lookups: when is an index worth building?","When lookups outnumber structural changes. One search is O(n) and needs no index; k searches on a stable menu are O(k·n) walked versus O(n + k) indexed. The real cost isn't the build — it's invalidation: whoever owns the index owns rebuilding it on every edit, so propose it as \"build it once at load, rebuild on menu publish,\" not as a free win."],
  ["The complexity answer for any tree traversal, stated well.","\"Time O(n): every node is entered once and the work per node is O(1) plus its own children — the traversal touches each edge once. Space O(h) for the call stack, where h is the height; that's O(log n) for a balanced tree and O(n) for a degenerate chain — a deeply nested menu is the case that overflows, and the iterative version with an explicit stack is the fix.\""],
  ["Which edge cases do you name BEFORE writing the function?","Empty structure or null root; the target absent (return null, don't throw); an empty children/items array; a node that matches at the root; duplicate ids (first match or all?); and the shape questions — how deep can it nest, can a node appear twice, can a value be 0. Naming these takes fifteen seconds and is most of what \"senior\" sounds like."],
];

/* ===========================================================
   SPOT THE BUG — real code, one broken scenario, tap the line
   =========================================================== */
const BUGHUNT = [
  { id:"bug_firstbranch", title:"Menu item lookup", why:"the loop that only ever runs once", lesson:6,
    scenario:"Search works perfectly for appetizers and fails for everything else: every entrée lookup returns null, and QA can't reproduce it because their fixture menu has one group. Which line abandons the rest of the menu?",
    lines:[
      "// returns the item with this id, anywhere in the menu",
      "function findMenuItem(node, itemId) {",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return item;",
      "  }",
      "  for (const group of node.groups || []) {",
      "    return findMenuItem(group, itemId);",
      "  }",
      "  return null;",
      "}",
    ],
    bug:[6],
    explain:"Line 7 returns the result of the FIRST subgroup's search, whatever it is. `return` exits the function, so the loop has no second iteration — Appetizers is searched, and Entrees, Salads, and everything else are unreachable. The symptom follows the menu's declaration order exactly, which is why it looks like data corruption and not a bug. The fix is the two-line short-circuit: `const found = findMenuItem(group, itemId); if (found) return found;` — capture the result, return only on a hit, and let a miss advance the loop to the next group." },

  { id:"bug_falsyprice", title:"Inherited price resolver", why:"zero is a price, not a missing value", lesson:11,
    scenario:"Happy hour launches: Drinks gets price 0 and the free-refill items are left with no price of their own. Every one of them rings up at the menu's $9 base price, and the support queue fills with angry customers. The traversal is correct. Which line bills them?",
    lines:[
      "function getItemPrice(node, itemId, inherited = null) {",
      "  const effective = node.price || inherited;",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return item.price ?? effective;",
      "  }",
      "  for (const group of node.groups || []) {",
      "    const found = getItemPrice(group, itemId, effective);",
      "    if (found !== null) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    bug:[1],
    explain:"Line 2 uses `||`, which falls through on any falsy value — and `0` is falsy. Drinks declares `price: 0`, `0 || 9` evaluates to 9, and the zero is erased before it is ever passed down; every item under Drinks inherits $9. Line 4 gets it right with `??`, which is what makes the bug so hard to see in review: the two lines look parallel and behave differently. Inheritance asks \"did this level define a value?\" — that is `??` (null/undefined only). The same trap eats a `0` depth, an empty-string label, and a `false` feature flag." },

  { id:"bug_inheritskip", title:"Price inheritance chain", why:"the value you resolved is the value you must pass", lesson:10,
    scenario:"Two levels of nesting work fine. Three levels break: items under Salads (inside Entrees, inside Lunch) are priced at Lunch's $12 instead of Salads' $8 — and the deeper the nesting, the more prices collapse to the root's. Which line loses the override?",
    lines:[
      "function getItemPrice(node, itemId, inherited = null) {",
      "  const effective = node.price ?? inherited;",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return item.price ?? effective;",
      "  }",
      "  for (const group of node.groups || []) {",
      "    const found = getItemPrice(group, itemId, inherited);",
      "    if (found !== null) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    bug:[6],
    explain:"Line 7 passes `inherited` — the value this node RECEIVED — instead of `effective`, the value it resolved. So every level recomputes its own effective price, uses it for its own items (line 4 works), and then throws it away at the recursive call: the root's price propagates unchanged to the bottom of the tree. One level of nesting hides it (the root's value is the right answer there), which is why the fixture passes and production doesn't. Carrying state down means carrying the value you resolved: `getItemPrice(group, itemId, effective)`." },
];

/* ===========================================================
   WRITE IT — assemble the implementation from a shuffled line
   bank. Grading is honest: the assembled code actually RUNS
   against assertions in a sandboxed worker.
   =========================================================== */
const WRITE = [
  { id:"w-findnode", title:"findNode — write it", why:"the first thing they'll ask you to write", lesson:7,
    spec:"Write findNode(root, targetName): search an n-ary tree ({ name, children: [] }) depth-first and return the matching NODE, or null if no node has that name. It must short-circuit — once a match is found, no further nodes get visited. A null root returns null.",
    pre:`// the tree: { name, children: [ ...nodes ] }
// return the node itself, not its name — and stop when you find it.
let visits = 0;   // the tests read this to prove you stopped early`,
    post:`// visits is incremented once per node entered — the tests read it.`,
    lines:[
      "function findNode(root, targetName) {",
      "  if (!root) return null;",
      "  visits++;",
      "  if (root.name === targetName) return root;",
      "  for (const child of root.children) {",
      "    const found = findNode(child, targetName);",
      "    if (found) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    distractors:[
      { code:"    return findNode(child, targetName);",
        why:"`return` inside the loop ends the function on the first child, so every later sibling is unreachable — the search only ever works when the target lives in the leftmost branch." },
      { code:"    if (findNode(child, targetName)) return child;",
        why:"Returns the CHILD instead of the match: a lookup for a node five levels down hands you its top-level ancestor. The value you want is the one the recursive call returned." },
      { code:"  if (!root.children.length) return null;",
        why:"Bails out of every leaf before checking whether the leaf IS the target — findNode(tree, \"A1\") returns null for a node that's right there. Leaves aren't special; the empty loop already ends the recursion." },
    ],
    test:`const tree = { name: "root", children: [
  { name: "A", children: [ { name: "A1", children: [] }, { name: "A2", children: [] } ] },
  { name: "B", children: [ { name: "B1", children: [] } ] },
] };
assert(findNode(tree, "root") === tree, "the root itself must match");
const b1 = findNode(tree, "B1");
assert(b1 && b1.name === "B1", "must find a node in the LAST branch, got " + JSON.stringify(b1));
const a1 = findNode(tree, "A1");
assert(a1 === tree.children[0].children[0], "must return the node object itself, not a copy or a name");
assert(findNode(tree, "nope") === null, "an absent name returns null, not undefined");
assert(findNode(null, "anything") === null, "a null root returns null instead of throwing");
visits = 0;
findNode(tree, "A1");
log("target A1 (3rd node in DFS order) -> visited " + visits + " nodes");
assert(visits === 3, "must short-circuit: 3 nodes for A1, got " + visits);
visits = 0;
findNode(tree, "missing");
assert(visits === 6, "an absent target must still visit all 6 nodes, got " + visits);
log("absent target -> visited " + visits + " (the O(n) worst case)");`,
    pass:"found the node in the last branch, returned null for the absent one, and stopped after 3 nodes when it could",
    takeaway:"Guard, check, recurse-and-test. The `const found = ...; if (found) return found;` pair is the whole short-circuit: capture so siblings survive a miss, test so a hit unwinds every frame above immediately.",
    hint:"Four parts, in order: `if (!root) return null;` · match check that returns root · a for-of over children that CAPTURES the recursive result into a variable and returns it only when truthy · a final `return null` for a subtree with no match." },

  { id:"w-menufind", title:"findMenuItem — write it", why:"the interview problem, first cut", lesson:9,
    spec:"Write findMenuItem(node, itemId): a menu node is { name, items: [{id, name}], groups: [node...] }, nested arbitrarily deep. Return the item object with that id from anywhere in the menu, or null. Check this level's items before descending, short-circuit on a hit, and tolerate a node with no items or no groups key.",
    pre:`// menu node: { name, items: [{ id, name }], groups: [ ...nodes ] }
// items are leaves; groups are where the recursion goes.`,
    post:`// note the || [] guards: real menu JSON omits empty arrays.`,
    lines:[
      "function findMenuItem(node, itemId) {",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return item;",
      "  }",
      "  for (const group of node.groups || []) {",
      "    const found = findMenuItem(group, itemId);",
      "    if (found) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    distractors:[
      { code:"    for (const item of group.items) { if (item.id === itemId) return item; }",
        why:"Hard-codes exactly one level of nesting: it finds items one group down and misses anything deeper — which is precisely where the interviewer puts the Cobb Salad." },
      { code:"  for (const group of node.groups) {",
        why:"Real menu payloads omit empty arrays, so a leaf group with no `groups` key throws 'undefined is not iterable' — the crash arrives from data, not from logic." },
      { code:"    return findMenuItem(group, itemId);",
        why:"Returns the first subgroup's answer whatever it is, so every group after the first is never searched. Passes on a one-group fixture; fails on the real menu." },
    ],
    test:`const menu = { name: "Lunch", groups: [
  { name: "Appetizers", items: [ { id: "wings", name: "Wings" }, { id: "fries", name: "Fries" } ], groups: [] },
  { name: "Entrees", items: [ { id: "burger", name: "Burger" } ], groups: [
    { name: "Salads", items: [ { id: "cobb", name: "Cobb Salad" } ] } ] },
] };
const wings = findMenuItem(menu, "wings");
assert(wings && wings.name === "Wings", "one level down, got " + JSON.stringify(wings));
const cobb = findMenuItem(menu, "cobb");
assert(cobb && cobb.name === "Cobb Salad", "two levels down (Salads inside Entrees), got " + JSON.stringify(cobb));
log("cobb found at Lunch > Entrees > Salads");
assert(cobb === menu.groups[1].groups[0].items[0], "must return the item object itself");
assert(findMenuItem(menu, "sushi") === null, "an id that isn't on the menu returns null");
assert(findMenuItem(menu, "burger").name === "Burger", "a match in the SECOND group must be reachable");
assert(findMenuItem({ name: "Empty" }, "wings") === null, "a node with no items and no groups keys must not throw");
const deep = { name: "L0", groups: [ { name: "L1", groups: [ { name: "L2", groups: [
  { name: "L3", items: [ { id: "deep", name: "Deep Dish" } ] } ] } ] } ] };
assert(findMenuItem(deep, "deep").name === "Deep Dish", "arbitrary depth, not two levels");
log("four levels deep -> Deep Dish");`,
    pass:"items, subgroups, missing ids, absent keys, and four levels of nesting — one recursion handled all of it",
    takeaway:"Two child lists, one algorithm. When a shape grows a second kind of child you add a second loop, not a second strategy — and `|| []` is what makes it survive real JSON.",
    hint:"Loop the items first (cheap leaf checks, return the item on a match), then loop the groups, capturing `findMenuItem(group, itemId)` and returning it only if truthy. Guard both loops with `|| []`, and end with `return null`." },

  { id:"w-itemprice", title:"getItemPrice — write it", why:"the follow-up that separates candidates", lesson:11,
    spec:"Write getItemPrice(node, itemId, inherited = null): prices may be declared on any group or item. An item with no price of its own inherits the CLOSEST ancestor that declared one. Return the effective price, or null if the item isn't on the menu. A declared price of 0 is a real price and must survive.",
    pre:`// node: { name, price, items: [{ id, name, price }], groups: [...] }
// price may be null/absent at any level — resolve, then carry it down.`,
    post:`// Lunch $12 > Entrees (none) > Salads $8: a Salads item with no
// price of its own is $8, and a Entrees item is $12.`,
    lines:[
      "function getItemPrice(node, itemId, inherited = null) {",
      "  const effective = node.price ?? inherited;",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return item.price ?? effective;",
      "  }",
      "  for (const group of node.groups || []) {",
      "    const found = getItemPrice(group, itemId, effective);",
      "    if (found !== null) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    distractors:[
      { code:"  const effective = node.price || inherited;",
        why:"`0 || 12` is 12 — a $0 happy-hour price is erased before it can be inherited, and every item below it is billed at the ancestor's price." },
      { code:"    const found = getItemPrice(group, itemId, inherited);",
        why:"Passes down what this node RECEIVED instead of what it RESOLVED, so every override below the first level is discarded and deep items collapse to the root's price." },
      { code:"    if (found) return found;",
        why:"Truthiness again: a correctly resolved price of 0 is falsy, so the search keeps walking, misses the item it already found, and finally returns null for a free item." },
    ],
    test:`const menu = { name: "Lunch", price: 12, groups: [
  { name: "Appetizers", price: 6, groups: [], items: [
    { id: "wings", name: "Wings", price: null }, { id: "fries", name: "Fries", price: 4 } ] },
  { name: "Entrees", price: null, items: [ { id: "burger", name: "Burger", price: null } ], groups: [
    { name: "Salads", price: 8, groups: [], items: [
      { id: "cobb", name: "Cobb Salad", price: 10 }, { id: "garden", name: "Garden Salad", price: null } ] } ] },
] };
const want = { wings: 6, fries: 4, burger: 12, cobb: 10, garden: 8 };
for (const [id, price] of Object.entries(want)) {
  const got = getItemPrice(menu, id);
  log(id + " -> " + got);
  assert(got === price, id + " must be " + price + ", got " + got);
}
assert(getItemPrice(menu, "sushi") === null, "an unknown item is null, not 0 and not undefined");
const promo = { name: "Happy Hour", price: 9, items: [], groups: [
  { name: "Drinks", price: 0, groups: [], items: [
    { id: "water", name: "Water", price: null }, { id: "soda", name: "Soda", price: 2 } ] } ] };
assert(getItemPrice(promo, "water") === 0, "a declared price of 0 must be inherited, not treated as missing");
assert(getItemPrice(promo, "soda") === 2, "an item's own price still wins over a 0 ancestor");
log("free water stayed free — 0 survived the inheritance chain");
const deep = { name: "A", price: 5, items: [], groups: [ { name: "B", items: [], groups: [
  { name: "C", items: [], groups: [ { name: "D", items: [ { id: "x", name: "X" } ] } ] } ] } ] };
assert(getItemPrice(deep, "x") === 5, "with no price declared for three levels, the root's value must still reach the bottom");`,
    pass:"every price resolved from the closest defining ancestor — and the free drink stayed free",
    takeaway:"Resolve the effective value at the node, use it on this level's items, pass it down to the children. The value travels down as a parameter; the answer travels up as a return. That sentence, said before you write a line, is what the follow-up is testing.",
    hint:"Line one of the body: `const effective = node.price ?? inherited;`. Items: `item.price ?? effective`. Recurse with `effective` (not `inherited`), and test the result with `!== null` — never truthiness, because 0 is a valid answer." },
];

/* ===========================================================
   LESSONS 0-7 — what DFS is, then the traversal contract.
   Packs 10 and 20 append lessons 8-21.
   =========================================================== */
const LESSONS = [
  { eb:"lesson 01 · what dfs is", title:"Go deep, then back out", html:`
    <p class="big">You are handed a nested object — a menu, a file tree, an org chart, a DOM — and asked to find something inside it. <b class="hl">Depth-first search is the answer to "in what order do I look?"</b>: visit where you are, walk into the first child, and don't come back until that entire branch is exhausted. Only then do you look at the second child.</p>
    <div class="diagram anim" style="--step:.7s">
      <div class="dlabel">one branch completely &middot; then back out &middot; then the next</div>
      <svg class="estage" viewBox="0 0 340 160" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
        <line x1="170" y1="36" x2="90"  y2="80" stroke="#2c3350" stroke-width="1.4"/>
        <line x1="170" y1="36" x2="250" y2="80" stroke="#2c3350" stroke-width="1.4"/>
        <line x1="90"  y1="94" x2="50"  y2="134" stroke="#2c3350" stroke-width="1.4"/>
        <line x1="90"  y1="94" x2="130" y2="134" stroke="#2c3350" stroke-width="1.4"/>
        <line x1="250" y1="94" x2="250" y2="134" stroke="#2c3350" stroke-width="1.4"/>
        <circle cx="170" cy="28" r="15" fill="#11131c" stroke="#4eaeff" stroke-width="1.4"/><text x="170" y="32" fill="#e2ecf3" font-size="9" text-anchor="middle">root</text>
        <circle cx="90"  cy="86" r="15" fill="#11131c" stroke="#244155" stroke-width="1.4"/><text x="90"  y="90" fill="#e2ecf3" font-size="9" text-anchor="middle">A</text>
        <circle cx="250" cy="86" r="15" fill="#11131c" stroke="#244155" stroke-width="1.4"/><text x="250" y="90" fill="#e2ecf3" font-size="9" text-anchor="middle">B</text>
        <circle cx="50"  cy="142" r="15" fill="#11131c" stroke="#244155" stroke-width="1.4"/><text x="50"  y="146" fill="#e2ecf3" font-size="9" text-anchor="middle">A1</text>
        <circle cx="130" cy="142" r="15" fill="#11131c" stroke="#244155" stroke-width="1.4"/><text x="130" y="146" fill="#e2ecf3" font-size="9" text-anchor="middle">A2</text>
        <circle cx="250" cy="142" r="15" fill="#11131c" stroke="#244155" stroke-width="1.4"/><text x="250" y="146" fill="#e2ecf3" font-size="9" text-anchor="middle">B1</text>
        <circle r="7" fill="#34d3bf" opacity=".85">
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="linear"
            keyTimes="0;0.14;0.28;0.42;0.56;0.7;0.84;1"
            keyPoints="0;0.166;0.333;0.5;0.666;0.833;1;1"
            path="M 170 28 L 90 86 L 50 142 L 130 142 L 170 28 L 250 86 L 250 142"/>
        </circle>
      </svg>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">visit</div><div class="lstep seq" style="--i:0">do whatever the problem wants with THIS node — check it, print it, count it</div>
        <div class="lanehead seq" style="--i:1">descend</div><div class="lstep seq" style="--i:1">step into the first child and repeat, all the way to a leaf</div>
        <div class="lanehead seq" style="--i:2">backtrack</div><div class="lstep wait seq" style="--i:2">a branch with nothing left returns — you're back at the node above, mid-loop</div>
        <div class="lanehead seq" style="--i:3">next</div><div class="lstep good seq pop" style="--i:3">take that node's next unexplored child &middot; when there are none, back out again</div>
      </div>
      <div class="dnote seq" style="--i:4">That's the whole algorithm. <b style="color:var(--ordered)">"Depth-first" is a promise about order</b>, nothing more: deeper before wider, and a branch is never left half-explored.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Notice what you are <i>not</i> doing: you never build a plan, never track a frontier, never compute depths. You make one local decision at each node — <b class="hl">go deeper, or back out</b> — and the global order falls out of it. That's why DFS fits in five lines while its output looks organized.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the entire algorithm</div>
      <pre class="code">function walk(node) {
  <span class="cm">// 1. visit</span>
  console.log(node.name);
  <span class="cm">// 2. descend into each child, completely, in order</span>
  for (const child of node.children) walk(child);
  <span class="cm">// 3. backtrack happens for free: this function returns</span>
}
<span class="ok">// root, A, A1, A2, B, B1</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "traverse this nested thing" is the most common shape of real interview problem — menus, categories, comment threads, permissions, file systems, JSON. If DFS is reflexive, those problems collapse into "what do I do at each node, and what do I carry with me?" That second question is where this course is going.</p>` },

  { eb:"lesson 02 · what dfs is", title:"The vocabulary, in ten seconds", html:`
    <p class="big">The terminology is smaller than it sounds, and you already understand every concept behind it. <b class="hl">A node is an object; a child is an object in its array; a leaf is a node whose array is empty.</b> Here is everything you need, mapped to the JavaScript you'd write anyway.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">the words &middot; and the object they describe</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">node</div><div class="lstep seq" style="--i:0">one object &mdash; <code>{ name: "A", children: [...] }</code></div>
        <div class="lanehead seq" style="--i:1">root</div><div class="lstep seq" style="--i:1">the node you were handed &mdash; nothing points at it</div>
        <div class="lanehead seq" style="--i:2">child</div><div class="lstep seq" style="--i:2">an element of <code>node.children</code> &middot; its <b>parent</b> is the node holding the array</div>
        <div class="lanehead seq" style="--i:3">leaf</div><div class="lstep seq" style="--i:3"><code>children.length === 0</code> &mdash; the recursion ends here <i>by itself</i></div>
        <div class="lanehead seq" style="--i:4">n-ary</div><div class="lstep seq" style="--i:4">any number of children (not just 2) &mdash; a menu group, a folder, a comment</div>
        <div class="lanehead seq" style="--i:5">depth</div><div class="lstep seq" style="--i:5">hops from the root &middot; <b>height</b> = the deepest of those &mdash; the stack's worst case</div>
        <div class="lanehead seq" style="--i:6">subtree</div><div class="lstep good seq pop" style="--i:6">a node <i>plus everything under it</i> &mdash; the unit recursion actually operates on</div>
      </div>
      <div class="dnote seq" style="--i:7">The only one that earns thought is <b style="color:var(--ordered)">subtree</b>: every recursive call is handed one, and it neither knows nor cares that it's a piece of something bigger. That self-similarity is why the five-line function works at any depth.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two more words you'll hear and can mostly ignore for interviews: a <b class="hl">tree</b> is the promise that each node has exactly one parent and there are no loops; a <b class="hl">graph</b> is what you have when that promise is broken — a node reachable two ways, or an edge pointing back upward. Tree code on a graph loops forever, and lesson 19 fixes it with one <code>Set</code>.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the shapes this course traverses</div>
      <pre class="code"><span class="cm">// n-ary tree — the teaching shape</span>
{ name: "A", children: [ { name: "A1", children: [] } ] }

<span class="cm">// the interview shape: TWO kinds of children</span>
{ name: "Entrees",
  items:  [ { id: "burger", name: "Burger" } ],   <span class="cm">// leaves</span>
  groups: [ { name: "Salads", items: [], groups: [] } ] }  <span class="cm">// recursion</span>

<span class="cm">// a graph — adjacency, ids instead of nesting</span>
{ lunch: { children: ["apps", "entrees"] }, <span class="ok">/* may point back */</span> }</pre>
    </div>
    <p><b class="hl">Why it matters:</b> interviewers open with "what do you see?" and a crisp answer — <i>"an n-ary tree, arbitrary depth, two kinds of children"</i> — buys you the benefit of the doubt for the next twenty minutes. It also forces the questions that decide your code: how deep, can a node repeat, can a value be zero.</p>` },

  { eb:"lesson 03 · what dfs is", title:"Walk this tree, node by node", html:`
    <p class="big">Six nodes, one traversal, and the exact order it produces. <b class="hl">Say the sequence out loud before you read it</b> — this is the trace an interviewer will ask you to narrate, and the one every later lesson builds on.</p>
    <div class="diagram anim" style="--step:.55s">
      <div class="dlabel">preorder: visit on the way IN &middot; the call stack at each step</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1</div><div class="lstep good seq" style="--i:0"><b>root</b> &middot; stack: [root] &rarr; take its first child</div>
        <div class="lanehead seq" style="--i:1">2</div><div class="lstep good seq" style="--i:1"><b>A</b> &middot; stack: [root, A] &rarr; deeper</div>
        <div class="lanehead seq" style="--i:2">3</div><div class="lstep good seq" style="--i:2"><b>A1</b> &middot; stack: [root, A, A1] &middot; no children &rarr; <i>return</i></div>
        <div class="lanehead seq" style="--i:3">4</div><div class="lstep seq" style="--i:3">back in A's loop &rarr; <b>A2</b> &middot; no children &rarr; <i>return</i></div>
        <div class="lanehead seq" style="--i:4">5</div><div class="lstep wait seq" style="--i:4">A's loop is done &rarr; <i>return</i> &middot; back in root's loop, at child #2</div>
        <div class="lanehead seq" style="--i:5">6</div><div class="lstep good seq" style="--i:5"><b>B</b> &rarr; <b>B1</b> &middot; both return &middot; root's loop ends &middot; done</div>
      </div>
      <div class="tape">
        <span class="step seq" style="--i:6">root</span><span class="step seq" style="--i:7">A</span><span class="step seq" style="--i:8">A1</span><span class="step seq" style="--i:9">A2</span><span class="step seq" style="--i:10">B</span><span class="step seq" style="--i:11">B1</span>
      </div>
      <div class="dnote seq" style="--i:12">Step 5 is the one people skip when narrating: <b style="color:var(--ordered)">backtracking is not an action you write</b> — it is a function returning, and the loop in the frame below resuming exactly where it paused.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Move the visit from before the loop to after it and you get <b class="hl">postorder</b>: A1, A2, A, B1, B, root — children before parents. That ordering is what you want whenever a node's answer depends on its children: directory sizes, subtree sums, deleting a folder, evaluating an expression tree. Same walk, same cost; only the moment of the visit moved.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; one line apart</div>
      <pre class="code">function pre(n, out = []) {
  out.push(n.name);                       <span class="cm">// visit, THEN descend</span>
  for (const c of n.children) pre(c, out);
  return out;                             <span class="ok">// root,A,A1,A2,B,B1</span>
}
function post(n, out = []) {
  for (const c of n.children) post(c, out);
  out.push(n.name);                       <span class="cm">// descend, THEN visit</span>
  return out;                             <span class="ok">// A1,A2,A,B1,B,root</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "walk me through your traversal on this input" is asked in roughly every tree interview. Narrating six nodes and naming the backtrack step at the right moment demonstrates that you are running the code, not reciting it.</p>` },

  { eb:"lesson 04 · what dfs is", title:"Why recursion IS depth-first", html:`
    <p class="big">DFS needs somewhere to remember "which node am I at, and which child was I up to?" for every level you've descended through. <b class="hl">A function call already stores exactly that</b> — the call stack is the DFS stack, and <code>return</code> is the backtrack. You are not choosing recursion for elegance; you are choosing not to rewrite a stack you already have.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">the call stack while visiting A1 &middot; each frame is a paused loop</div>
      <div class="dcols">
        <div class="dcol">
          <div class="stackcol">
            <div class="frame seq" style="--i:0">walk(root) &middot; <span style="color:#8b90ab">child 0 of 2</span></div>
            <div class="frame seq" style="--i:1">walk(A) &middot; <span style="color:#8b90ab">child 0 of 2</span></div>
            <div class="frame seq" style="--i:2">walk(A1) &middot; <span style="color:#34d3bf">no children &rarr; returns</span></div>
          </div>
        </div>
        <div class="dcol">
          <div class="lanes">
            <div class="lanehead seq" style="--i:3">push</div><div class="lstep seq" style="--i:3">calling a child = "go deeper", locals saved automatically</div>
            <div class="lanehead seq" style="--i:4">pop</div><div class="lstep seq" style="--i:4">returning = "back out", the caller's loop resumes mid-flight</div>
            <div class="lanehead seq" style="--i:5">depth</div><div class="lstep bad seq pop" style="--i:5">frames alive = current depth &rarr; <b>O(h) memory</b>, and a stack overflow if h is huge</div>
          </div>
        </div>
      </div>
      <div class="dnote seq" style="--i:6">Write DFS iteratively and you rebuild this by hand: a <code>stack</code> array, and the node's remaining children as your own bookkeeping. <b style="color:var(--ordered)">Same structure, more code</b> — worth it only when the depth would overflow (lesson 18).</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This is also why <b class="hl">the base case is not optional</b>. Every frame you push must eventually pop, and the thing that guarantees it is a node with no children — the loop iterates zero times and the function falls off its end. No special leaf handling needed, but also no way to skip it: a structure with a cycle never reaches that point, and the stack grows until the engine gives up.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the same walk, both ways</div>
      <pre class="code"><span class="cm">// the engine keeps the stack</span>
function walk(n) {
  visit(n);
  for (const c of n.children) walk(c);
}
<span class="cm">// you keep the stack — identical order, reversed pushes</span>
function walkIter(root) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();          <span class="cm">// LIFO = depth-first</span>
    visit(n);
    for (let i = n.children.length - 1; i &gt;= 0; i--)
      stack.push(n.children[i]);    <span class="ok">// reverse: leftmost pops first</span>
  }
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "why recursion here?" is a real interview question, and "it's cleaner" is a weak answer. The strong one: <i>"DFS needs a stack of paused states, and the call stack is exactly that — with locals saved for free. I'd switch to an explicit stack only if the structure could nest deep enough to overflow."</i></p>` },

  { eb:"lesson 05 · what dfs is", title:"BFS, briefly — and when to switch", html:`
    <p class="big">One character separates the two traversals. <b class="hl">Take the newest item (a stack) and you dive; take the oldest (a queue) and you sweep level by level.</b> Same nodes, same O(n), different order, different memory bill — and the order is the entire reason to pick one.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">the same six-node tree &middot; two containers</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">dfs</div><div class="lstep good seq" style="--i:0">root &rarr; A &rarr; A1 &rarr; A2 &rarr; B &rarr; B1 &nbsp;&middot;&nbsp; <code>stack.pop()</code> / recursion</div>
        <div class="lanehead seq" style="--i:1">bfs</div><div class="lstep seq" style="--i:1">root &rarr; A &rarr; B &rarr; A1 &rarr; A2 &rarr; B1 &nbsp;&middot;&nbsp; <code>queue.shift()</code></div>
        <div class="lanehead seq" style="--i:2">memory</div><div class="lstep seq" style="--i:2">DFS holds one root-to-leaf path: <b>O(height)</b> &middot; BFS holds a whole level: <b>O(width)</b></div>
        <div class="lanehead seq" style="--i:3">finds</div><div class="lstep bad seq pop" style="--i:3">DFS finds <i>some</i> match first &middot; BFS finds the <b>shallowest</b> match first &mdash; that's shortest-path</div>
      </div>
      <div class="dnote seq" style="--i:4">A menu is wide and shallow, so BFS's frontier can be most of the menu while DFS's stack is three or four frames. <b style="color:var(--ordered)">Reach for BFS when "nearest" is in the question</b> — fewest hops, shortest path, closest ancestor by distance. Otherwise DFS.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>There's one more practical difference worth a sentence in an interview: <b class="hl">BFS doesn't recurse</b>, so it can't overflow a stack, and it gives you levels for free (drain the queue in batches of <code>queue.length</code>). But it can't naturally carry ancestor state — the price you'd inherit, the path you walked — because a queued node has been separated from its parent's context. Every node would have to carry that state with it into the queue, which is the pattern's real cost.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the one-character difference</div>
      <pre class="code">const next = queue.shift();   <span class="cm">// FIFO -> breadth-first</span>
const next = stack.pop();     <span class="cm">// LIFO -> depth-first</span>

<span class="ok">// everything else in the loop is identical:</span>
visit(next);
for (const c of next.children) container.push(c);</pre>
    </div>
    <p><b class="hl">Why it matters:</b> you'll be asked "why DFS and not BFS?" in under a minute. The answer that lands: <i>"nothing here asks for the nearest match, and I need each node's ancestors while I'm at it — DFS carries that naturally and costs O(height) instead of O(width). If the question became 'fewest clicks to reach an item', I'd switch to BFS."</i></p>` },

  { eb:"lesson 06 · the contract", title:"The base case, and what 'not found' returns", html:`
    <p class="big">Every recursive function needs a way to stop, and every search needs a way to say "it isn't here." <b class="hl">In an n-ary tree both are nearly free</b> — an empty <code>children</code> array ends the recursion by itself, and "not found" is an ordinary return value, not an exception.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">three ways a frame ends &middot; all of them return a value</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">guard</div><div class="lstep seq" style="--i:0"><code>if (!root) return null;</code> &mdash; the one case that can't be walked</div>
        <div class="lanehead seq" style="--i:1">hit</div><div class="lstep good seq" style="--i:1"><code>if (root.name === target) return root;</code> &mdash; stop, answer found</div>
        <div class="lanehead seq" style="--i:2">leaf</div><div class="lstep wait seq" style="--i:2">the for-of runs <b>zero times</b> &rarr; falls through to the final <code>return null</code></div>
        <div class="lanehead seq" style="--i:3">miss</div><div class="lstep seq" style="--i:3">every child returned null &rarr; this whole subtree returns null</div>
      </div>
      <div class="flowarrow seq" style="--i:4">&darr; the caller does the same test on what came back &darr;</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:5">never</div><div class="lstep bad seq pop" style="--i:5"><code>throw new Error("not found")</code> &mdash; absence is expected, so every call site needs a catch, and the first empty branch aborts the search</div>
      </div>
      <div class="dnote seq" style="--i:6">Notice there is no <code>if (isLeaf)</code> anywhere. <b style="color:var(--ordered)">Leaves are not special</b> — they're nodes whose loop happens to iterate zero times, and a special case for them would just duplicate the match check above it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Pick your "nothing" and stay consistent, because every caller — including the recursion itself — tests it. <b class="hl">null for a missing object; but be careful with values.</b> When the thing you return can legitimately be <code>0</code> or <code>""</code> (an inherited price, a count, a label), <code>if (found)</code> is a bug waiting for the first free item; test <code>found !== null</code> instead. Lesson 12 is that trap in full.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the whole contract in nine lines</div>
      <pre class="code">function findNode(root, targetName) {
  if (!root) return null;                       <span class="cm">// guard</span>
  if (root.name === targetName) return root;    <span class="cm">// hit</span>
  for (const child of root.children) {          <span class="cm">// zero times at a leaf</span>
    const found = findNode(child, targetName);
    if (found) return found;
  }
  return null;                                  <span class="cm">// miss</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "what's your base case?" is the second question in most recursion interviews, and a lot of candidates answer it by inventing a leaf branch they don't need. The strong answer: <i>"the guard for a null node; leaves terminate on their own because the loop has nothing to iterate."</i></p>` },

  { eb:"lesson 07 · the contract", title:"Short-circuit: stop the moment you know", html:`
    <p class="big">A search that finds the answer at depth five and then keeps walking the rest of the tree is not wrong — it's just <b class="hl">doing work it has already proven pointless</b>. Making it stop takes two lines, and interviewers listen for them specifically.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">target A1 &middot; six nodes in the tree &middot; three of them entered</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">✓</div><div class="lstep good seq" style="--i:0"><code>const found = f(child); if (found) return found;</code> &mdash; capture, test, unwind</div>
        <div class="lanehead seq" style="--i:1">✗</div><div class="lstep bad seq" style="--i:1"><code>return f(child);</code> &mdash; the loop runs ONCE; every later sibling is unreachable</div>
        <div class="lanehead seq" style="--i:2">✗</div><div class="lstep bad seq" style="--i:2"><code>f(child);</code> &mdash; result discarded; the search finds it and forgets it</div>
        <div class="lanehead seq" style="--i:3">✗</div><div class="lstep bad seq" style="--i:3"><code>results.push(f(child));</code> &mdash; correct answer, full O(n) walk, every time</div>
      </div>
      <div class="tape">
        <span class="step seq" style="--i:4">root ✓entered</span><span class="step seq" style="--i:5">A ✓entered</span><span class="step seq" style="--i:6">A1 ✓ HIT</span><span class="step seq" style="--i:7">A2 —</span><span class="step seq" style="--i:8">B —</span><span class="step seq" style="--i:9">B1 —</span>
      </div>
      <div class="dnote seq" style="--i:10">Both halves matter. <b style="color:var(--ordered)">The capture</b> keeps a missed branch from ending the search; <b style="color:var(--ordered)">the <code>if</code></b> keeps a hit from being buried under the siblings that follow it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Say the limits out loud, because they are the follow-up: the short-circuit improves the <b class="hl">average</b> case, not the worst — a target that isn't there still costs a full O(n) walk, since you can't know it's absent until you've looked everywhere. And it <b class="hl">disappears entirely</b> when the question becomes "find all of them": collecting every match means no branch can ever be skipped.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the two lines, and what they cost</div>
      <pre class="code">for (const child of root.children) {
  const found = findNode(child, targetName);
  if (found) return found;      <span class="ok">// unwinds every frame above, immediately</span>
}
<span class="cm">// target present, lucky branch:  3 of 6 nodes entered</span>
<span class="cm">// target absent:                 6 of 6 — O(n), unavoidable</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this single pattern is the difference between "can write a traversal" and "has written traversals." It's also the fault in the very first spot-the-bug card, because <code>return findNode(child, target)</code> parses, runs, and returns the right answer for every test tree whose target happens to sit in the first branch.</p>` },

  { eb:"lesson 08 · the contract", title:"findNode, end to end", html:`
    <p class="big">Everything so far, assembled into the function you'll be asked to write first. <b class="hl">Nine lines, four responsibilities</b> — and a narration to go with them, because in an interview the narration is graded too.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">what you say &middot; while you write each line</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">shape</div><div class="lstep seq" style="--i:0">"This is an n-ary tree, arbitrary depth, so I'll traverse it depth-first."</div>
        <div class="lanehead seq" style="--i:1">base</div><div class="lstep seq" style="--i:1">"Base case is a null node; leaves end on their own because the loop is empty."</div>
        <div class="lanehead seq" style="--i:2">hit</div><div class="lstep seq" style="--i:2">"Check this node before descending — the root can be the answer."</div>
        <div class="lanehead seq" style="--i:3">recurse</div><div class="lstep good seq" style="--i:3">"Recurse into each child, and return the result as soon as one is truthy — that's the short-circuit."</div>
        <div class="lanehead seq" style="--i:4">miss</div><div class="lstep seq" style="--i:4">"If no branch had it, this subtree returns null, and my caller treats that as a miss."</div>
        <div class="lanehead seq" style="--i:5">cost</div><div class="lstep good seq pop" style="--i:5">"O(n) time worst case, O(h) stack space — h is the nesting depth."</div>
      </div>
      <div class="dnote seq" style="--i:6">Six sentences, about twenty seconds, said <b style="color:var(--ordered)">before or while</b> the code appears. Candidates who narrate get corrected early and cheaply; candidates who go quiet get judged on the final artifact alone.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Then volunteer the edge cases without being asked: <b class="hl">null root, target absent, target at the root, duplicate names, and a tree deep enough to overflow.</b> Each has a one-line answer here — returns null, returns null, returns the root, returns the first in DFS order, would need the iterative version — and offering them is the difference between finishing the question and owning it.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the function, complete</div>
      <pre class="code">function findNode(root, targetName) {
  if (!root) return null;
  if (root.name === targetName) return root;
  for (const child of root.children) {
    const found = findNode(child, targetName);
    if (found) return found;
  }
  return null;
}
<span class="ok">// findNode(tree, "B1") -> the B1 node · findNode(tree, "Z") -> null</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the setup, not the question. In the real interview it takes four minutes, and then the menu appears — nested groups, two kinds of children, and prices that are inherited from ancestors. That's the next arc, and it's the one they're actually grading.</p>` },
];

/* ---- cross-links: skill -> the concept it checks ---- */
const DRILL_LESSON = {
  visitorder:2, basecase:5, shortcircuit:6, iterstack:17, cycleguard:18,
  menufind:9, inherit:11, carrydown:10, pricemap:16,
  allmatches:13, pathto:14, flatten:15, bfsvsdfs:4, indexit:19,
};
/* lesson index -> where to go practice it { mod, drill? }. Indices past 7
   land in the lesson packs; the plan at the top of this file fixes them. */
const LESSON_PRACTICE = {
  0:{mod:"walk"}, 1:{mod:"trace"}, 2:{mod:"primitives",drill:"visitorder"},
  3:{mod:"walk"}, 4:{mod:"bank",drill:"bfsvsdfs"}, 5:{mod:"primitives",drill:"basecase"},
  6:{mod:"primitives",drill:"shortcircuit"}, 7:{mod:"write"},
  8:{mod:"trace"}, 9:{mod:"menu",drill:"menufind"}, 10:{mod:"menu",drill:"carrydown"},
  11:{mod:"menu",drill:"inherit"}, 12:{mod:"tradeoffs"},
  13:{mod:"bank",drill:"allmatches"}, 14:{mod:"bank",drill:"pathto"},
  15:{mod:"bank",drill:"flatten"}, 16:{mod:"menu",drill:"pricemap"},
  17:{mod:"primitives",drill:"iterstack"}, 18:{mod:"primitives",drill:"cycleguard"},
  19:{mod:"bank",drill:"indexit"}, 20:{mod:"bughunt"}, 21:{mod:"script"},
};
