"use strict";
/* DFS & Recursive Traversal Bootcamp — content pack: the interview
   follow-up drill bank (5 drills), the rest of spot-the-bug (3 cards), and
   the rest of write-it (4 exercises). Loaded after the lesson packs, before
   the engine. Everything appends into DRILLS.bank / BUGHUNT / WRITE; lesson
   back-links reference the final lesson indices (see the LESSON PLAN in
   content.js). */
(function () {

  /* =========================================================
     1. THE FOLLOW-UP BANK — the questions that come AFTER
        getItemPrice works
     ========================================================= */
  DRILLS.bank.push(

  { id:"allmatches", title:"Return all matches", why:"\"now give me every item under $8\"", demo:demoAllMatches,
    pre:`// same walk, but every match counts. pred gets the item
// AND its effective price, because most items have none
// of their own.
function findAllItems(node, pred, inherited = null, out = []) {
  const effective = node.price ?? inherited;
  for (const item of node.items || []) {
    if (pred(item, item.price ?? effective)) out.push(item);
  }`,
    blank:{ q:"The interviewer wants every cheap item, in menu order. Which body collects them all?",
      options:[
`  for (const group of node.groups || [])
    findAllItems(group, pred, effective, out);
  return out;`,
`  for (const group of node.groups || []) {
    const found = findAllItems(group, pred, effective, out);
    if (found.length) return found;
  }
  return out;`,
`  return (node.groups || []).flatMap(g =>
    findAllItems(g, pred, effective));`],
      answer:0,
      whys:["Right. Recurse into every group unconditionally, writing into the shared accumulator — no early return anywhere, because you can't know a later branch is empty without looking in it. This is O(n) by definition, and the results come out in DFS order, which is menu order.",
            "Returning as soon as one subgroup has matches is the short-circuit surviving from the find-first version — the exact reflex this follow-up exists to test. You'd get Appetizers' cheap items and silently drop the Garden Salad.",
            "flatMap without passing `out` builds a fresh array per subtree and returns only the SUBGROUPS' matches — this level's items, already pushed into `out`, are dropped on the floor. Mixing an accumulator with a returned-array style is how half the results vanish; pick one."] },
    post:`}
// pred = (item, price) => price <= 8  ->  wings, fries, garden` },

  { id:"pathto", title:"Return the path", why:"\"where is it on the menu?\" — children don't point at parents", demo:demoPath,
    pre:`// build the trail on the way DOWN — it's inherited state,
// exactly like the price.
function findItemPath(node, itemId, trail = []) {`,
    blank:{ q:"Which version reports the right path for an item found AFTER a failed branch?",
      options:[
`  const here = trail.concat(node.name);
  for (const item of node.items || [])
    if (item.id === itemId) return here.concat(item.name);
  for (const group of node.groups || []) {
    const found = findItemPath(group, itemId, here);
    if (found) return found;
  }
  return null;`,
`  trail.push(node.name);
  for (const item of node.items || [])
    if (item.id === itemId) return [...trail, item.name];
  for (const group of node.groups || []) {
    const found = findItemPath(group, itemId, trail);
    if (found) return found;
  }
  return null;`,
`  const here = trail.concat(node.name);
  for (const item of node.items || [])
    if (item.id === itemId) return here;
  for (const group of node.groups || []) {
    const found = findItemPath(group, itemId, here);
    if (found) return found;
  }
  return null;`],
      answer:0,
      whys:["Right. `concat` hands each frame its own array, so a branch that fails simply drops its copy — there is nothing to undo. The trail is state travelling down, the path is the answer travelling up, and the short-circuit still works unchanged.",
            "Push with no matching pop: Appetizers' name stays in the shared array after its branch returns null, so the path reported for the Cobb Salad includes a section it isn't in. Push/pop is fine — but the pop has to happen on EVERY exit path, which is the bug interviewers plant here.",
            "Returns the path to the item's GROUP, not to the item — `[\"Lunch\",\"Appetizers\"]` instead of `[\"Lunch\",\"Appetizers\",\"Wings\"]`. Off by one element, and it reads correct in a demo where the caller appends the name anyway."] },
    post:`}
// "cobb" -> ["Lunch", "Entrees", "Salads", "Cobb Salad"]` },

  { id:"flatten", title:"Flatten the menu", why:"one pass, two carried values, one flat list", demo:demoFlatten,
    pre:`// "export every item with its real price and where it lives"
function flattenMenu(node, inherited = null, trail = [], out = []) {
  const effective = node.price ?? inherited;
  const here = trail.concat(node.name);`,
    blank:{ q:"Which body produces one row per item, in menu order, with inheritance already resolved?",
      options:[
`  for (const item of node.items || [])
    out.push({ id: item.id, name: item.name,
               price: item.price ?? effective,
               path: here.concat(item.name) });
  for (const group of node.groups || [])
    flattenMenu(group, effective, here, out);
  return out;`,
`  for (const item of node.items || [])
    out.push({ id: item.id, name: item.name,
               price: getItemPrice(node, item.id, inherited),
               path: here.concat(item.name) });
  for (const group of node.groups || [])
    flattenMenu(group, effective, here, out);
  return out;`,
`  for (const item of node.items || [])
    out.push({ id: item.id, name: item.name,
               price: item.price, path: here });
  for (const group of node.groups || [])
    flattenMenu(group, effective, here, out);
  return out;`],
      answer:0,
      whys:["Right. Both carried values are already resolved in this frame, so each row is built with no extra work: the price falls back to `effective`, the path is `here` plus the item's own name. One visit per node, O(n) time, O(n) output, DFS order — which is the order the printed menu reads in.",
            "Calling the single-item search from inside the traversal re-walks the subtree once per item: O(n²), re-deriving a value the frame is already holding in `effective`. This is the most common way a 'flatten it' follow-up goes quadratic without anyone noticing on a five-item menu.",
            "Two bugs in three lines: `item.price` skips inheritance entirely (every inheriting item exports as null), and `path` stops at the group, so every item in a section shares one path that doesn't name it. Both look right until you read the output."] },
    post:`}
// [{wings, 6, [Lunch, Appetizers, Wings]}, … 5 rows]` },

  { id:"bfsvsdfs", title:"DFS or BFS", why:"the question decides, not the structure", demo:demoBfsContrast,
    pre:`// the menu app needs: "how many clicks from the home menu
// to reach this item?" — the FEWEST, over a structure where
// an item can appear in more than one section.
//
// same nodes, same O(n). the container decides the order:
//   stack.pop()   -> depth-first
//   queue.shift() -> breadth-first`,
    blank:{ q:"Fewest clicks, over a structure with shared nodes. Which traversal answers it, and why?",
      options:[
`// BFS: the first time it reaches the item, it arrived by a
// shortest path — levels are drained in order. cost: the
// frontier is O(width), and each queued node must carry its
// own depth.`,
`// DFS: the first path it finds is the shortest, because it
// commits to one branch and never revisits a node.`,
`// DFS, then take the minimum depth over all matches — same
// answer as BFS and simpler to write.`],
      answer:0,
      whys:["Right. BFS visits every node at depth d before any node at depth d+1, so the first arrival is by a minimum-hop path — that's the definition of the shortest-path traversal. The costs to name out loud: O(width) memory for the frontier (on a wide menu, most of it), and no free ancestor context, so depth (or the path) has to be queued alongside each node.",
            "DFS's first path is just the leftmost one — it commits to a branch, and that branch may reach the item after ten hops when a sibling reaches it in two. Depth-first makes no claim about distance whatsoever; that's exactly the claim BFS exists to make.",
            "It does give the right answer — after exploring the ENTIRE structure, because you can't take a minimum until you've seen every match. BFS stops at the first arrival. If the structure is small and you already have a DFS, this is a defensible pragmatic call; say it that way rather than as the better algorithm."] },
    post:`// and the rest of the app still uses DFS: the price cascade,
// the export, the breadcrumb — all of them need ancestor
// state, which DFS carries for free and BFS does not.` },

  { id:"indexit", title:"Index the repeated lookups", why:"k lookups: O(k·n) walked vs O(n + k) indexed", demo:demoIndex,
    pre:`// the menu page calls getItemPrice for every row, on every
// render. the menu itself changes when someone publishes a
// new one — maybe twice a day.
class MenuIndex {
  constructor(menu) { this.menu = menu; this.rebuild(); }`,
    blank:{ q:"Which build makes lookups O(1) and keeps the expensive part of the work out of them?",
      options:[
`  rebuild() {
    this.byId = new Map(
      flattenMenu(this.menu).map(r => [r.id, r]));
  }
  price(id) {
    return this.byId.has(id) ? this.byId.get(id).price : null;
  }`,
`  rebuild() { this.byId = new Map(); }
  price(id) {
    if (!this.byId.has(id))
      this.byId.set(id, getItemPrice(this.menu, id));
    return this.byId.get(id);
  }`,
`  rebuild() {
    this.ids = flattenMenu(this.menu).map(r => r.id);
  }
  price(id) {
    return this.ids.includes(id)
      ? getItemPrice(this.menu, id) : null;
  }`],
      answer:0,
      whys:["Right. One DFS resolves every inherited price and path, and every later lookup is a Map hit. O(n) once, O(1) each — and because the traversal already had the effective price in hand, the expensive part is paid exactly once. `rebuild()` being a method is the other half: the index is a cache, and something has to own invalidating it on publish.",
            "Lazy memoization: correct, and it still pays a full O(n) walk for every DISTINCT id — on a page that renders every item, that's O(n²) on the first render and nothing saved. Memoizing is the right tool when lookups are sparse and repeated; here you're going to ask for all of them.",
            "An index that stores only which ids exist, then re-walks the menu to price each one: O(n) per lookup plus an O(n) `includes` scan on top. It has the shape of an optimization and does no work that helps — the lookup still traverses, which was the cost you were trying to remove."] },
    post:`  // and the part nobody budgets for:
  // whoever can change the menu owns calling rebuild().
  // an index someone can edit around is worse than none.
}` },
  );

  /* =========================================================
     2. SPOT THE BUG — three more
     ========================================================= */
  BUGHUNT.push(

  { id:"bug_trailpop", title:"Breadcrumb builder", why:"a shared array remembers the branches that failed", lesson:14,
    scenario:"Breadcrumbs are right for everything in the first section and wrong for everything after it — \"Lunch › Appetizers › Entrees › Salads › Cobb Salad\" — and the extra crumbs are always sections the item isn't in. The item itself is always found correctly. Which line leaves the litter?",
    lines:[
      "// returns [\"Lunch\", \"Entrees\", \"Salads\", \"Cobb Salad\"]",
      "function findItemPath(node, itemId, trail = []) {",
      "  trail.push(node.name);",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return [...trail, item.name];",
      "  }",
      "  for (const group of node.groups || []) {",
      "    const found = findItemPath(group, itemId, trail);",
      "    if (found) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    bug:[10],
    explain:"Line 11 returns null without undoing line 3's push. The array is shared by every frame, so a branch that fails leaves its own name — and its failed descendants' names — behind for the siblings that follow. Appetizers is searched, fails, and stays in the trail while Entrees is searched, so the reported path names a section the item isn't in. The traversal is fine; only the path is corrupted, which is worse than a crash because the output still looks plausible. Two fixes: `trail.pop(); return null;` (a pop on every exit path, forever, including any future early return), or stop sharing — `const here = trail.concat(node.name)` gives each frame its own array and nothing to unwind." },

  { id:"bug_stackorder", title:"Iterative menu walk", why:"pop takes the newest — so push the first child last", lesson:17,
    scenario:"The recursion was replaced with an explicit stack to survive deeply nested menus. It does: no more stack overflows, every item still exported. But the printed menu now reads bottom-up — Desserts before Entrees before Appetizers, and inside each section the subgroups are reversed too. Which line flips it?",
    lines:[
      "function flattenIterative(root) {",
      "  const out = [], stack = [[root, null]];",
      "  while (stack.length) {",
      "    const [node, inherited] = stack.pop();",
      "    const effective = node.price ?? inherited;",
      "    for (const item of node.items || []) {",
      "      out.push({ id: item.id, price: item.price ?? effective });",
      "    }",
      "    for (const group of node.groups || []) {",
      "      stack.push([group, effective]);",
      "    }",
      "  }",
      "  return out;",
      "}",
    ],
    bug:[9],
    explain:"Line 10 pushes the subgroups in natural order, and line 4 pops the most recent — so the LAST group pushed is the first one processed, and the whole menu comes out mirrored at every level. It's still a valid depth-first walk (every node visited once, inherited prices correct), which is why the tests that check \"all items present\" pass and only the export's reading order is wrong. Push in reverse so the leftmost child lands on top: `const groups = node.groups || []; for (let i = groups.length - 1; i >= 0; i--) stack.push([groups[i], effective]);`. This is the one detail that separates a correct recursion-to-stack conversion from a mirrored one." },

  { id:"bug_visitedlate", title:"Shared-group traversal", why:"mark on entry, or the mark never gets the chance", lesson:18,
    scenario:"The menu became a graph: a \"Combo Platter\" group now appears under both Appetizers and Entrees. Someone added a visited set. Duplicate rows are gone, but the export takes minutes on a large menu, and the day a section linked back to the root it blew the stack anyway. Which line(s) make the guard useless?",
    lines:[
      "function collect(graph, id, visited = new Set(), out = []) {",
      "  if (visited.has(id)) return out;",
      "  out.push(graph[id].name);",
      "  for (const next of graph[id].children) {",
      "    collect(graph, next, visited, out);",
      "  }",
      "  visited.add(id);",
      "  return out;",
      "}",
    ],
    bug:[6],
    explain:"Line 7 marks the node AFTER its entire subtree has been explored, so the guard on line 2 can never fire for a node that is still on the stack — which is precisely the cycle case. A back edge re-enters a node that hasn't been marked yet and recurses forever. The shared-group case is only half-fixed too: the second parent does see the mark (by then the subtree is finished), so duplicates disappear, but any node reachable through a cycle is re-walked, which is where the minutes go. Mark on ENTRY, immediately after the check — `if (visited.has(id)) return out; visited.add(id);` — and never unmark. (Unmarking on the way out is a different algorithm entirely: that Set means \"nodes on the current path\", and it belongs to cycle detection, not to a one-pass collection.)" },
  );

  /* =========================================================
     3. WRITE IT — four more
     ========================================================= */
  WRITE.push(

  { id:"w-path", title:"findItemPath — write it", why:"\"and where is it on the menu?\"", lesson:14,
    spec:"Write findItemPath(node, itemId, trail = []): return the array of names from the root down to the matching item — [\"Lunch\", \"Entrees\", \"Salads\", \"Cobb Salad\"] — or null if the item isn't on the menu. A branch that fails must not leave its name in a later branch's path.",
    pre:`// node: { name, items: [{ id, name }], groups: [ ...nodes ] }
// return names root-first, ending with the ITEM's own name.`,
    post:`// a failed branch must leave no trace in the next one.`,
    lines:[
      "function findItemPath(node, itemId, trail = []) {",
      "  const here = trail.concat(node.name);",
      "  for (const item of node.items || []) {",
      "    if (item.id === itemId) return here.concat(item.name);",
      "  }",
      "  for (const group of node.groups || []) {",
      "    const found = findItemPath(group, itemId, here);",
      "    if (found) return found;",
      "  }",
      "  return null;",
      "}",
    ],
    distractors:[
      { code:"  trail.push(node.name);",
        why:"Mutating the shared array needs a matching pop on every exit path — miss one and a failed branch leaves its name in the path reported for a later item." },
      { code:"    if (item.id === itemId) return here;",
        why:"Returns the path to the item's GROUP, stopping one element short: [\"Lunch\",\"Appetizers\"] instead of [\"Lunch\",\"Appetizers\",\"Wings\"]." },
      { code:"    const found = findItemPath(group, itemId, trail);",
        why:"Passes the trail this frame RECEIVED instead of the one it extended, so every path skips the intermediate groups — the Cobb Salad comes back as [\"Lunch\",\"Cobb Salad\"]." },
    ],
    test:`const menu = { name: "Lunch", groups: [
  { name: "Appetizers", items: [ { id: "wings", name: "Wings" } ], groups: [] },
  { name: "Entrees", items: [ { id: "burger", name: "Burger" } ], groups: [
    { name: "Salads", items: [ { id: "cobb", name: "Cobb Salad" } ], groups: [] } ] },
] };
const wings = findItemPath(menu, "wings");
assert(wings.join(" > ") === "Lunch > Appetizers > Wings", "got " + JSON.stringify(wings));
const cobb = findItemPath(menu, "cobb");
log("cobb -> " + cobb.join(" > "));
assert(cobb.join(" > ") === "Lunch > Entrees > Salads > Cobb Salad",
  "the path must skip the Appetizers branch that failed first, got " + JSON.stringify(cobb));
const burger = findItemPath(menu, "burger");
assert(burger.join(" > ") === "Lunch > Entrees > Burger", "got " + JSON.stringify(burger));
assert(findItemPath(menu, "sushi") === null, "an absent id returns null");
// run them again in a different order: a leaked trail shows up as drift
const again = findItemPath(menu, "cobb");
assert(again.join(" > ") === cobb.join(" > "), "repeated calls must return identical paths, got " + JSON.stringify(again));
assert(findItemPath(menu, "wings").length === 3, "and the earlier path must not have grown, got " + findItemPath(menu, "wings").length);
log("four lookups, no drift — nothing leaked between branches");`,
    pass:"every path correct, including the one that had to walk past a failed branch first — and no drift across repeated calls",
    takeaway:"The trail is inherited state, same as the price: build it on the way down, return it on the way up. `concat` gives each frame its own array, so a dead end costs you nothing and there is no cleanup to forget.",
    hint:"First line of the body: `const here = trail.concat(node.name);`. Items return `here.concat(item.name)`. Groups recurse with `here` (not `trail`), capturing the result and returning it only if truthy." },

  { id:"w-flatten", title:"flattenMenu — write it", why:"the export ticket: every item, priced, with its location", lesson:15,
    spec:"Write flattenMenu(node, inherited = null, trail = [], out = []): one pass producing a row per item — { id, name, price, path } — with inherited prices resolved and the full path recorded. Rows must come out in DFS (menu) order. A declared price of 0 is real.",
    pre:`// node: { name, price, items: [{ id, name, price }], groups: [...] }
// one traversal, two carried values, one flat list.`,
    post:`// rows in DFS order = the order the printed menu reads in.`,
    lines:[
      "function flattenMenu(node, inherited = null, trail = [], out = []) {",
      "  const effective = node.price ?? inherited;",
      "  const here = trail.concat(node.name);",
      "  for (const item of node.items || []) {",
      "    out.push({ id: item.id, name: item.name,",
      "               price: item.price ?? effective,",
      "               path: here.concat(item.name) });",
      "  }",
      "  for (const group of node.groups || []) {",
      "    flattenMenu(group, effective, here, out);",
      "  }",
      "  return out;",
      "}",
    ],
    distractors:[
      { code:"               price: item.price || effective,",
        why:"A free item's declared 0 is falsy, so it exports at the section's price — the export is where a pricing bug becomes a printed menu." },
      { code:"    return flattenMenu(group, effective, here, out);",
        why:"Returning inside the group loop ends the whole traversal after the first subgroup: the export silently contains one branch and stops." },
      { code:"    const rows = flattenMenu(group, effective, here);",
        why:"Building a fresh array per subtree and never merging it drops every nested group's rows on the floor — the export contains only top-level items." },
    ],
    test:`const menu = { name: "Lunch", price: 12, groups: [
  { name: "Appetizers", price: 6, groups: [], items: [
    { id: "wings", name: "Wings", price: null }, { id: "fries", name: "Fries", price: 4 } ] },
  { name: "Entrees", price: null, items: [ { id: "burger", name: "Burger", price: null } ], groups: [
    { name: "Salads", price: 8, groups: [], items: [
      { id: "cobb", name: "Cobb Salad", price: 10 }, { id: "garden", name: "Garden Salad", price: null } ] } ] },
] };
const rows = flattenMenu(menu);
assert(rows.length === 5, "one row per item: 5, got " + rows.length);
assert(rows.map(r => r.id).join(",") === "wings,fries,burger,cobb,garden",
  "rows must come out in DFS order, got " + rows.map(r => r.id).join(","));
assert(rows.map(r => r.price).join(",") === "6,4,12,10,8",
  "prices must be resolved, got " + rows.map(r => r.price).join(","));
rows.forEach(r => log(r.id + "  $" + r.price + "  " + r.path.join(" > ")));
const garden = rows[4];
assert(garden.path.join(">") === "Lunch>Entrees>Salads>Garden Salad", "full path, got " + garden.path.join(">"));
assert(rows[0].path.join(">") === "Lunch>Appetizers>Wings", "paths must not leak between branches");
const promo = { name: "HH", price: 9, items: [], groups: [
  { name: "Free", price: 0, groups: [], items: [ { id: "water", name: "Water", price: null } ] } ] };
assert(flattenMenu(promo)[0].price === 0, "a 0 price must survive into the export");
assert(flattenMenu({ name: "Empty" }).length === 0, "a node with no items or groups yields no rows and must not throw");`,
    pass:"five rows, DFS order, every price resolved, every path intact — and the free item still free",
    takeaway:"Find-all, path, and price are the same traversal with more carried in the frame. When the follow-ups stack up like this, the parameter list grows and the algorithm doesn't.",
    hint:"Resolve both carried values first (`effective` from `node.price ?? inherited`, `here` from `trail.concat(node.name)`), push one row per item using them, then recurse into each group with BOTH — and no return inside the group loop." },

  { id:"w-iterative", title:"Explicit stack — write it", why:"\"now do it without recursion\"", lesson:17,
    spec:"Write preorderIterative(root): return the node names of an n-ary tree in preorder, using an explicit stack instead of recursion — the output must be byte-identical to the recursive version, including order. A tree 50,000 deep must not throw.",
    pre:`// { name, children: [] } -> ["root", "A", "A1", "A2", "B", "B1"]
// you keep the stack now; the call stack was doing it for you.`,
    post:`// same nodes, same O(n) — and no call-stack limit to hit.`,
    lines:[
      "function preorderIterative(root) {",
      "  const out = [], stack = [root];",
      "  while (stack.length) {",
      "    const node = stack.pop();",
      "    out.push(node.name);",
      "    for (let i = node.children.length - 1; i >= 0; i--) {",
      "      stack.push(node.children[i]);",
      "    }",
      "  }",
      "  return out;",
      "}",
    ],
    distractors:[
      { code:"    for (const child of node.children) stack.push(child);",
        why:"Natural push order plus pop() mirrors the traversal: root, B, B1, A, A2, A1. Still depth-first, still every node — and the wrong order everywhere order matters." },
      { code:"    const node = stack.shift();",
        why:"shift() takes the oldest, which makes this breadth-first: root, A, B, A1, A2, B1. One word turns a DFS into a BFS." },
      { code:"    if (!node.children.length) continue;",
        why:"Harmless-looking and pointless: a leaf's loop already runs zero times. It's the iterative version of inventing a leaf base case — extra branch, no behavior change, one more thing to get wrong." },
    ],
    test:`const tree = { name: "root", children: [
  { name: "A", children: [ { name: "A1", children: [] }, { name: "A2", children: [] } ] },
  { name: "B", children: [ { name: "B1", children: [] } ] },
] };
const got = preorderIterative(tree);
log("iterative: " + got.join(" -> "));
assert(got.join(",") === "root,A,A1,A2,B,B1", "must match the recursive order exactly, got " + got.join(","));
const leaf = preorderIterative({ name: "only", children: [] });
assert(leaf.join(",") === "only", "a lone root returns just itself, got " + leaf.join(","));
const wide = { name: "w", children: [1,2,3,4,5].map(i => ({ name: "c" + i, children: [] })) };
assert(preorderIterative(wide).join(",") === "w,c1,c2,c3,c4,c5", "wide nodes keep left-to-right order");
// a 50,000-deep chain: the whole reason to go iterative
let chain = { name: "leaf", children: [] };
for (let i = 0; i < 50000; i++) chain = { name: "n" + i, children: [chain] };
const deep = preorderIterative(chain);
assert(deep.length === 50001, "must walk a 50k-deep chain, got " + deep.length);
assert(deep[0] === "n49999" && deep[deep.length - 1] === "leaf", "and in the right order");
log("50,001 nodes deep, no RangeError — the recursion would have died around 10k");`,
    pass:"identical order to the recursion, and it survived a chain 50,000 levels deep",
    takeaway:"pop() takes the newest, so the child you want first must be pushed last. That one reversal is the whole difference between a faithful conversion and a mirrored traversal — and the depth limit is now heap memory instead of the engine's frame budget.",
    hint:"`const stack = [root]`, then while the stack isn't empty: pop, push the name, and push the children in REVERSE index order so children[0] ends up on top." },

  { id:"w-graph", title:"Cycle-safe DFS — write it", why:"\"what if a group appears in two places?\"", lesson:18,
    spec:"Write collect(graph, id, visited = new Set(), out = []): walk an adjacency map { id: { name, children: [ids] } } depth-first and return each reachable node's name exactly once, in DFS order. The graph may contain shared nodes AND cycles — it must terminate either way.",
    pre:`// graph: { lunch: { name: "Lunch", children: ["apps", "entrees"] }, ... }
// children are IDS, not nested objects — and an id may point back up.`,
    post:`// every reachable node exactly once -> O(V + E).`,
    lines:[
      "function collect(graph, id, visited = new Set(), out = []) {",
      "  if (visited.has(id)) return out;",
      "  visited.add(id);",
      "  out.push(graph[id].name);",
      "  for (const next of graph[id].children) {",
      "    collect(graph, next, visited, out);",
      "  }",
      "  return out;",
      "}",
    ],
    distractors:[
      { code:"  visited.delete(id);",
        why:"Unmarking on the way out re-explores every shared subtree from every parent (exponential on a DAG) and lets a cycle loop forever. That Set belongs to cycle DETECTION, where it means \"nodes on the current path\" — a different question." },
      { code:"    if (!visited.has(next)) collect(graph, next, visited, out);",
        why:"Checking at the call site instead of on entry works only if NOTHING else calls the function — the recursive entry point is the one place the guard is guaranteed to run, which is why it belongs there." },
      { code:"  out.push(id);",
        why:"Pushes the id rather than the node's name: [\"lunch\",\"apps\"] instead of [\"Lunch\",\"Apps\"]. The traversal is right and the output is the wrong field — the quietest kind of wrong." },
    ],
    test:`const graph = {
  lunch:    { name: "Lunch",    children: ["apps", "entrees"] },
  apps:     { name: "Apps",     children: ["combos"] },
  entrees:  { name: "Entrees",  children: ["combos", "specials"] },
  combos:   { name: "Combos",   children: [] },
  specials: { name: "Specials", children: ["lunch"] },
};
const out = collect(graph, "lunch");
log("walk: " + out.join(" -> "));
assert(out.join(",") === "Lunch,Apps,Combos,Entrees,Specials",
  "DFS order, each node once, got " + out.join(","));
assert(out.filter(n => n === "Combos").length === 1,
  "Combos has two parents and must still appear exactly once");
assert(out.length === 5, "all 5 reachable nodes, got " + out.length);
const fromEntrees = collect(graph, "entrees");
assert(fromEntrees.join(",") === "Entrees,Combos,Specials,Lunch,Apps",
  "starting elsewhere follows the back edge into the rest, got " + fromEntrees.join(","));
const selfLoop = { a: { name: "A", children: ["a", "b"] }, b: { name: "B", children: ["a"] } };
assert(collect(selfLoop, "a").join(",") === "A,B", "a self-loop must terminate, got " + collect(selfLoop, "a").join(","));
const lone = { x: { name: "X", children: [] } };
assert(collect(lone, "x").join(",") === "X", "a node with no edges returns just itself");
log("shared node, back edge, and a self-loop — all terminated");`,
    pass:"five nodes, one visit each, and the back edge to Lunch stopped instead of recursing forever",
    takeaway:"Check and mark on ENTRY, never unmark. That one line converts tree DFS into graph DFS — it kills the infinite cycle and the duplicate subtree work at the same time, for O(V) extra space.",
    hint:"Body order matters: `if (visited.has(id)) return out;` then `visited.add(id);` then record the NAME, then recurse into every child unconditionally — the guard at the top of the next call is what stops it." },
  );

})();
