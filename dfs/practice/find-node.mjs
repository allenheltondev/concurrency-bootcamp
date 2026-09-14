/* findNode — depth-first search over an n-ary tree, with a short-circuit.

   INVARIANT: findNode returns the first node (in DFS preorder) whose name
   matches, or null. "First" is a promise about ORDER: root before children,
   children in array order, each child's entire subtree before the next
   sibling. It must stop as soon as it has an answer — the exported `visits`
   counter proves it, so increment it once per node ENTERED.
   findAllNodes returns every match, in the same order, and can never stop
   early.
   EDGE: a null root returns null (findAllNodes: []); a leaf is a node whose
   children array is empty, not a special case; a target absent from the tree
   still costs a full walk. */
"use strict";

export const counter = { visits: 0 };   // reset by the tests before each call

/* node: { name, children: [ ...nodes ] } -> the matching node, or null */
export function findNode(root, targetName) {
  throw new Error("implement me");
}

/* every node whose name matches, in DFS order */
export function findAllNodes(root, targetName) {
  throw new Error("implement me");
}
