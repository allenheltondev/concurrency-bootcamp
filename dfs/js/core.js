/* DFS & Recursive Traversal Bootcamp — core: tiny helpers, reference
   implementations, and the demo runners that power every "run reference"
   button. Loaded first.

   Everything here is plain synchronous JavaScript over plain objects: an
   n-ary tree is `{ name, children: [] }`, a restaurant menu is
   `{ name, price, items: [], groups: [] }`, a graph is an adjacency map.
   No library, no framework, no async — the interview gives you a nested
   object and a function signature, and so does this course.

   The reference implementations are counted: `VISITS` records how many
   nodes each traversal actually touched, so a demo can PROVE a
   short-circuit stopped early instead of claiming it. */
"use strict";

/* ---------- tiny helpers available to demos ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const rnd = (n) => Math.floor(Math.random()*n);
const money = (v) => v == null ? "null" : "$" + v;

/* a visit counter the demos read to prove early exit really happened */
const VISITS = { n:0 };
const countVisit = () => { VISITS.n++; };
function counted(fn){ VISITS.n = 0; const out = fn(); return { out, visited: VISITS.n }; }

/* ===========================================================
   THE FIXTURES — the two shapes this whole course traverses
   =========================================================== */

/* the teaching tree: DFS visits root, A, A1, A2, B, B1 */
const TREE = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A1", children: [] },
        { name: "A2", children: [] },
      ],
    },
    {
      name: "B",
      children: [
        { name: "B1", children: [] },
      ],
    },
  ],
};

/* the interview shape: a nested menu whose groups nest arbitrarily deep and
   whose children come in TWO kinds — items (leaves) and groups (recursion). */
const MENU = {
  name: "Lunch",
  groups: [
    {
      name: "Appetizers",
      items: [
        { id: "wings", name: "Wings" },
        { id: "fries", name: "Fries" },
      ],
      groups: [],
    },
    {
      name: "Entrees",
      items: [
        { id: "burger", name: "Burger" },
      ],
      groups: [
        {
          name: "Salads",
          items: [
            { id: "cobb", name: "Cobb Salad" },
          ],
          groups: [],
        },
      ],
    },
  ],
};

/* the same menu with prices that can be defined at ANY level. An item with
   price == null inherits the closest ancestor that defined one:
     wings -> 6 (Appetizers)   fries -> 4 (its own)   burger -> 12 (Lunch,
     because Entrees declined)  cobb -> 10 (its own)  garden -> 8 (Salads) */
const PRICED_MENU = {
  name: "Lunch",
  price: 12,
  groups: [
    {
      name: "Appetizers",
      price: 6,
      items: [
        { id: "wings", name: "Wings", price: null },
        { id: "fries", name: "Fries", price: 4 },
      ],
      groups: [],
    },
    {
      name: "Entrees",
      price: null,
      items: [
        { id: "burger", name: "Burger", price: null },
      ],
      groups: [
        {
          name: "Salads",
          price: 8,
          items: [
            { id: "cobb", name: "Cobb Salad", price: 10 },
            { id: "garden", name: "Garden Salad", price: null },
          ],
          groups: [],
        },
      ],
    },
  ],
};

/* a menu with a free promo item — the $0 that catches `||` and never `??` */
const PROMO_MENU = {
  name: "Happy Hour",
  price: 9,
  items: [{ id: "chips", name: "Chips", price: 0 }],
  groups: [
    { name: "Drinks", price: 0,
      items: [{ id: "water", name: "Water", price: null }],
      groups: [] },
  ],
};

/* a GRAPH, not a tree: "Combos" is reachable from two parents, and
   "Specials" points back up at "Lunch" — a cycle a tree walker can't survive */
const MENU_GRAPH = {
  lunch:    { name: "Lunch",    children: ["apps", "entrees"] },
  apps:     { name: "Apps",     children: ["combos"] },
  entrees:  { name: "Entrees",  children: ["combos", "specials"] },
  combos:   { name: "Combos",   children: [] },
  specials: { name: "Specials", children: ["lunch"] },          // back edge
};

/* ===========================================================
   REFERENCE IMPLEMENTATIONS  (these power the Run buttons)
   =========================================================== */

/* ---- the traversal itself ----
   Visit the node, then recurse into each child in order, completely, before
   moving to the next sibling. That "completely" is the whole definition. */
