import { suite } from "./_harness.mjs";
import { BoundedMemory, DAY } from "./forgetting-policy.mjs";

suite("forgetting policy — evict the idle and unimportant, never the pinned", ({ log, assert }) => {
  const mem = new BoundedMemory(3, 7);

  mem.add({ id: "pin", importance: 5, pin: true }, 0);
  assert(mem.score(mem.items[0], 365 * DAY) === Infinity, "pinned items must score Infinity at any age");

  mem.add({ id: "fonts", importance: 3 }, 0);
  const atCap = mem.add({ id: "allergy", importance: 10 }, 1 * DAY);
  assert(atCap === null && mem.items.length === 3, "no eviction while merely AT capacity");

  const freshScore = mem.score({ importance: 10, lastAccess: 0 }, 0);
  assert(Math.abs(freshScore - 1) < 1e-9, "importance 10, just accessed -> score 1, got " + freshScore);
  const halfScore = mem.score({ importance: 10, lastAccess: 0 }, 7 * DAY);
  assert(Math.abs(halfScore - 0.5) < 1e-9, "one half-life idle -> score halves, got " + halfScore);

  mem.touch("allergy", 29 * DAY);   // retrieval refreshes relevance
  const out = mem.add({ id: "new", importance: 6 }, 30 * DAY);
  log("capacity squeeze on day 30 -> evicted: " + (out && out.id));
  assert(out && out.id === "fonts",
    "the low-importance, 30-days-idle memory must be the victim, got " + (out && out.id));
  assert(mem.has("pin"), "pinned memories never age out");
  assert(mem.has("allergy"), "a recently-touched memory must survive — being used keeps it alive");
  assert(mem.has("new"), "the newcomer that forced the eviction takes the seat");

  const out2 = mem.add({ id: "trivia", importance: 1 }, 30 * DAY);
  assert(out2 && out2.id === "trivia", "the weakest can be the newcomer itself, got " + (out2 && out2.id));
  assert(mem.items.length === 3, "the store never exceeds its capacity");
  return "pins unbeatable, recent use rewarded, the weakest forgotten — curation, not data loss";
});
