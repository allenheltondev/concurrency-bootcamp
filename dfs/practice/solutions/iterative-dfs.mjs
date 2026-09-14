/* Recursion to an explicit stack — reference solution. */
"use strict";

export function preorderIterative(root) {
  const out = [], stack = [root];
  while (stack.length) {
    const node = stack.pop();                       // LIFO = depth-first
    out.push(node.name);
    for (let i = node.children.length - 1; i >= 0; i--)
      stack.push(node.children[i]);                 // reversed: leftmost pops first
  }
  return out;
}

export function priceIterative(menu, itemId) {
  const stack = [[menu, null]];                     // node + what it inherits
  while (stack.length) {
    const [node, inherited] = stack.pop();
    const effective = node.price ?? inherited;
    for (const item of node.items || [])
      if (item.id === itemId) return item.price ?? effective;
    const groups = node.groups || [];
    for (let i = groups.length - 1; i >= 0; i--)
      stack.push([groups[i], effective]);           // carry the state alongside
  }
  return null;
}
