/* Fact store — reference solution. */
"use strict";

export class FactStore {
  constructor() {
    this.facts = new Map();
  }

  upsert(subject, attribute, value, ts) {
    const key = subject + "|" + attribute;      // the key is the QUESTION
    const cur = this.facts.get(key);
    if (!cur) {
      this.facts.set(key, { value, ts, confirmations: 1, history: [] });
      return "added";
    }
    if (cur.value === value) {
      cur.confirmations++;
      cur.ts = ts;
      return "confirmed";
    }
    cur.history.push({ value: cur.value, ts: cur.ts });   // old value = provenance
    cur.value = value;
    cur.ts = ts;
    cur.confirmations = 1;                       // a revision re-earns its standing
    return "superseded";
  }

  get(subject, attribute) {
    const f = this.facts.get(subject + "|" + attribute);
    return f ? f.value : null;
  }

  record(subject, attribute) {
    return this.facts.get(subject + "|" + attribute) || null;
  }
}
