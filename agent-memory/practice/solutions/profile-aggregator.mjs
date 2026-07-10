/* Profile aggregator — reference solution. */
"use strict";

export class AggregateMemory {
  constructor(cap = 5) {
    this.cap = cap;
    this.profile = new Map();
  }

  applyEpisode(ep) {
    const changes = [];
    for (const f of ep.facts) {
      const key = f.topic + "|" + f.attribute;
      const cur = this.profile.get(key);
      if (!cur) {
        this.profile.set(key, { value: f.value, confidence: 1, history: [] });
        changes.push("learned " + key);
      } else if (cur.value === f.value) {
        cur.confidence = Math.min(this.cap, cur.confidence + 1);   // capped — stays overturnable
        changes.push("reinforced " + key);
      } else {
        cur.history.push({ value: cur.value });
        cur.value = f.value;
        cur.confidence = 1;                                        // humble again
        changes.push("revised " + key);
      }
    }
    return changes;
  }

  get(topic, attribute) {
    return this.profile.get(topic + "|" + attribute) || null;
  }

  render() {
    return [...this.profile.entries()]
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .map(([k, v]) => k.replace("|", " ") + ": " + v.value);
  }
}
