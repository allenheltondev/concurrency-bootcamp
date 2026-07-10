/* Fact store — semantic memory with supersession.

   INVARIANT: facts are keyed by subject|attribute — one question, one current
   answer. upsert returns "added" (new key), "confirmed" (same value:
   confirmations+1, ts refreshed), or "superseded" (different value: the OLD
   {value, ts} is pushed into history, the record answers with the new value,
   and confirmations RESET to 1 — a revision is not a confirmation).
   EDGE: different attributes of the same subject are independent facts;
   get() of an unknown key returns null. */
"use strict";

export class FactStore {
  constructor() {
    this.facts = new Map();   // key -> { value, ts, confirmations, history }
  }

  upsert(subject, attribute, value, ts) {
    throw new Error("implement me");
  }

  get(subject, attribute) {
    throw new Error("implement me");
  }

  record(subject, attribute) {
    return this.facts.get(subject + "|" + attribute) || null;
  }
}
