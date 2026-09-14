"use strict";
/* DFS & Recursive Traversal Bootcamp — content pack: the interview script.
   Loaded after the lesson packs and the hunt/build pack, before the engine
   (same shared-global model as a classic <script> tag). Registers:
     1. a "say it out loud" sheet module — the narration, the six prompts to
        answer before writing a line, the complexity paragraph, and the
        follow-up map, spliced into the nav just before test mode
     2. two more trace-the-recursion quiz questions
     3. three flashcards
   No edits to shared files — everything is appended/spliced from here. */
(function () {

  /* =========================================================
     1. THE SCRIPT — a static "sheet" module
        what to say, in the order to say it
     ========================================================= */
  const scriptHtml = `
    <p class="big">Two candidates write the same eight lines; one gets the offer. The difference is almost never the code — it's whether the interviewer could follow the reasoning <i>while it was happening</i>. <b class="hl">This page is the script.</b> Read it out loud until it stops sounding like a script.</p>

    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">the opening &middot; thirty seconds, before a line is written</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1 · shape</div><div class="lstep seq" style="--i:0">"This is an n-ary tree &mdash; groups nest arbitrarily deep, and there are two kinds of children: items are leaves, groups recurse."</div>
        <div class="lanehead seq" style="--i:1">2 · choice</div><div class="lstep seq" style="--i:1">"So I'll traverse it depth-first. Nothing in the question asks for the <i>nearest</i> match, and I need each item's ancestors while I'm at it &mdash; DFS carries that for free."</div>
        <div class="lanehead seq" style="--i:2">3 · base</div><div class="lstep seq" style="--i:2">"Base case is a missing node; leaves end the recursion on their own, because their loop runs zero times."</div>
        <div class="lanehead seq" style="--i:3">4 · state</div><div class="lstep good seq" style="--i:3">"Because the value I care about can be inherited from ancestors, I'll <b>pass the currently effective value down as a parameter</b> of each recursive call."</div>
        <div class="lanehead seq" style="--i:4">5 · cost</div><div class="lstep seq" style="--i:4">"That's O(n) time &mdash; n being every group and item &mdash; and O(h) stack space, h the nesting depth."</div>
        <div class="lanehead seq" style="--i:5">6 · edges</div><div class="lstep seq" style="--i:5">"An id that isn't on the menu returns null. A declared price of zero is a real price, so I'll use <code>??</code> and not <code>||</code>."</div>
        <div class="lanehead seq" style="--i:6">7 · ask</div><div class="lstep good seq pop" style="--i:6">"Two questions: can a group appear under more than one parent? And if an id appears twice, do you want the first match or all of them?"</div>
      </div>
      <div class="dnote seq" style="--i:7">Then <b style="color:var(--ordered)">stop talking and let them answer</b>. Those two questions are the ones that change your code, and asking them is the cheapest seniority signal available.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>

    <div class="impl">
      <div class="dlabel">the six prompts &middot; answer every one of these, out loud, every time</div>
      <p><b class="hl">1. What data structure do I see?</b> Name it precisely: n-ary tree, arbitrary depth, two kinds of children. Not "a nested object" — that's a description of the JSON, not of the problem.</p>
      <p><b class="hl">2. Why DFS?</b> "Nothing asks for the shortest path or the nearest match, and I need ancestor context as I descend. DFS gives me both and costs O(height) instead of BFS's O(width)." If the question ever becomes <i>fewest clicks to reach an item</i>, switch to BFS and say why.</p>
      <p><b class="hl">3. What's the base case?</b> "A missing node. Leaves aren't a special case — a node with no children iterates zero times and falls through to the miss return." Inventing a leaf branch is the most common wrong answer here.</p>
      <p><b class="hl">4. What state must travel downward?</b> The whole question, in one sentence. The effective price. The path so far. The depth. The locale. <i>Down as parameters, up as return values, and an accumulator when every node contributes to one shared result.</i></p>
      <p><b class="hl">5. Time and space?</b> "O(n) time, each node entered once. O(h) space for the call stack — a few frames for a real menu, O(n) if the data degenerates into a chain, which is when I'd switch to an explicit stack." Then, unprompted: "the early return improves the average case, not the worst."</p>
      <p><b class="hl">6. Edge cases?</b> Absent id &rarr; null, never a throw. A price of 0 is real (<code>??</code>, and test results with <code>!== null</code>). Empty or missing <code>items</code>/<code>groups</code> keys. Duplicate ids — first or all? A shared group, which makes it a graph. Depth deep enough to overflow.</p>
    </div>

    <div class="impl">
      <div class="dlabel">while you type &middot; narrate decisions, not syntax</div>
      <pre class="code"><span class="ok">// say this:</span>
<span class="cm">"I'm capturing the recursive result so that a miss doesn't</span>
<span class="cm"> end the search — only a hit returns early."</span>
<span class="cm">"I'm passing 'effective' and not 'inherited', so an override</span>
<span class="cm"> three levels down still applies below it."</span>

<span class="ok">// not this:</span>
<span class="cm">"now I'm writing a for loop"</span>
<span class="cm">(silence)</span></pre>
    </div>

    <div class="impl">
      <div class="dlabel">the follow-up map &middot; volunteer these before they're asked</div>
      <p>Each one is the same traversal with a single change. Saying the list out loud when you finish usually ends the question early, in your favour: <i>"if you wanted all matches I'd drop the early return; if you wanted the path I'd carry a trail; if this ran on every render I'd index it once."</i></p>
      <pre class="code"><span class="cm">// all matches       </span>drop the early return, push into an accumulator &rarr; O(n) always
<span class="cm">// the path          </span>carry a trail down; concat, so a dead end needs no cleanup
<span class="cm">// flatten           </span>both carried values + one accumulator, one pass
<span class="cm">// price everything  </span>same walk, Map accumulator &mdash; <span class="kw">not</span> a search per item (that's O(n²))
<span class="cm">// no recursion      </span>explicit stack; push children reversed, push carried state alongside
<span class="cm">// it's a graph      </span>a visited Set, checked and marked on entry, never unmarked
<span class="cm">// 1000 lookups      </span>index once into a Map: O(n + k) &mdash; and own the invalidation</pre>
    </div>

    <div class="impl">
      <div class="dlabel">the complexity paragraph &middot; memorize the shape, not the words</div>
      <pre class="code"><span class="cm">"Time is O(n), n being every group and item, since each is</span>
<span class="cm"> visited exactly once and the work at a node is constant</span>
<span class="cm"> aside from recursing into its own children.</span>

<span class="cm"> Space is O(h) for the call stack, h the nesting depth —</span>
<span class="cm"> O(log n) if the menu is balanced, O(n) if it degenerates</span>
<span class="cm"> into a chain, and that's the case that would overflow.</span>

<span class="cm"> The short-circuit improves the average case, not the worst:</span>
<span class="cm"> proving an item is absent means looking everywhere.</span>

<span class="ok"> If it's a graph, it becomes O(V+E) with O(V) for the set."</span></pre>
    </div>

    <p><b class="hl">The last thirty seconds.</b> When it works, don't go quiet — close it out: name one thing you'd change for production (<i>"I'd index this if it's called per render"</i>), one assumption you made (<i>"I assumed ids are unique; if not, this returns the first in menu order"</i>), and one test you'd write (<i>"a menu where a section declares a zero price"</i>). That's the difference between finishing the question and owning it.</p>`;

  MODULES.splice(MODULES.findIndex(m => m.id === "test"), 0, {
    id: "script", label: "say it out loud", type: "sheet",
    eyebrow: "module 08", title: "Say it out loud",
    lead: `The narration, the six prompts, the complexity paragraph, and the follow-up map — everything to say before, during, and after the code. Rehearse it out loud; reading it silently builds a different skill than the one the interview grades.`,
    html: scriptHtml,
  });

  /* =========================================================
     2. QUIZ — two more traces
     ========================================================= */
  QUIZ.push(

  { code:`// "count every item on the menu"
function countItems(node) {
  let n = (node.items || []).length;
  for (const g of node.groups || []) countItems(g);
  return n;
}
// Lunch -> Appetizers(wings, fries)
//       -> Entrees(burger) -> Salads(cobb, garden)
console.log(countItems(menu));`,
    options:["0 — the root has no items of its own, and every recursive result is discarded",
             "5 — the recursion visits every group and adds up their items",
             "2 — it counts the first group's items and stops"],
    answer:0,
    whys:[
      "Right. `countItems(g)` is called, computes the correct count for that subtree, and the value is thrown away — nothing accumulates it. The root declares no items of its own, so `n` stays 0. The fix is one character: `n += countItems(g);`. This is the aggregate-coming-UP mistake, and it's the mirror image of discarding a search result.",
      "That's what the corrected version returns. As written, the recursive calls have no effect on `n` at all — they're pure side-effect-free work whose answers vanish. If the function had a `console.log` inside, you'd see it visiting everything and still returning 0.",
      "Nothing stops early here — every group IS visited. The bug isn't traversal, it's arithmetic: the counts come back up and nobody adds them to anything."] },

  { code:`// the SAME menu tree, two calls
const a = getItemPrice(menu, "garden");   // one lookup
const b = new MenuIndex(menu).price("garden");

// menu: 6 groups, 5 items
// getItemPrice walks until it finds the item
// MenuIndex flattens the whole menu, then Map.get`,
    options:["a === b, and for ONE lookup the index did strictly more work — it's the k-th lookup that pays for it",
             "a === b, and the index is faster even here because Map.get is O(1)",
             "they can differ: the index resolves prices during the build, the walk resolves them during the search"],
    answer:0,
    whys:[
      "Right, and this is the honest version of the answer. A single lookup costs one partial DFS; the index costs a full DFS plus a Map build, then an O(1) hit. Break-even is around the second or third lookup, and the real argument for indexing is k lookups against a menu that rarely changes — O(k·n) versus O(n + k). Say the break-even out loud instead of calling the index 'faster'.",
      "The O(1) lookup is real and irrelevant at k=1: you paid O(n) to build it, which is the same order the walk would have cost — plus the allocation. 'Faster' without naming k is the answer that gets a follow-up you don't want.",
      "Both resolve inheritance the same way, at different times — during the build for the index, during the search for the walk — and both produce 8 for the garden salad. If they disagreed, the index would simply be wrong, which is exactly what a stale index is."] },
  );

  /* =========================================================
     3. CARDS — three more, on the meta-skills
     ========================================================= */
  CARDS.push(
    ["They hand you the nested menu. What do you say in the first thirty seconds?",
     "\"This is an n-ary tree with two kinds of children — items are leaves, groups recurse, nesting is arbitrary. I'll go depth-first: nothing asks for the nearest match and I need ancestor context. Base case is a missing node; leaves end on their own. Because the price can be inherited, I'll pass the currently effective price down as a parameter. O(n) time, O(h) stack. Absent id returns null, and a declared 0 is a real price so I'll use `??`.\" Then ask: can a group appear under two parents, and do duplicate ids mean first-or-all?"],
    ["The function works and the interviewer says \"great\" — what do you say next?",
     "Close it yourself: one production change (\"if this runs per render I'd index it once and rebuild on publish\"), one assumption (\"I assumed ids are unique; otherwise this returns the first in menu order\"), and one test you'd write (\"a section with a declared price of zero\"). Volunteering the follow-up map — all matches, path, flatten, iterative, graph — usually ends the question early and on your terms."],
    ["Your recursion returns the right answer for the first branch and null for everything else. What's the bug, before you even look?",
     "You returned the recursive call instead of testing it: `return f(child)` rather than `const found = f(child); if (found) return found;`. The loop body runs exactly once, so only the leftmost branch is ever searched. It's the single most common DFS bug, it passes every fixture whose target lives in the first group, and knowing the symptom-to-cause mapping cold is worth more than re-deriving it under pressure."],
  );

})();
