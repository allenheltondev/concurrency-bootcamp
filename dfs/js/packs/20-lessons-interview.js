"use strict";
/* DFS & Recursive Traversal Bootcamp — content pack: the interview
   follow-ups, complexity, and the narration. Loaded after 10-lessons-menu.js
   (this pack APPENDS lessons 13-21, so load order is arc order).

   Registers:
     1. lessons 13-21 — all of them, one per follow-up the interviewer asks
        after getItemPrice works, then complexity, then how to say it
     2. two more trace-the-recursion quiz questions
     3. one flashcard
   Cross-links use the FINAL lesson indices documented in content.js. */
(function () {

  /* =========================================================
     1. LESSONS 13-21
     ========================================================= */
  LESSONS.push(

  { eb:"lesson 14 · follow-ups", title:"Now return all of them", html:`
    <p class="big">"Good. Now give me every item under $8, not just the first." <b class="hl">Delete the early return, add an accumulator, keep everything else.</b> The carried state doesn't change; the stopping rule does.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">find-first vs find-all &middot; the same recursion, two stopping rules</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">first</div><div class="lstep seq" style="--i:0"><code>if (found) return found;</code> &middot; may stop early &middot; O(n) worst case, often far less</div>
        <div class="lanehead seq" style="--i:1">all</div><div class="lstep good seq" style="--i:1"><code>out.push(item)</code> &middot; <b>never</b> returns early &middot; O(n), always, by definition</div>
        <div class="lanehead seq" style="--i:2">why</div><div class="lstep seq" style="--i:2">you can't know a later branch has no matches without looking in it</div>
        <div class="lanehead seq" style="--i:3">order</div><div class="lstep good seq pop" style="--i:3">the result comes out in <b>DFS order</b> &mdash; which is menu order, which is usually what the UI wants</div>
      </div>
      <div class="dnote seq" style="--i:4">Two ways to collect, and both are fine: push into an <code>out</code> array threaded through the calls, or have each call <b style="color:var(--ordered)">return an array and concat the children's</b>. The accumulator allocates once; concat is easier to reason about. Say which you picked and why.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>One subtlety worth volunteering: the predicate usually needs the <b class="hl">inherited</b> value, not the item's own field. "Items under $8" means <i>effective</i> price under 8 — wings has no price of its own, and filtering on <code>item.price</code> would silently skip every item that inherits. The carried state is still carried; it's now an argument to the test rather than the answer.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; find-all, with the inherited value in hand</div>
      <pre class="code">function findAllItems(node, pred, inherited = null, out = []) {
  const effective = node.price ?? inherited;
  for (const item of node.items || [])
    if (pred(item, item.price ?? effective)) out.push(item);   <span class="cm">// no return</span>
  for (const group of node.groups || [])
    findAllItems(group, pred, effective, out);
  return out;
}
<span class="ok">// pred = (item, price) =&gt; price &lt;= 8  ->  wings, fries, garden</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this follow-up is testing whether you understood the short-circuit or just memorized it. If you know why the early return has to go — and can say "this one is O(n) no matter what, because absence of a match in a branch is only knowable by looking" — the rest is typing.</p>` },

  { eb:"lesson 15 · follow-ups", title:"Now return the path", html:`
    <p class="big">"Where is it on the menu?" — you need <code>["Lunch", "Entrees", "Salads", "Cobb Salad"]</code>, and the item object can't tell you: <b class="hl">children don't point at their parents.</b> But the path is just another value that travels down, exactly like the price.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">two ways to carry the trail &middot; one of them needs cleanup</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">concat</div><div class="lstep good seq" style="--i:0"><code>const here = trail.concat(node.name);</code> &mdash; a fresh array per frame, <b>nothing to undo</b></div>
        <div class="lanehead seq" style="--i:1">push/pop</div><div class="lstep seq" style="--i:1"><code>trail.push(name)</code> … recurse … <code>trail.pop()</code> &mdash; one array, and the pop is <b>mandatory</b></div>
        <div class="lanehead seq" style="--i:2">forgot</div><div class="lstep bad seq pop" style="--i:2">no pop &rarr; Appetizers stays in the trail while you search Entrees &rarr; every path after the first is wrong</div>
      </div>
      <div class="flowarrow seq" style="--i:3">&darr; the classic backtracking bug, and why interviewers plant it &darr;</div>
      <div class="dnote seq" style="--i:4">Missing-pop bugs are <b style="color:var(--ordered)">order-dependent</b>: the first path found is correct, every later one carries its siblings' names. On a one-branch fixture the tests pass. Prefer <code>concat</code> unless the trail is hot enough for the allocation to matter — then push/pop, with the pop on every exit path.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Paths generalize the same way prices do: swap names for ids and you have a breadcrumb the UI can link; keep the node objects and you have the ancestor chain for a "move this item" operation; count instead of collecting and you have the depth. <b class="hl">One parameter, three features.</b></p>
    <div class="impl">
      <div class="dlabel">reference &middot; concat version, no cleanup needed</div>
      <pre class="code">function findItemPath(node, itemId, trail = []) {
  const here = trail.concat(node.name);
  for (const item of node.items || [])
    if (item.id === itemId) return here.concat(item.name);
  for (const group of node.groups || []) {
    const found = findItemPath(group, itemId, here);
    if (found) return found;                  <span class="cm">// short-circuit survives</span>
  }
  return null;
}
<span class="ok">// "cobb" -> ["Lunch", "Entrees", "Salads", "Cobb Salad"]</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "return the path" is the most common second follow-up in tree interviews, and the push/pop version is where candidates lose the thread under time pressure. Choosing <code>concat</code> and saying <i>"a fresh array per frame so there's nothing to unwind"</i> removes an entire class of bug from the whiteboard.</p>` },

  { eb:"lesson 16 · follow-ups", title:"Now flatten the whole thing", html:`
    <p class="big">"We need to export the menu as a flat list — every item, with its full price and where it lives." This is find-all plus path plus price, and it's <b class="hl">one traversal carrying two inherited values into one accumulator</b>. Nothing new; just all of it at once.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">one pass &middot; two things carried down &middot; one list coming back</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">down</div><div class="lstep seq" style="--i:0"><code>effective</code> (price) and <code>here</code> (trail) &mdash; resolved fresh at each node</div>
        <div class="lanehead seq" style="--i:1">at a node</div><div class="lstep good seq" style="--i:1">every item becomes a row: id, name, resolved price, full path</div>
        <div class="lanehead seq" style="--i:2">up</div><div class="lstep seq" style="--i:2">nothing &mdash; the accumulator is shared by reference, so there's nothing to merge</div>
        <div class="lanehead seq" style="--i:3">order</div><div class="lstep good seq pop" style="--i:3">DFS order = printed-menu order &mdash; the export reads top to bottom like the real thing</div>
      </div>
      <div class="dnote seq" style="--i:4">That last line is a genuine product win worth mentioning out loud: <b style="color:var(--ordered)">DFS order is the order humans read a nested document in</b>. BFS would emit every section header, then every appetizer and entrée interleaved — technically complete, useless as an export.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Flattening is also the natural place to say the complexity story cleanly: <b class="hl">O(n) time, O(n) output, O(h) stack</b>. And it's the setup for the last follow-up — once you have a flat list, building a lookup index from it is one <code>Map</code> and a loop, which is lesson 20.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; everything at once</div>
      <pre class="code">function flattenMenu(node, inherited = null, trail = [], out = []) {
  const effective = node.price ?? inherited;
  const here = trail.concat(node.name);
  for (const item of node.items || []) {
    out.push({ id: item.id, name: item.name,
               price: item.price ?? effective,
               path: here.concat(item.name) });
  }
  for (const group of node.groups || [])
    flattenMenu(group, effective, here, out);
  return out;
}
<span class="ok">// [{wings,$6,Lunch&gt;Appetizers&gt;Wings}, … {garden,$8,…&gt;Salads&gt;Garden Salad}]</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "flatten it" is the follow-up that proves the pattern generalized in your head. If your <code>getItemPrice</code> was shaped right, this function is a five-minute edit — and that's visible to the interviewer.</p>` },

  { eb:"lesson 17 · follow-ups", title:"Price every item, without going quadratic", html:`
    <p class="big">"Now the effective price for every item." The trap is comfortable and expensive: <b class="hl">walk the menu, and for each item call <code>getItemPrice</code></b> — which walks the menu again. That's O(n) items × O(n) search, and an interviewer will ask for the complexity the second you finish.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">the same answers &middot; two very different bills</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">✗ n²</div><div class="lstep bad seq" style="--i:0">traverse, and call <code>getItemPrice(root, item.id)</code> per item &mdash; re-deriving state you're already holding</div>
        <div class="lanehead seq" style="--i:1">✓ n</div><div class="lstep good seq" style="--i:1">one traversal &middot; <code>out.set(item.id, item.price ?? effective)</code> &mdash; the value is right there in the frame</div>
        <div class="lanehead seq" style="--i:2">tell</div><div class="lstep seq" style="--i:2">any time a recursive helper is called from <b>inside</b> a traversal over the same structure, suspect n²</div>
      </div>
      <div class="dnote seq" style="--i:3">The insight is small and worth saying: <b style="color:var(--ordered)">at every node, the inherited value is already resolved</b> — that's the whole point of carrying it. Re-searching from the root throws away the work the traversal just did.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The same shape answers the whole family of "compute X for everything" questions: total cost of the menu (sum on the way up), count of items per section (a return value), the cheapest item under each group (a reduce on the way out). <b class="hl">Carried state going down, aggregate coming up</b> — and the accumulator when every node contributes to one shared result.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; one pass, every price</div>
      <pre class="code">function priceEveryItem(node, inherited = null, out = new Map()) {
  const effective = node.price ?? inherited;
  for (const item of node.items || [])
    out.set(item.id, item.price ?? effective);
  for (const group of node.groups || [])
    priceEveryItem(group, effective, out);
  return out;
}
<span class="ok">// Map(5) { wings:6, fries:4, burger:12, cobb:10, garden:8 }  — O(n)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> accidental O(n²) is the most common complexity mistake in this exact problem, and it's invisible on a five-item menu. Catching it yourself — "I could call getItemPrice per item, but that re-walks the tree; I'll accumulate in one pass instead" — is worth more than the code.</p>` },

  { eb:"lesson 18 · follow-ups", title:"Now do it without recursion", html:`
    <p class="big">"What if the menu nests ten thousand deep?" The recursion overflows the call stack, so <b class="hl">you keep the stack yourself</b> — an array, a <code>while</code> loop, and one detail that decides whether the output order matches.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">pop order &middot; the one thing people get wrong</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">rule</div><div class="lstep seq" style="--i:0"><code>pop()</code> takes the NEWEST &rarr; the child you want first must be pushed <b>last</b></div>
        <div class="lanehead seq" style="--i:1">✓</div><div class="lstep good seq" style="--i:1">push children in <b>reverse</b> &rarr; root, A, A1, A2, B, B1 &mdash; identical to the recursion</div>
        <div class="lanehead seq" style="--i:2">✗</div><div class="lstep bad seq" style="--i:2">push in natural order &rarr; root, B, B1, A, A2, A1 &mdash; still depth-first, mirrored</div>
        <div class="lanehead seq" style="--i:3">state</div><div class="lstep seq" style="--i:3">carrying inherited values? push <b>pairs</b>: <code>stack.push([child, effective])</code></div>
      </div>
      <div class="dnote seq" style="--i:4">That last row is the real cost of going iterative: the call stack was storing your locals for free. <b style="color:var(--ordered)">Now every piece of carried state must be pushed alongside the node</b> — which is exactly why the recursive version is the one you write first.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Be honest about when this matters, because the interviewer knows: JavaScript engines allow somewhere in the <b class="hl">10,000-frame range</b> before a <code>RangeError</code>, and no restaurant menu is 10,000 groups deep. A file system, a comment thread, a linked-list-shaped JSON blob, or user-supplied data can be. <i>"I'd write it recursively, and switch to an explicit stack if the depth is unbounded or attacker-controlled"</i> is the complete answer.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the stack, with carried state</div>
      <pre class="code">function priceIterative(root, itemId) {
  const stack = [[root, null]];                   <span class="cm">// node + inherited</span>
  while (stack.length) {
    const [node, inherited] = stack.pop();
    const effective = node.price ?? inherited;
    for (const item of node.items || [])
      if (item.id === itemId) return item.price ?? effective;
    const groups = node.groups || [];
    for (let i = groups.length - 1; i &gt;= 0; i--)
      stack.push([groups[i], effective]);         <span class="ok">// reverse: left group first</span>
  }
  return null;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> the conversion is a five-minute mechanical exercise <i>if</i> you've done it once, and a ten-minute panic if you haven't. Do it once here, and notice what the call stack had been doing for you the whole time.</p>` },

  { eb:"lesson 19 · follow-ups", title:"What if it's a graph?", html:`
    <p class="big">"A combo platter appears under both Appetizers and Entrees. And Specials links back to the full menu." <b class="hl">You no longer have a tree.</b> The same code now does exponential duplicate work, and on the back edge it recurses until the stack dies.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">two ways a tree becomes a graph &middot; one Set fixes both</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">shared</div><div class="lstep seq" style="--i:0">a node reachable by two paths (a DAG) &rarr; its whole subtree is walked <b>twice</b> &mdash; and doubles again per level</div>
        <div class="lanehead seq" style="--i:1">cycle</div><div class="lstep bad seq" style="--i:1">an edge pointing back up &rarr; the walk never terminates &mdash; <code>RangeError: Maximum call stack size exceeded</code></div>
        <div class="lanehead seq" style="--i:2">fix</div><div class="lstep good seq" style="--i:2"><code>if (visited.has(id)) return; visited.add(id);</code> &mdash; check and mark on <b>entry</b></div>
        <div class="lanehead seq" style="--i:3">cost</div><div class="lstep good seq pop" style="--i:3">every node entered once, every edge followed once &rarr; <b>O(V+E)</b> time, O(V) extra space</div>
      </div>
      <div class="dnote seq" style="--i:4">Key on <b style="color:var(--ordered)">identity, not object reference</b> when the data is deserialized JSON — two copies of the same group id are the same node to the business and different objects to <code>Set</code>. Ask which one the data gives you.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>One more distinction that earns points: <b class="hl">do you unmark on the way out?</b> For reachability or a one-pass computation, no — unmarking re-explores shared subtrees and throws away the whole benefit. For cycle <i>detection</i> or enumerating all simple paths, yes — there the set means "nodes on the current path", and a diamond must not be reported as a loop. Two different sets, two different questions.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; graph DFS, and the second Set</div>
      <pre class="code">function dfs(graph, id, visited = new Set(), out = []) {
  if (visited.has(id)) return out;      <span class="cm">// cycle + duplicate work, both</span>
  visited.add(id);                      <span class="cm">// mark on ENTRY, never unmark</span>
  out.push(graph[id].name);
  for (const next of graph[id].children) dfs(graph, next, visited, out);
  return out;
}
<span class="cm">// cycle DETECTION is the other set — "on the current path":</span>
<span class="cm">//   onPath.add(id) … recurse … onPath.delete(id)</span>
<span class="ok">//   a neighbour already in onPath = a back edge = a real cycle</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "can a node appear in two places?" is a question you should ask <i>before</i> writing the first function, and it takes ten seconds. Asking it up front and then not needing the Set looks like judgment; discovering it when the stack overflows looks like luck.</p>` },

  { eb:"lesson 20 · follow-ups", title:"A thousand lookups a second", html:`
    <p class="big">"The menu page calls this for every item on every render." One search is O(n) and needs no help. <b class="hl">k searches over an unchanging menu are O(k·n) — and O(n + k) if you traverse once and keep a Map.</b></p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">the arithmetic, and the part nobody budgets for</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">walk</div><div class="lstep seq" style="--i:0">k lookups &times; a full DFS each &rarr; <b>O(k&middot;n)</b> &middot; zero memory, zero staleness</div>
        <div class="lanehead seq" style="--i:1">index</div><div class="lstep good seq" style="--i:1">one DFS to build a <code>Map(id &rarr; row)</code>, then <b>O(1)</b> per lookup &rarr; O(n + k) total</div>
        <div class="lanehead seq" style="--i:2">cost</div><div class="lstep bad seq pop" style="--i:2">the build is cheap; <b>invalidation is the bill</b> &mdash; the index is a cache, and a cache can be wrong</div>
      </div>
      <div class="dnote seq" style="--i:5">Precompute the answers, not just the pointers: since you're already flattening, store the <b style="color:var(--ordered)">resolved price and path</b> in each row. The inheritance was the expensive part, and it's done once instead of once per lookup.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Then say the sentence that separates an engineer from an optimizer: <b class="hl">"the index has to be owned by whatever can change the menu."</b> Build it at load and rebuild on publish, or keep it inside a class that invalidates on every mutation. An index that someone can edit around is worse than no index — it's a bug that only appears after a deploy.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; build once, own the invalidation</div>
      <pre class="code">class MenuIndex {
  constructor(menu) { this.menu = menu; this.rebuild(); }
  rebuild() {                                <span class="cm">// one DFS, prices already resolved</span>
    this.byId = new Map(flattenMenu(this.menu).map(r =&gt; [r.id, r]));
  }
  price(id) { return this.byId.has(id) ? this.byId.get(id).price : null; }
}
<span class="ok">// k=1: don't bother. k=1000 on a stable menu: build it, and rebuild on publish.</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "how would you make this faster?" is a trap if you answer with micro-optimizations. The real answer is a change of shape — <b class="hl">preprocess once, then answer in O(1)</b> — plus an honest account of what that costs you in staleness and who is responsible for it.</p>` },

  { eb:"lesson 21 · interview", title:"The complexity answer, out loud", html:`
    <p class="big">Two numbers, said without hedging. <b class="hl">Time O(n), space O(h)</b> — and then the sentence that shows you know what they mean: which input shape makes each of them hurt.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">where the numbers come from</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">time</div><div class="lstep good seq" style="--i:0"><b>O(n)</b> &mdash; each node is entered once, each edge followed once; the work per node is O(1) aside from its own children</div>
        <div class="lanehead seq" style="--i:1">space</div><div class="lstep good seq" style="--i:1"><b>O(h)</b> &mdash; only one root-to-leaf path is on the stack at a time, h = height</div>
        <div class="lanehead seq" style="--i:2">h?</div><div class="lstep seq" style="--i:2">balanced &rarr; O(log n) &middot; a degenerate chain &rarr; <b>h = n</b>, and that's the overflow case</div>
        <div class="lanehead seq" style="--i:3">early exit</div><div class="lstep seq" style="--i:3">improves the average, never the worst &mdash; proving absence requires looking everywhere</div>
        <div class="lanehead seq" style="--i:4">output</div><div class="lstep seq" style="--i:4">find-all / flatten add <b>O(n) output space</b>, separate from the stack</div>
        <div class="lanehead seq" style="--i:5">k lookups</div><div class="lstep good seq pop" style="--i:5">O(k&middot;n) walked vs <b>O(n + k)</b> indexed &mdash; the preprocessing trade, in one comparison</div>
      </div>
      <div class="dnote seq" style="--i:6">BFS for contrast, in one line: same O(n) time, but <b style="color:var(--ordered)">O(width) memory instead of O(height)</b>. On a wide, shallow menu that's most of the menu in the queue versus three frames on the stack.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Be precise about <b class="hl">what n counts</b>, because in this problem there are two things to count: groups and items. "n is every node I touch — groups plus items" is exact and takes three extra words. And when the structure is a graph, the number becomes <b class="hl">O(V+E)</b>: the visited Set is what turns "entered once per path" into "entered once, ever."</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the paragraph, ready to say</div>
      <pre class="code"><span class="cm">// "Time is O(n) — n being every group and item, since each is</span>
<span class="cm">//  visited exactly once and the work at a node is constant.</span>
<span class="cm">//  Space is O(h) for the call stack, h the nesting depth: a few</span>
<span class="cm">//  frames for a normal menu, but O(n) if the data degenerates</span>
<span class="cm">//  into a chain — that's when I'd use an explicit stack.</span>
<span class="cm">//  The early return improves the average case, not the worst.</span>
<span class="ok">//  And if we're doing this per render, I'd index once: O(n + k)."</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> most candidates say "O(n)" and stop. The extra fifteen seconds — what n counts, where the space goes, which shape breaks it, what changes under repetition — is the difference between a correct answer and a senior one.</p>` },

  { eb:"lesson 22 · interview", title:"Say it before you code", html:`
    <p class="big">The code is four minutes of the interview. <b class="hl">The other twenty-six are you talking</b>, and the opening thirty seconds set the tone for all of them. Here is the script, in the order it should come out.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">the opening &middot; six sentences, before a line is written</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">shape</div><div class="lstep seq" style="--i:0">"This is an n-ary tree &mdash; groups nest arbitrarily, items are leaves."</div>
        <div class="lanehead seq" style="--i:1">choice</div><div class="lstep seq" style="--i:1">"I'll traverse it depth-first; nothing here asks for the nearest match, and I need ancestor context as I go."</div>
        <div class="lanehead seq" style="--i:2">base</div><div class="lstep seq" style="--i:2">"Base case is a missing node; leaves end the recursion on their own."</div>
        <div class="lanehead seq" style="--i:3">state</div><div class="lstep good seq" style="--i:3">"Because the price can be inherited, I'll pass the <b>currently effective price</b> down as a parameter of each recursive call."</div>
        <div class="lanehead seq" style="--i:4">cost</div><div class="lstep seq" style="--i:4">"O(n) time, O(h) stack space."</div>
        <div class="lanehead seq" style="--i:5">edges</div><div class="lstep good seq pop" style="--i:5">"Item not found returns null; a declared price of zero is real, so I'll use <code>??</code> rather than <code>||</code>."</div>
      </div>
      <div class="dnote seq" style="--i:6">Then <b style="color:var(--ordered)">ask two questions and stop talking</b>: "can a group appear under two parents?" and "if an id appears twice, do you want the first or all of them?" Both change the code. Asking proves you've seen the failure modes; guessing proves nothing.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>While you type, narrate the <i>decisions</i>, not the syntax. "I'm capturing the recursive result so a miss doesn't end the search" is signal. "Now I'm writing a for loop" is noise. And when you finish, <b class="hl">volunteer the follow-ups before they're asked</b>: <i>"if you wanted all matches I'd drop the early return; if you wanted the path I'd carry a trail; if this ran per render I'd index it once."</i> That sentence usually ends the question early, in your favour.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the six things to state, as a checklist</div>
      <pre class="code"><span class="cm">// 1. what data structure do I see?     n-ary tree, two child kinds</span>
<span class="cm">// 2. why DFS?                          no "nearest" in the question,</span>
<span class="cm">//                                      and I need ancestor state</span>
<span class="cm">// 3. what's the base case?             null node; leaves self-terminate</span>
<span class="cm">// 4. what travels downward?            the effective price (a parameter)</span>
<span class="cm">// 5. time and space?                   O(n) / O(h)</span>
<span class="cm">// 6. edge cases?                       absent id -> null · price 0 is real</span>
<span class="ok">//                                      · duplicate ids · depth · shared nodes</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> two candidates write the same function; one gets the offer. The difference is almost never the code — it's whether the interviewer could follow the reasoning while it happened, and whether the edge cases came from you or had to be dragged out.</p>` },
  );

  /* =========================================================
     2. QUIZ — two more traces, on the follow-ups
     ========================================================= */
  QUIZ.push(

  { code:`// collect the path to an item — push/pop version
const trail = [];
function findPath(node, id) {
  trail.push(node.name);
  for (const item of node.items || [])
    if (item.id === id) return [...trail, item.name];
  for (const g of node.groups || []) {
    const found = findPath(g, id);
    if (found) return found;
  }
  return null;                     // <-- note: no pop
}
// menu: Lunch -> [Appetizers(wings), Entrees -> Salads(cobb)]
findPath(menu, "cobb");`,
    options:["[\"Lunch\", \"Appetizers\", \"Entrees\", \"Salads\", \"Cobb Salad\"] — Appetizers is never removed after its branch fails",
             "[\"Lunch\", \"Entrees\", \"Salads\", \"Cobb Salad\"] — the correct path; the missing pop is harmless",
             "null — the shared trail array corrupts the search and the item is never found"],
    answer:0,
    whys:[
      "Right. A shared array that's pushed but never popped keeps every dead-end it walked through. Appetizers fails, returns null, and leaves its name in the trail — so the path reported for cobb includes a section it isn't in. The fix is a `trail.pop()` before every `return null` (or use `concat` and let each frame own its own array).",
      "It's harmless only for the FIRST path found in the leftmost branch — which is exactly the case a hand-written test covers. Every path that required backtracking carries the names of the failed branches, and the bug reads like bad data rather than bad code.",
      "The search itself is unaffected: the traversal finds cobb exactly where it always did. Only the reported path is corrupted, which is worse than a crash — it's a wrong answer that looks like a right one."] },

  { code:`const graph = {
  lunch:    { children: ["apps", "entrees"] },
  apps:     { children: ["combos"] },
  entrees:  { children: ["combos", "specials"] },
  combos:   { children: [] },
  specials: { children: ["lunch"] },     // back edge
};

function dfs(g, id, out = []) {
  out.push(id);
  for (const n of g[id].children) dfs(g, n, out);
  return out;
}
dfs(graph, "lunch");`,
    options:["it never terminates — specials points back at lunch, so the walk cycles until the call stack overflows",
             "lunch, apps, combos, entrees, combos, specials — combos appears twice but the walk still ends",
             "lunch, apps, combos, entrees, specials — JavaScript won't revisit an object it has already seen"],
    answer:0,
    whys:[
      "Right. lunch → entrees → specials → lunch → entrees → specials → … Nothing in tree DFS remembers where it has been, so a single back edge makes the recursion infinite and the engine throws RangeError. One `visited` Set, checked and marked on entry, turns this into an O(V+E) walk that enters all five nodes exactly once.",
      "Combos appearing twice is real (it has two parents — that's the duplicate-work problem), but it isn't the fatal part. The back edge from specials to lunch is: the walk re-enters lunch and starts the whole thing again, forever.",
      "There is no such mechanism — the engine follows whatever references you give it, as many times as you give them. Deduplication is a thing YOU add, with a Set keyed on node identity, and it's the single line that separates graph DFS from tree DFS."] },
  );

  /* =========================================================
     3. CARDS — one more, on narration
     ========================================================= */
  CARDS.push(
    ["You're two minutes in, the recursion isn't coming out right, and the room is quiet. What do you say?",
     "Narrate the invariant, not the panic: \"Each call is responsible for one subtree — it returns the match inside it, or null. So at this node I check my own items, then ask each group the same question and return the first non-null answer.\" Restating the contract fixes most stuck recursions on the spot, and it tells the interviewer you're debugging by reasoning rather than by shuffling lines. If it's still wrong, trace the smallest failing input out loud — three nodes is usually enough."],
  );

})();
