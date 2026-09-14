"use strict";
/* DFS & Recursive Traversal Bootcamp — content pack: the nested restaurant
   menu, and DFS with inherited state. Loaded after content.js and before
   every other pack (this pack APPENDS lessons 8-12, so load order is arc
   order; the validator loads packs alphabetically too).

   Registers:
     1. lessons 8-12  — the menu shape, finding an item, and the inherited
                        -state pattern this whole course points at
     2. two more trace-the-recursion quiz questions
     3. one flashcard
   Cross-links use the FINAL lesson indices documented in content.js. */
(function () {

  /* =========================================================
     1. LESSONS 8-12
     ========================================================= */
  LESSONS.push(

  { eb:"lesson 09 · the menu", title:"A real menu has two kinds of children", html:`
    <p class="big">Here's the shape the interview actually hands you. Not a tidy <code>children</code> array — a menu whose groups nest as deep as the restaurant wants, and whose children come in two flavours: <b class="hl">items are leaves you check, groups are recursion you descend into.</b></p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">Lunch &middot; one node, two child lists, arbitrary depth</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">Lunch</div><div class="lstep seq" style="--i:0">groups: [Appetizers, Entrees] &middot; items: []</div>
        <div class="lanehead seq" style="--i:1">&nbsp;&nbsp;Appetizers</div><div class="lstep good seq" style="--i:1">items: [wings, fries] &middot; groups: [] &mdash; a leaf group</div>
        <div class="lanehead seq" style="--i:2">&nbsp;&nbsp;Entrees</div><div class="lstep seq" style="--i:2">items: [burger] &middot; groups: [Salads] &mdash; <b>items AND groups at the same node</b></div>
        <div class="lanehead seq" style="--i:3">&nbsp;&nbsp;&nbsp;&nbsp;Salads</div><div class="lstep good seq pop" style="--i:3">items: [cobb] &middot; groups: [] &mdash; two levels down, and nothing marks it as "deep"</div>
      </div>
      <div class="dnote seq" style="--i:4">The trap is hard-coding the nesting you can see. <b style="color:var(--ordered)">Salads exists to break "loop the groups, then loop their items"</b> — a two-level solution finds the burger and misses the Cobb Salad, on the interviewer's second test case.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two things change from the toy tree, and neither is the algorithm. First, <b class="hl">a node has two child lists</b>, so you write two loops: check the items here (cheap, and they're the things you're looking for), then recurse into each group. Second, <b class="hl">real payloads omit empty arrays</b> — a leaf group may simply have no <code>groups</code> key — so every loop gets a <code>|| []</code> or the traversal dies on data rather than logic.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the shape, verbatim</div>
      <pre class="code">const menu = {
  name: "Lunch",
  groups: [
    { name: "Appetizers",
      items: [ { id: "wings", name: "Wings" },
               { id: "fries", name: "Fries" } ],
      groups: [] },
    { name: "Entrees",
      items: [ { id: "burger", name: "Burger" } ],
      groups: [
        { name: "Salads",
          items: [ { id: "cobb", name: "Cobb Salad" } ],
          groups: [] } ] },
  ],
};
<span class="ok">// DFS order: Lunch, Appetizers, wings, fries, Entrees, burger, Salads, cobb</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "what do you see?" — <i>"an n-ary tree with two kinds of children, nested arbitrarily deep; items are leaves, groups recurse."</i> Say that and the interviewer knows you won't hard-code the depth. Then ask the shape questions: <b class="hl">can a group appear under two parents? can ids repeat?</b> Both change your code, and asking costs ten seconds.</p>` },

  { eb:"lesson 10 · the menu", title:"Find an item anywhere in the menu", html:`
    <p class="big">Same five lines as <code>findNode</code>, with one extra loop. <b class="hl">The shape grew a second child list; the algorithm did not change at all.</b> That sentence — said out loud when the menu appears — is worth more than the code.</p>
    <div class="diagram anim" style="--step:.6s">
      <div class="dlabel">findMenuItem(menu, "cobb") &middot; what each frame does</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">Lunch</div><div class="lstep seq" style="--i:0">items: none &rarr; groups: descend into Appetizers</div>
        <div class="lanehead seq" style="--i:1">Appetizers</div><div class="lstep bad seq" style="--i:1">wings? fries? no &middot; no subgroups &rarr; <b>return null</b></div>
        <div class="lanehead seq" style="--i:2">Lunch</div><div class="lstep wait seq" style="--i:2">null is a miss &rarr; loop advances to Entrees</div>
        <div class="lanehead seq" style="--i:3">Entrees</div><div class="lstep seq" style="--i:3">burger? no &rarr; descend into Salads</div>
        <div class="lanehead seq" style="--i:4">Salads</div><div class="lstep good seq pop" style="--i:4">cobb ✓ &rarr; <b>return the item</b> &middot; every frame above returns it too</div>
      </div>
      <div class="dnote seq" style="--i:5">Step 3 is the short-circuit's other half doing its job: <b style="color:var(--ordered)">a null from one branch must not end the search</b> — it just means "not in there," and the loop moves on.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Order the two loops deliberately and say why: <b class="hl">items first</b> because they're O(items at this level) with no recursion behind them — if the answer is here, you pay nothing to find it. Groups second, each with the capture-and-test pattern. Flip the order and the code still works; it just does the expensive thing before the cheap one.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; two loops, one recursion</div>
      <pre class="code">function findMenuItem(node, itemId) {
  for (const item of node.items || []) {        <span class="cm">// leaves — cheap</span>
    if (item.id === itemId) return item;
  }
  for (const group of node.groups || []) {      <span class="cm">// recursion</span>
    const found = findMenuItem(group, itemId);
    if (found) return found;                    <span class="cm">// same short-circuit</span>
  }
  return null;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the four-minute version of the problem, and it's a setup. The interviewer is about to add prices that live on groups — and at that moment most candidates start writing a second traversal instead of adding one parameter to this one.</p>` },

  { eb:"lesson 11 · inherited state", title:"DFS can carry state down", html:`
    <p class="big">Now the real question. Prices can be declared on the menu, on any group, or on an individual item — and <b class="hl">an item with no price of its own inherits the closest ancestor that declared one.</b> The instinct is to walk up from the item. You can't: children don't point at parents. But you don't need to — the ancestors are already above you on the stack, and you can simply hand the value down.</p>
    <div class="diagram anim" style="--step:.5s">
      <div class="dlabel">the value travels DOWN &middot; every node either replaces it or passes it through</div>
      <svg class="estage" viewBox="0 0 340 220" width="100%" style="max-width:360px" font-family="ui-monospace,monospace">
      <line x1="170" y1="24" x2="80" y2="78" stroke="#2c3350" stroke-width="1.4"/><line x1="170" y1="24" x2="250" y2="78" stroke="#2c3350" stroke-width="1.4"/><line x1="80" y1="78" x2="36" y2="138" stroke="#2c3350" stroke-width="1.4"/><line x1="80" y1="78" x2="104" y2="138" stroke="#2c3350" stroke-width="1.4"/><line x1="250" y1="78" x2="196" y2="138" stroke="#2c3350" stroke-width="1.4"/><line x1="250" y1="78" x2="286" y2="138" stroke="#2c3350" stroke-width="1.4"/><line x1="286" y1="138" x2="248" y2="192" stroke="#2c3350" stroke-width="1.4"/><line x1="286" y1="138" x2="306" y2="192" stroke="#2c3350" stroke-width="1.4"/><rect x="140" y="13" width="60" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"></rect><text x="170" y="23" fill="#e7e9f3" font-size="7.5" text-anchor="middle">Lunch</text><text x="170" y="31.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares $12</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.02;1" dur="9s" repeatCount="indefinite"/><rect x="186" y="5" width="22" height="11" rx="4" fill="#34d3bf"/><text x="197" y="13.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$12</text></g><rect x="50" y="67" width="60" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#34d3bf;#34d3bf" keyTimes="0;0.14;1" dur="9s" repeatCount="indefinite"/></rect><text x="80" y="77" fill="#e7e9f3" font-size="7.5" text-anchor="middle">Appetizers</text><text x="80" y="85.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares $6</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.14;1" dur="9s" repeatCount="indefinite"/><rect x="96" y="59" width="22" height="11" rx="4" fill="#34d3bf"/><text x="107" y="67.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$6</text></g><rect x="220" y="67" width="60" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#4eaeff;#4eaeff" keyTimes="0;0.42;1" dur="9s" repeatCount="indefinite"/></rect><text x="250" y="77" fill="#e7e9f3" font-size="7.5" text-anchor="middle">Entrees</text><text x="250" y="85.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares —</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.42;1" dur="9s" repeatCount="indefinite"/><rect x="266" y="59" width="22" height="11" rx="4" fill="#4eaeff"/><text x="277" y="67.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$12</text></g><rect x="10" y="127" width="52" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#4eaeff;#4eaeff" keyTimes="0;0.28;1" dur="9s" repeatCount="indefinite"/></rect><text x="36" y="137" fill="#e7e9f3" font-size="7.5" text-anchor="middle">wings</text><text x="36" y="145.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares —</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.28;1" dur="9s" repeatCount="indefinite"/><rect x="48" y="119" width="22" height="11" rx="4" fill="#4eaeff"/><text x="59" y="127.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$6</text></g><rect x="78" y="127" width="52" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#34d3bf;#34d3bf" keyTimes="0;0.28;1" dur="9s" repeatCount="indefinite"/></rect><text x="104" y="137" fill="#e7e9f3" font-size="7.5" text-anchor="middle">fries</text><text x="104" y="145.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares $4</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.28;1" dur="9s" repeatCount="indefinite"/><rect x="116" y="119" width="22" height="11" rx="4" fill="#34d3bf"/><text x="127" y="127.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$4</text></g><rect x="170" y="127" width="52" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#4eaeff;#4eaeff" keyTimes="0;0.56;1" dur="9s" repeatCount="indefinite"/></rect><text x="196" y="137" fill="#e7e9f3" font-size="7.5" text-anchor="middle">burger</text><text x="196" y="145.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares —</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.56;1" dur="9s" repeatCount="indefinite"/><rect x="208" y="119" width="22" height="11" rx="4" fill="#4eaeff"/><text x="219" y="127.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$12</text></g><rect x="256" y="127" width="60" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#34d3bf;#34d3bf" keyTimes="0;0.56;1" dur="9s" repeatCount="indefinite"/></rect><text x="286" y="137" fill="#e7e9f3" font-size="7.5" text-anchor="middle">Salads</text><text x="286" y="145.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares $8</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.56;1" dur="9s" repeatCount="indefinite"/><rect x="302" y="119" width="22" height="11" rx="4" fill="#34d3bf"/><text x="313" y="127.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$8</text></g><rect x="222" y="181" width="52" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#34d3bf;#34d3bf" keyTimes="0;0.72;1" dur="9s" repeatCount="indefinite"/></rect><text x="248" y="191" fill="#e7e9f3" font-size="7.5" text-anchor="middle">cobb</text><text x="248" y="199.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares $10</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.72;1" dur="9s" repeatCount="indefinite"/><rect x="260" y="173" width="22" height="11" rx="4" fill="#34d3bf"/><text x="271" y="181.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$10</text></g><rect x="280" y="181" width="52" height="22" rx="7" fill="#11131c" stroke="#244155" stroke-width="1.3"><animate attributeName="stroke" calcMode="discrete" values="#244155;#4eaeff;#4eaeff" keyTimes="0;0.72;1" dur="9s" repeatCount="indefinite"/></rect><text x="306" y="191" fill="#e7e9f3" font-size="7.5" text-anchor="middle">garden</text><text x="306" y="199.5" fill="#8b90ab" font-size="7" text-anchor="middle">declares —</text><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.72;1" dur="9s" repeatCount="indefinite"/><rect x="318" y="173" width="22" height="11" rx="4" fill="#4eaeff"/><text x="329" y="181.5" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">$8</text></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.03;0.14;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.03;0.14;1" keyPoints="0;0;1;1" path="M 170 35 L 80 67"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">12</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.16;0.28;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.28;1" keyPoints="0;0;1;1" path="M 80 89 L 36 127"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">6</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.16;0.28;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.16;0.28;1" keyPoints="0;0;1;1" path="M 80 89 L 104 127"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">6</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.31;0.42;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.31;0.42;1" keyPoints="0;0;1;1" path="M 170 35 L 250 67"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">12</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.44;0.56;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.44;0.56;1" keyPoints="0;0;1;1" path="M 250 89 L 196 127"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">12</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.44;0.56;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.44;0.56;1" keyPoints="0;0;1;1" path="M 250 89 L 286 127"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">12</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.59;0.72;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.59;0.72;1" keyPoints="0;0;1;1" path="M 286 149 L 248 181"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">8</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;0.59;0.72;1" dur="9s" repeatCount="indefinite"/><g><animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.59;0.72;1" keyPoints="0;0;1;1" path="M 286 149 L 306 181"/><rect x="-9" y="-6" width="18" height="12" rx="4" fill="#4eaeff"/><text x="0" y="3" fill="#11131c" font-size="7.5" font-weight="700" text-anchor="middle">8</text></g></g><g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;1" keyTimes="0;0.75;1" dur="9s" repeatCount="indefinite"/><text x="170" y="214" fill="#8b90ab" font-size="6.8" text-anchor="middle"><tspan fill="#34d3bf">green</tspan> = declared its own · <tspan fill="#4eaeff">blue</tspan> = inherited · the token is the parameter</text></g>
      </svg>
      <div class="dlabel" style="margin-top:12px">the pattern &middot; four beats at every node</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1</div><div class="lstep seq" style="--i:0">arrive at a node, holding whatever the ancestors handed down</div>
        <div class="lanehead seq" style="--i:1">2</div><div class="lstep good seq" style="--i:1"><code>const effective = node.price ?? inherited;</code> &mdash; resolve for HERE</div>
        <div class="lanehead seq" style="--i:2">3</div><div class="lstep seq" style="--i:2">check this level's items, using <code>item.price ?? effective</code></div>
        <div class="lanehead seq" style="--i:3">4</div><div class="lstep good seq pop" style="--i:3">recurse into each group <b>passing <code>effective</code> down</b> &mdash; that's the whole trick</div>
      </div>
      <div class="flowarrow seq" style="--i:4">&darr; state travels DOWN as a parameter &middot; answers travel UP as return values &darr;</div>
      <div class="dnote seq" style="--i:5"><b style="color:var(--ordered)">"Closest ancestor wins" needs no upward search</b> — each level either replaces the value or passes it through untouched, so whatever arrives at a node is already the nearest declaration above it.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This generalizes far past prices, and naming the generalization is what makes it stick. Inherited state is <b class="hl">anything a node needs from its ancestors</b>: a CSS-style cascade, a permission that flows to sub-folders, a currency or locale, a feature flag, an accumulated path, a depth counter, a tax rate. Every one of them is the same three words — <i>resolve, use, pass down</i>.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; getItemPrice, complete</div>
      <pre class="code">function getItemPrice(node, itemId, inherited = null) {
  const effective = node.price ?? inherited;        <span class="cm">// resolve</span>
  for (const item of node.items || []) {
    if (item.id === itemId) return item.price ?? effective;   <span class="cm">// use</span>
  }
  for (const group of node.groups || []) {
    const found = getItemPrice(group, itemId, effective);     <span class="cm">// pass down</span>
    if (found !== null) return found;               <span class="ok">// !== null, not truthy: 0 is a price</span>
  }
  return null;
}
<span class="ok">// wings 6 · fries 4 · burger 12 · cobb 10 · garden 8 · unknown null</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the whole interview. The sentence to say <i>before</i> you type — <b class="hl">"because the value I care about can be inherited from ancestors, I'll pass the currently effective value down as a parameter of each recursive call"</b> — tells the interviewer you've seen the pattern rather than rediscovered it under pressure.</p>` },

  { eb:"lesson 12 · inherited state", title:"Closest ancestor wins — and the ?? trap", html:`
    <p class="big">Two operators look interchangeable here and are not. <b class="hl"><code>??</code> asks "was a value defined?" &middot; <code>||</code> asks "is the value truthy?"</b> — and <code>0</code> is both a perfectly real price and falsy. The day someone adds a free item, <code>||</code> starts billing customers.</p>
    <div class="diagram anim" style="--step:.65s">
      <div class="dlabel">Happy Hour $9 &rarr; Drinks $0 &rarr; water (no price of its own)</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">??</div><div class="lstep good seq" style="--i:0"><code>0 ?? 9</code> &rarr; <b>0</b> &middot; the free price survives and is inherited &mdash; water is free ✓</div>
        <div class="lanehead seq" style="--i:1">||</div><div class="lstep bad seq" style="--i:1"><code>0 || 9</code> &rarr; <b>9</b> &middot; the zero is erased before it's passed down &mdash; water rings up $9 ✗</div>
        <div class="lanehead seq" style="--i:2">also</div><div class="lstep bad seq" style="--i:2"><code>if (found) return found;</code> on a resolved price of 0 &rarr; treated as a miss, search continues, returns null</div>
        <div class="lanehead seq" style="--i:3">fix</div><div class="lstep good seq pop" style="--i:3"><code>??</code> when resolving &middot; <code>!== null</code> when testing a returned <i>value</i> &middot; truthiness only for objects</div>
      </div>
      <div class="dnote seq" style="--i:4">Same trap, different data: a depth of <code>0</code>, an empty-string label, a <code>false</code> feature flag, a quantity of <code>0</code>. <b style="color:var(--ordered)">Any time "unset" and "zero/empty" are different things</b>, truthiness is the wrong question.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>There's a second rule hiding underneath, and it's the one that breaks three levels down: <b class="hl">pass down what you resolved, not what you received.</b> Recursing with <code>inherited</code> instead of <code>effective</code> means each level computes its own price, uses it for its own items, and then discards it — so the root's value propagates all the way to the leaves, and a two-level fixture never catches it.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the two lines that go wrong</div>
      <pre class="code"><span class="cm">// ✗ 0 is falsy — a free group inherits the parent's price</span>
const effective = node.price || inherited;
<span class="cm">// ✗ passes what it RECEIVED — overrides below level 1 are lost</span>
getItemPrice(group, itemId, inherited);

<span class="cm">// ✓</span>
const effective = node.price ?? inherited;
getItemPrice(group, itemId, effective);</pre>
    </div>
    <p><b class="hl">Why it matters:</b> both bugs return correct answers on the menu you were given. They fail on the interviewer's second input — the one with a $0 promotion, or one more level of nesting — which is exactly why that second input exists.</p>` },

  { eb:"lesson 13 · inherited state", title:"Down as parameters, up as return values", html:`
    <p class="big">One question decides the signature of every recursive function you will ever write: <b class="hl">does this value come from my ancestors, or from my descendants?</b> Ancestors' values ride down as parameters. Descendants' answers ride up as return values. Get those two lists straight before writing a line and the code writes itself.</p>
    <div class="diagram anim" style="--step:.45s">
      <div class="dlabel">the two directions &middot; and what belongs in each</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">&darr; down</div><div class="lstep seq" style="--i:0"><b>parameters</b> &mdash; anything a node needs from its <i>ancestors</i></div>
        <div class="lanehead seq" style="--i:1"></div><div class="lstep seq" style="--i:1"><span class="chip2 sync">inherited price</span><span class="chip2 sync">path so far</span><span class="chip2 sync">depth</span><span class="chip2 sync">locale</span><span class="chip2 sync">permissions</span><span class="chip2 sync">visited set</span></div>
        <div class="lanehead seq" style="--i:2">&uarr; up</div><div class="lstep seq" style="--i:2"><b>return values</b> &mdash; anything computed from a node's <i>descendants</i></div>
        <div class="lanehead seq" style="--i:3"></div><div class="lstep seq" style="--i:3"><span class="chip2 micro">the match</span><span class="chip2 micro">subtree count</span><span class="chip2 micro">height</span><span class="chip2 micro">total price</span><span class="chip2 micro">found? boolean</span></div>
        <div class="lanehead seq" style="--i:4">both</div><div class="lstep good seq pop" style="--i:4"><b>accumulator</b> &mdash; an <code>out</code> array/Map passed down <b>by reference</b> and written into; used when every node contributes and nothing returns early</div>
      </div>
      <div class="dnote seq" style="--i:5">The accumulator is the shape of every "do it for all of them" follow-up: <b style="color:var(--ordered)">same recursion, carried state unchanged, early return deleted</b>, results pushed into a shared collection.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>A fair question: why not mutate a closure variable instead of threading a parameter? You can, and for accumulators it's idiomatic. But for inherited values it's a trap — <b class="hl">a mutated "current price" variable has to be restored on the way out</b>, and every path where you forget leaks a sibling's state into the next branch. A parameter is restored for you, automatically, by the call stack. Prefer the parameter; the only thing you should ever mutate across a branch is a collection you never read.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; all three directions in one function</div>
      <pre class="code"><span class="cm">// down: inherited, trail  |  up: none  |  accumulator: out</span>
function flattenMenu(node, inherited = null, trail = [], out = []) {
  const effective = node.price ?? inherited;
  const here = trail.concat(node.name);      <span class="ok">// fresh array: nothing to undo</span>
  for (const item of node.items || []) {
    out.push({ id: item.id,
               price: item.price ?? effective,
               path: here.concat(item.name) });
  }
  for (const group of node.groups || [])
    flattenMenu(group, effective, here, out);
  return out;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "what state has to travel downward?" is a question you should answer before you're asked. It's also the sentence that converts this one problem into a pattern you can reuse on permissions, themes, tax rates, and every cascade you'll meet after the interview.</p>` },
  );

  /* =========================================================
     2. QUIZ — two more traces, on the menu shape
     ========================================================= */
  QUIZ.push(

  { code:`const menu = {
  name: "Lunch", price: 12,
  groups: [
    { name: "Entrees", price: null,
      items: [ { id: "burger", price: null } ],
      groups: [
        { name: "Salads", price: 8,
          items: [ { id: "garden", price: null } ] } ] },
  ],
};

// effective = node.price ?? inherited, passed down
console.log(getItemPrice(menu, "burger"),
            getItemPrice(menu, "garden"));`,
    options:["12 8 — Entrees passes 12 through; garden takes Salads' 8",
             "12 12 — Lunch is the root, so everything below it inherits 12 unless an item declares its own",
             "null 8 — Entrees declares null, so its own items have no price to inherit"],
    answer:0,
    whys:[
      "Right. `null ?? 12` leaves 12 standing, so Entrees passes 12 through untouched and burger resolves to it. Salads then REPLACES it with 8, and every item below Salads sees 8. 'Closest defining ancestor' needs no upward search — each level either overrides the value or forwards it.",
      "That's what you get by recursing with `inherited` instead of `effective`: Salads computes 8, prices its own items with it, and then hands its children the root's 12. The bug is invisible at one level of nesting and obvious at three — which is why the interviewer's test menu has three.",
      "`price: null` means 'I decline to declare one', which is exactly what makes inheritance work — the value keeps falling through from above. If null meant 'no price', you couldn't express 'use whatever the section costs', and every group would have to repeat its parent's number."] },

  { code:`const menu = {
  name: "Happy Hour", price: 9,
  groups: [
    { name: "Drinks", price: 0,
      items: [ { id: "water", price: null } ] },
  ],
};

function price(node, id, inherited = null) {
  const effective = node.price || inherited;   // <-- note
  for (const item of node.items || [])
    if (item.id === id) return item.price ?? effective;
  for (const g of node.groups || []) {
    const found = price(g, id, effective);
    if (found !== null) return found;
  }
  return null;
}
console.log(price(menu, "water"));`,
    options:["9 — `0 || 9` is 9, so the free price is erased",
             "0 — Drinks declares 0, and `||` returns the left side when it's defined",
             "null — water has no price of its own, and `||` can't resolve one from a falsy ancestor"],
    answer:0,
    whys:[
      "Right, and this is a real billing bug, not a puzzle. `||` falls through on ANY falsy value, and 0 is falsy — Drinks' free price never survives the line that was supposed to resolve it, so water inherits the $9 base. The fix is one character: `??` falls through only on null/undefined, which is precisely the question inheritance asks.",
      "`||` returns the left side only when it's TRUTHY — 0 isn't. That's the whole difference between the two operators, and it's why `??` was added to the language: `||` conflates 'unset' with 'zero, empty, or false'.",
      "The traversal is fine and water is found — `item.price ?? effective` correctly falls back to the inherited value. The damage happened one line earlier, at the resolve step, where a real price of 0 was thrown away."] },
  );

  /* =========================================================
     3. CARDS — one more judgment call
     ========================================================= */
  CARDS.push(
    ["The menu grows a 'nested combo' where a group appears under two sections. What do you change?",
     "It stopped being a tree, so: add a `visited` Set keyed by group id, checked and marked on entry, to stop the duplicate subtree work — and if any link can point upward, that Set is also the only thing preventing a stack overflow. Then ask the product question, because it decides the answer: should an item reachable two ways be listed twice (it's a DAG, dedupe the OUTPUT) or once (dedupe the TRAVERSAL)? And inherited prices become ambiguous — the same item now has two ancestors with two prices, so the spec has to say which path wins."],
  );

})();
