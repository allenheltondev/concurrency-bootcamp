/* Span tree — reference solution. */
"use strict";

export function buildTrace(spans) {
  const nodes = new Map(spans.map(s => [s.id, { ...s, children: [] }]));
  let root = null;
  for (const s of nodes.values()) {
    if (s.parent == null) root = s;               // structure, not order
    else if (nodes.has(s.parent))                 // orphans are skipped
      nodes.get(s.parent).children.push(s);
  }
  for (const s of nodes.values())
    s.children.sort((a, b) => a.start - b.start);
  return root;
}

export function criticalPath(root) {
  const path = [root.name];
  let cur = root;
  while (cur.children.length) {
    cur = cur.children.reduce((a, b) => b.end > a.end ? b : a);  // last finisher
    path.push(cur.name);
  }
  return path;
}
