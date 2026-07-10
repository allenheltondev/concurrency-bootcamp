/* B-tree leaf node — reference solution. */
"use strict";

export function search(node, key) {
  let lo = 0, hi = node.keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (node.keys[mid] === key) return mid;
    if (node.keys[mid] < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function insert(node, key, order) {
  let i = 0;
  while (i < node.keys.length && node.keys[i] < key) i++;
  if (node.keys[i] === key) return null;         // duplicate — one key, one slot
  node.keys.splice(i, 0, key);
  if (node.keys.length <= order) return null;    // still fits — no split
  const mid = Math.ceil(node.keys.length / 2);   // extra key stays on the LEFT
  const right = { keys: node.keys.slice(mid) };
  node.keys = node.keys.slice(0, mid);
  return { sep: right.keys[0], right };          // sep = right's smallest key
}
