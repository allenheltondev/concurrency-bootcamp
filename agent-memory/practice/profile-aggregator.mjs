/* Profile aggregator — the evolving aggregate memory.

   Episodic memories fold into one living profile, one episode at a time:
   applyEpisode(ep) processes each fact {topic, attribute, value} in ep.facts
   against the profile map (keyed topic|attribute).

   INVARIANT:
     - unknown key  -> "learned":   { value, confidence: 1, history: [] }
     - same value   -> "reinforced": confidence + 1, CAPPED at this.cap
       (beliefs must stay overturnable)
     - new value    -> "revised":   old value pushed to history, value
       replaced, confidence RESET to 1 (a revision is not a confirmation)
   applyEpisode returns the list of change strings, e.g. "learned user|drink".
   EDGE: one episode can carry several facts; the cap never lets confidence
   exceed this.cap no matter how many confirmations arrive. */
"use strict";

export class AggregateMemory {
  constructor(cap = 5) {
    this.cap = cap;
    this.profile = new Map();
  }

  applyEpisode(ep) {
    throw new Error("implement me");
  }

  get(topic, attribute) {
    return this.profile.get(topic + "|" + attribute) || null;
  }

  render() {
    // compact injection block, strongest belief first
    return [...this.profile.entries()]
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .map(([k, v]) => k.replace("|", " ") + ": " + v.value);
  }
}