function preorder(node, out = []) {
  countVisit();
  out.push(node.name);                         // visit FIRST — preorder
  for (const child of node.children) preorder(child, out);
  return out;
}

/* the same walk, visiting on the way back OUT instead of on the way in */
function postorder(node, out = []) {
  for (const child of node.children) postorder(child, out);
  out.push(node.name);                         // visit LAST — postorder
  return out;
}

/* breadth-first, for contrast only: a QUEUE instead of the call stack */
function bfsOrder(root) {
  const out = [], queue = [root];
  while (queue.length) {
    const node = queue.shift();                // FIFO — the only difference
    out.push(node.name);
    for (const child of node.children) queue.push(child);
  }
  return out;
}

/* ---- search: DFS that stops the instant it finds the answer ----
   The three rules an interviewer is listening for: a base case, a check on
   the current node, and a recursive call whose RESULT is inspected before
   the loop moves on. Returning the recursive call directly is the classic
   bug — it abandons every later sibling. */
function findNode(root, targetName) {
  if (!root) return null;                      // base case: nothing here
  countVisit();
  if (root.name === targetName) return root;   // found it — stop
  for (const child of root.children) {
    const found = findNode(child, targetName); // go deep
    if (found) return found;                   // short-circuit: unwind, don't continue
  }
  return null;                                 // this whole subtree lacks it
}

/* the same search WITHOUT the short-circuit — visits every node, every time */
function findNodeExhaustive(root, targetName) {
  if (!root) return null;
  countVisit();
  let hit = root.name === targetName ? root : null;
  for (const child of root.children) {
    const found = findNodeExhaustive(child, targetName);
    if (found) hit = hit || found;             // keeps walking regardless
  }
  return hit;
}

/* ---- the menu: two kinds of children, one traversal ----
   Every group has items (leaves — check them) and groups (recurse). The
   shape changed; the algorithm did not. */
function findMenuItem(node, itemId) {
  countVisit();
  for (const item of node.items || []) {
    if (item.id === itemId) return item;       // leaves first — cheapest check
  }
  for (const group of node.groups || []) {
    const found = findMenuItem(group, itemId);
    if (found) return found;                   // same short-circuit rule
  }
  return null;
}

/* ---- DFS WITH INHERITED STATE — the idea the whole course points at ----
   At each node: resolve the effective value for THIS level (own value if it
   defined one, otherwise whatever the ancestors handed down), use it on the
   items here, then recurse with it. The state travels DOWN as a parameter;
   the answer travels UP as a return value. */
function getItemPrice(node, itemId, inherited = null) {
  countVisit();
  const effective = node.price ?? inherited;   // ?? not || — a $0 price is real
  for (const item of node.items || []) {
    if (item.id === itemId) return item.price ?? effective;
  }
  for (const group of node.groups || []) {
    const found = getItemPrice(group, itemId, effective);   // carry it down
    if (found !== null) return found;
  }
  return null;                                 // no such item anywhere
}

