/* Span tree — assemble a trace from a bag of spans, then find the chain
   that decides the latency.

   INVARIANT: spans arrive in ANY order (exporters ship children before
   parents constantly). The root is the span with parent == null — a
   structural fact, never "first in the array". Children attach by parent id
   and sort by start time; a span whose parent never arrived is SKIPPED, not
   fatal (exporters drop spans; the rest of the tree must still render).
   criticalPath(root): from the root, repeatedly follow the child that
   FINISHES LAST (largest end) to a leaf; return the names, root first —
   the last-finisher chain, i.e. the first-order critical path (the last
   finisher at every level is always on it; sequential predecessors that
   gate its start matter too).
   EDGE: a childless root is its own critical path; the longest-duration
   child is NOT necessarily the last finisher. */
"use strict";

/* spans: [{ id, parent, name, start, end }] -> root node with children[] */
export function buildTrace(spans) {
  throw new Error("implement me");
}

export function criticalPath(root) {
  throw new Error("implement me");
}
