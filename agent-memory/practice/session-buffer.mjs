/* Session buffer — the context window as a token budget.

   INVARIANT: after every push(), total tokens <= budget, pinned messages are
   never evicted, and evictions take the OLDEST UNPINNED message first.
   EDGE: one oversized push can require several evictions (while, not if);
   if only pinned messages remain, stop trimming rather than loop forever.

   approxTokens(text) = Math.ceil(text.length / 4). */
"use strict";

export const approxTokens = (text) => Math.ceil(text.length / 4);

export class SessionBuffer {
  constructor(budget) {
    this.budget = budget;
    this.msgs = [];   // [{ role, text, pin }]
  }

  tokens() {
    throw new Error("implement me");
  }

  push(role, text, pin = false) {
    throw new Error("implement me");
  }
}