/* the `||` version — correct on this menu, wrong the day a price is 0 */
function getItemPriceLoose(node, itemId, inherited = null) {
  const effective = node.price || inherited;
  for (const item of node.items || []) {
    if (item.id === itemId) return item.price || effective;
  }
  for (const group of node.groups || []) {
    const found = getItemPriceLoose(group, itemId, effective);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

/* ---- follow-up 1: every match, not the first ----
   Drop the short-circuit and concatenate what each subtree returns. */
function findAllItems(node, predicate, inherited = null, out = []) {
  const effective = node.price ?? inherited;
  for (const item of node.items || []) {
    if (predicate(item, effective)) out.push(item);
  }
  for (const group of node.groups || []) findAllItems(group, predicate, effective, out);
  return out;                                  // no early return anywhere
}

/* ---- follow-up 2: the path to the item ----
   The trail is state travelling down, exactly like the price. Build it with
   concat (a fresh array per call, nothing to undo) or push/pop — but if you
   push, you MUST pop on the way out or siblings inherit the trail. */
function findItemPath(node, itemId, trail = []) {
  const here = trail.concat(node.name);
  for (const item of node.items || []) {
    if (item.id === itemId) return here.concat(item.name);
  }
  for (const group of node.groups || []) {
    const found = findItemPath(group, itemId, here);
    if (found) return found;
  }
  return null;
}

/* ---- follow-up 3: flatten the whole menu ----
   One pass, carrying BOTH pieces of inherited state (path and price), and
   returning a flat list — the shape every "export the menu" ticket wants. */
function flattenMenu(node, inherited = null, trail = [], out = []) {
  const effective = node.price ?? inherited;
  const here = trail.concat(node.name);
  for (const item of node.items || []) {
    out.push({ id: item.id, name: item.name, price: item.price ?? effective, path: here.concat(item.name) });
  }
  for (const group of node.groups || []) flattenMenu(group, effective, here, out);
  return out;
}

/* ---- follow-up 4: the effective price of EVERY item, one pass ---- */
function priceEveryItem(node, inherited = null, out = new Map()) {
  const effective = node.price ?? inherited;
  for (const item of node.items || []) out.set(item.id, item.price ?? effective);
  for (const group of node.groups || []) priceEveryItem(group, effective, out);
  return out;
}

/* ---- follow-up 5: the same DFS with an explicit stack ----
   The call stack was doing the bookkeeping; now you do it. Push children in
   REVERSE so the leftmost child is popped first and the order matches the
   recursion exactly. */
function preorderIterative(root) {
  const out = [], stack = [root];
  while (stack.length) {
    const node = stack.pop();                  // LIFO — this is what makes it depth-first
    out.push(node.name);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return out;
}
function findNodeIterative(root, targetName) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    countVisit();
    if (node.name === targetName) return node;  // short-circuit: just return
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return null;
}
/* the naive push order — same nodes, mirrored traversal */
function preorderIterativeNaive(root) {
  const out = [], stack = [root];
  while (stack.length) {
    const node = stack.pop();
    out.push(node.name);
    for (const child of node.children) stack.push(child);
  }
  return out;
}

/* ---- follow-up 6: it's a graph now ----
   A tree walker on a graph revisits shared nodes and loops forever on a
   cycle. One `visited` set fixes both — marked on ENTRY, before recursing,
   and never cleared on the way out. */
function graphDfs(graph, startId, visited = new Set(), out = []) {
  if (visited.has(startId)) return out;        // the whole fix, in one line
  visited.add(startId);                        // mark on entry
  countVisit();
  out.push(graph[startId].name);
  for (const next of graph[startId].children) graphDfs(graph, next, visited, out);
  return out;
}
/* what the tree version does to a cycle — bounded here so the demo survives */
function graphDfsNaive(graph, startId, out = [], budget = { n: 40 }) {
  if (budget.n-- <= 0) return out;             // the bound stands in for the stack overflow
  out.push(graph[startId].name);
  for (const next of graph[startId].children) graphDfsNaive(graph, next, out, budget);
  return out;
}

/* ---- follow-up 7: repeated lookups deserve an index ----
   One DFS builds a Map; every later lookup is O(1). Worth it when lookups
   outnumber edits — and a liability the moment the menu changes underneath
   it, which is why the index owns invalidation. */
class MenuIndex {
  constructor(menu) {
    this.menu = menu;
    this.byId = new Map();                     // one traversal, then never again
    this.lookups = 0;
    for (const row of flattenMenu(menu)) this.byId.set(row.id, row);
  }
  get(itemId) { this.lookups++; return this.byId.get(itemId) || null; }
  price(itemId) { const row = this.get(itemId); return row ? row.price : null; }
  rebuild() { this.byId = new Map(); for (const row of flattenMenu(this.menu)) this.byId.set(row.id, row); }
}

/* ---- the shape facts an interviewer asks you to name ---- */
function countNodes(node) {
  let n = 1;
  for (const child of node.children) n += countNodes(child);
  return n;
}
function treeHeight(node) {
  if (!node.children.length) return 1;
  return 1 + Math.max(...node.children.map(treeHeight));
}

/* ===========================================================
   DEMO RUNNERS — every one runs the reference above and
   asserts its invariant. The validator fails CI if any
   returns pass:false.
   =========================================================== */

async function demoVisitOrder(){
  const pre = preorder(TREE);
  const post = postorder(TREE);
  const pass = pre.join(",") === "root,A,A1,A2,B,B1" && post.join(",") === "A1,A2,A,B1,B,root";
  return {lines:[
    {t:`tree: root -> [A -> [A1, A2], B -> [B1]]`},
    {t:`preorder  (visit, then descend): ${pre.join(" -> ")}`},
    {t:`postorder (descend, then visit): ${post.join(" -> ")}`},
    {t:`A's whole branch finishes before B is touched — that is the entire idea`},
  ], pass, verdict: pass?"one branch completely, then backtrack, then the next — preorder root,A,A1,A2,B,B1":`pre=${pre} post=${post}`};
}

async function demoBfsContrast(){
  const dfs = preorder(TREE), bfs = bfsOrder(TREE);
  const pass = dfs.join(",")==="root,A,A1,A2,B,B1" && bfs.join(",")==="root,A,B,A1,A2,B1";
  return {lines:[
    {t:`same tree, two container choices`},
    {t:`DFS (stack / recursion): ${dfs.join(" -> ")}`},
    {t:`BFS (queue):             ${bfs.join(" -> ")}`},
    {t:`swap pop() for shift() and depth-first becomes breadth-first — nothing else changes`},
  ], pass, verdict: pass?"the container is the algorithm: LIFO goes deep, FIFO goes wide":`dfs=${dfs} bfs=${bfs}`};
}

async function demoBaseCase(){
  const missing = findNode(TREE, "Z");
  const leaf = findNode(TREE, "B1");
  const nothing = findNode(null, "anything");
  const pass = missing === null && leaf && leaf.name === "B1" && nothing === null;
  return {lines:[
    {t:`findNode(tree, "B1") -> ${leaf.name} (a leaf, children: [])`},
    {t:`findNode(tree, "Z")  -> ${String(missing)}  (walked all 6 nodes, found nothing)`},
    {t:`findNode(null, ...)  -> ${String(nothing)}  (the guard, not a crash)`},
    {t:`"not found" is a VALUE the recursion returns, never an exception`},
  ], pass, verdict: pass?"empty children ends the recursion by itself — the loop simply runs zero times":`missing=${missing}`};
}

async function demoShortCircuit(){
  const early = counted(() => findNode(TREE, "A1"));
  const full  = counted(() => findNodeExhaustive(TREE, "A1"));
  const total = countNodes(TREE);
  const pass = early.out.name === "A1" && full.out.name === "A1" && early.visited === 3 && full.visited === total;
  return {lines:[
    {t:`target "A1" — third node in the walk, out of ${total} in the tree`},
    {t:`with the short-circuit:    visited ${early.visited} nodes, returned ${early.out.name}`},
    {t:`without it (keeps walking): visited ${full.visited} nodes, returned ${full.out.name}`},
    {t:`same answer; one of them stopped asking as soon as it knew`},
  ], pass, verdict: pass?`the if(found) return found unwinds ${total - early.visited} nodes of pointless work — still O(n) worst case, always cheaper in practice`:`early=${early.visited} full=${full.visited}`};
}

async function demoMenuFind(){
  const wings = counted(() => findMenuItem(MENU, "wings"));
  const cobb = findMenuItem(MENU, "cobb");
  const ghost = findMenuItem(MENU, "sushi");
  const pass = wings.out.name === "Wings" && cobb.name === "Cobb Salad" && ghost === null;
  return {lines:[
    {t:`menu: Lunch -> [Appetizers(wings, fries), Entrees(burger) -> [Salads(cobb)]]`},
    {t:`findMenuItem(menu, "wings") -> ${wings.out.name}   (${wings.visited} group${wings.visited===1?"":"s"} entered)`},
    {t:`findMenuItem(menu, "cobb")  -> ${cobb.name}  (two levels down, found by the same walk)`},
    {t:`findMenuItem(menu, "sushi") -> ${String(ghost)}`},
    {t:`two kinds of children — items are leaves to check, groups are recursion`},
  ], pass, verdict: pass?"same DFS as the toy tree; only the child accessors changed":`wings=${wings.out}`};
}

async function demoInherit(){
  const rows = ["wings","fries","burger","cobb","garden","sushi"].map(id => [id, getItemPrice(PRICED_MENU, id)]);
  const want = {wings:6, fries:4, burger:12, cobb:10, garden:8, sushi:null};
  const pass = rows.every(([id,v]) => v === want[id]);
  return {lines:[
    {t:`Lunch $12 -> Appetizers $6 [wings —, fries $4] · Entrees — [burger —] -> Salads $8 [cobb $10, garden —]`},
    ...rows.map(([id,v]) => ({t:`getItemPrice(menu, "${id}") -> ${money(v)}`})),
    {t:`wings takes Appetizers' 6; burger falls past a null Entrees to Lunch's 12; garden takes Salads' 8`},
  ], pass, verdict: pass?"the effective price is resolved at each node and passed down — closest defining ancestor always wins":`got ${JSON.stringify(rows)}`};
}

async function demoNullishTrap(){
  const strict = getItemPrice(PROMO_MENU, "water");
  const loose  = getItemPriceLoose(PROMO_MENU, "water");
  const chipsStrict = getItemPrice(PROMO_MENU, "chips");
  const chipsLoose  = getItemPriceLoose(PROMO_MENU, "chips");
  const pass = strict === 0 && loose === 9 && chipsStrict === 0 && chipsLoose === 9;
  return {lines:[
    {t:`Happy Hour $9 -> Drinks $0 [water —] · chips $0 (free with any drink)`},
    {t:`?? (nullish):  water -> ${money(strict)}   chips -> ${money(chipsStrict)}   ✓ free means free`},
    {t:`|| (falsy):    water -> ${money(loose)}   chips -> ${money(chipsLoose)}   ✗ both silently billed`},
    {t:`0 is falsy and is also a perfectly real price — the bug ships the day marketing adds a freebie`},
  ], pass, verdict: pass?"?? asks 'was a value defined?'; || asks 'is the value truthy?' — inheritance means the first question":`strict=${strict} loose=${loose}`};
}

async function demoAllMatches(){
  const cheap = findAllItems(PRICED_MENU, (item, eff) => (item.price ?? eff) <= 8).map(i => i.id);
  const first = findMenuItem(PRICED_MENU, "wings").id;
  const pass = cheap.join(",") === "wings,fries,garden" && first === "wings";
  return {lines:[
    {t:`"every item at $8 or less" — the same walk with the early return deleted`},
    {t:`matches: ${cheap.join(", ")}`},
    {t:`note the predicate gets the INHERITED price too — wings has none of its own`},
    {t:`find-first returns as soon as it knows; find-all can never return early — it's O(n), always`},
  ], pass, verdict: pass?"collect instead of return: push into an accumulator and let every branch finish":`cheap=${cheap}`};
}

async function demoPath(){
  const cobb = findItemPath(PRICED_MENU, "cobb");
  const wings = findItemPath(PRICED_MENU, "wings");
  const ghost = findItemPath(PRICED_MENU, "sushi");
  const pass = cobb.join(" > ") === "Lunch > Entrees > Salads > Cobb Salad"
    && wings.join(" > ") === "Lunch > Appetizers > Wings" && ghost === null;
  return {lines:[
    {t:`findItemPath(menu, "cobb")  -> ${cobb.join(" > ")}`},
    {t:`findItemPath(menu, "wings") -> ${wings.join(" > ")}`},
    {t:`findItemPath(menu, "sushi") -> ${String(ghost)}`},
    {t:`the trail is inherited state, exactly like the price: trail.concat(node.name) on the way down`},
  ], pass, verdict: pass?"concat hands each child its own array — nothing to undo when the branch fails":`cobb=${cobb}`};
}

async function demoFlatten(){
  const rows = flattenMenu(PRICED_MENU);
  const ids = rows.map(r => r.id).join(",");
  const prices = rows.map(r => r.price).join(",");
  const pass = ids === "wings,fries,burger,cobb,garden" && prices === "6,4,12,10,8" && rows.length === 5
    && rows[4].path.join(">") === "Lunch>Entrees>Salads>Garden Salad";
  return {lines:[
    {t:`one traversal, carrying BOTH inherited values (price and path)`},
    ...rows.map(r => ({t:`${r.id.padEnd(7)} ${String(money(r.price)).padEnd(4)} ${r.path.join(" > ")}`})),
    {t:`flat order is DFS order — that's why the export reads top-to-bottom like the printed menu`},
  ], pass, verdict: pass?"5 items, every price resolved, every path recorded — in a single O(n) pass":`ids=${ids} prices=${prices}`};
}

async function demoPriceMap(){
  const map = priceEveryItem(PRICED_MENU);
  const perItem = ["wings","fries","burger","cobb","garden"].map(id => getItemPrice(PRICED_MENU, id));
  const same = perItem.every((v,i) => v === map.get(["wings","fries","burger","cobb","garden"][i]));
  const pass = map.size === 5 && same && map.get("burger") === 12 && map.get("garden") === 8;
  return {lines:[
    {t:`priceEveryItem(menu) -> Map(${map.size})`},
    {t:[...map].map(([k,v]) => `${k}:${money(v)}`).join("  ")},
    {t:`five separate getItemPrice calls: ${perItem.map(money).join("  ")} — identical answers`},
    {t:`one pass instead of five walks, and the inherited value is already in hand at every node`},
  ], pass, verdict: pass?"the accumulator variant: same recursion, same carried state, no early return":`map=${[...map]}`};
}

async function demoIterative(){
  const rec = preorder(TREE);
  const it = preorderIterative(TREE);
  const naive = preorderIterativeNaive(TREE);
  const found = counted(() => findNodeIterative(TREE, "A1"));
  const pass = it.join(",") === rec.join(",") && naive.join(",") === "root,B,B1,A,A2,A1"
    && found.out.name === "A1" && found.visited === 3;
  return {lines:[
    {t:`recursive preorder:            ${rec.join(" -> ")}`},
    {t:`explicit stack, children reversed: ${it.join(" -> ")}  ✓ identical`},
    {t:`explicit stack, children in order: ${naive.join(" -> ")}  ✗ mirrored`},
    {t:`findNodeIterative(tree,"A1") visited ${found.visited} nodes — the early return still works, it's just a return`},
  ], pass, verdict: pass?"a stack IS the call stack; push children in reverse so the leftmost pops first":`it=${it} naive=${naive}`};
}

async function demoCycle(){
  const safe = counted(() => graphDfs(MENU_GRAPH, "lunch"));
  const naive = graphDfsNaive(MENU_GRAPH, "lunch");
  const combos = safe.out.filter(n => n === "Combos").length;
  const pass = safe.visited === 5 && combos === 1 && naive.length >= 40;
  return {lines:[
    {t:`graph: Lunch -> Apps, Entrees · both -> Combos · Specials -> Lunch (a back edge)`},
    {t:`with a visited set:    ${safe.out.join(" -> ")}`},
    {t:`each of the 5 nodes entered exactly once; Combos appears ${combos}× despite two parents`},
    {t:`without it: ${naive.slice(0,9).join(" -> ")} … (cut off at 40 — in reality, a stack overflow)`},
  ], pass, verdict: pass?"mark visited on ENTRY and never unmark: DFS on a graph is O(V+E) instead of forever":`visited=${safe.visited} naive=${naive.length}`};
}

async function demoIndex(){
  const ids = ["wings","fries","burger","cobb","garden"];
  const walked = counted(() => ids.map(id => getItemPrice(PRICED_MENU, id)));
  const idx = new MenuIndex(PRICED_MENU);
  const viaIndex = ids.map(id => idx.price(id));
  const pass = walked.out.join(",") === viaIndex.join(",") && idx.byId.size === 5 && walked.visited === 15;
  return {lines:[
    {t:`5 lookups by walking:  ${walked.visited} node visits total (a fresh DFS every time)`},
    {t:`5 lookups via index:   1 build pass, then ${idx.lookups} O(1) Map hits`},
    {t:`answers identical: ${viaIndex.map(money).join("  ")}`},
    {t:`worth it when reads outnumber writes; the cost is invalidation — the index must die when the menu changes`},
  ], pass, verdict: pass?"k lookups: O(k·n) walking vs O(n + k) indexed — preprocess once the k stops being 1":`walked=${walked.visited}`};
}

async function demoComplexity(){
  const n = countNodes(TREE), h = treeHeight(TREE);
  const worst = counted(() => findNode(TREE, "nope"));
  const best = counted(() => findNode(TREE, "root"));
  const pass = n === 6 && h === 3 && worst.visited === n && best.visited === 1;
  return {lines:[
    {t:`nodes n = ${n}, height h = ${h}`},
    {t:`worst case (target absent): visited ${worst.visited} = n  -> O(n) time`},
    {t:`best case  (target is root): visited ${best.visited}`},
    {t:`deepest simultaneous frames = h = ${h} -> O(h) space; a degenerate chain makes h = n`},
    {t:`say both numbers out loud, and say WHICH ONE the shape can blow up`},
  ], pass, verdict: pass?"O(n) time because each node is entered once; O(h) space because only one root-to-leaf path is live at a time":`n=${n} h=${h}`};
}
