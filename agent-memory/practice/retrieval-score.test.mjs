import { suite } from "./_harness.mjs";
import { scoreMemory, rank, DAY } from "./retrieval-score.mjs";

suite("retrieval scoring — freshness counts FOR a memory, bounded and weighted", ({ log, assert }) => {
  const w = { sim: 0.6, rec: 0.25, imp: 0.15, halfLifeDays: 7 };
  const now = 60 * DAY;

  const newborn = scoreMemory({ ts: now, importance: 5 }, 0, now, { sim: 0, rec: 1, imp: 0, halfLifeDays: 7 });
  assert(Math.abs(newborn - 1) < 1e-9, "a memory written right now must have recency exactly 1, got " + newborn);

  const week = scoreMemory({ ts: 53 * DAY, importance: 5 }, 0, now, { sim: 0, rec: 1, imp: 0, halfLifeDays: 7 });
  assert(Math.abs(week - 0.5) < 1e-9, "after exactly one half-life the recency term must be 0.5, got " + week);

  const ancient = scoreMemory({ ts: 0, importance: 5 }, 0, now, { sim: 0, rec: 1, imp: 0, halfLifeDays: 7 });
  assert(ancient > 0 && ancient < 0.01, "old memories fade toward 0 but never go negative, got " + ancient);

  const impOnly = scoreMemory({ ts: now, importance: 10 }, 0, now, { sim: 0, rec: 0, imp: 1, halfLifeDays: 7 });
  assert(Math.abs(impOnly - 1) < 1e-9, "importance 10 must normalize to 1, got " + impOnly);

  // the scenario the score exists for: a stale near-tie
  const stale = { ts: 0, importance: 6 };          // "lives in Austin", day 0
  const fresh = { ts: 59 * DAY, importance: 6 };   // "moved to Denver", day 59
  const ranked = rank([stale, fresh], [0.82, 0.80], now, w);
  log("stale sim .82 scored " + ranked.find(r => r.m === stale).score.toFixed(3)
    + " vs fresh sim .80 scored " + ranked.find(r => r.m === fresh).score.toFixed(3));
  assert(ranked[0].m === fresh, "recency must break the near-tie toward the fresh memory");

  // importance rescues what similarity underrates
  const allergy = { ts: 30 * DAY, importance: 10 };
  const joke = { ts: 30 * DAY, importance: 2 };
  const r2 = rank([joke, allergy], [0.55, 0.50], now, w);
  assert(r2[0].m === allergy, "high importance must outrank a slightly-more-similar triviality");
  return "bounded decay, normalized importance, weighted sum — the three-signal score holds";
});
