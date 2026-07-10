/* Session buffer — reference solution. */
"use strict";

export const approxTokens = (text) => Math.ceil(text.length / 4);

export class SessionBuffer {
  constructor(budget) {
    this.budget = budget;
    this.msgs = [];
  }

  tokens() {
    return this.msgs.reduce((n, m) => n + approxTokens(m.text), 0);
  }

  push(role, text, pin = false) {
    this.msgs.push({ role, text, pin });
    while (this.tokens() > this.budget) {
      const i = this.msgs.findIndex((m) => !m.pin);   // oldest unpinned first
      if (i === -1) break;                            // only pins remain
      this.msgs.splice(i, 1);
    }
  }
}
