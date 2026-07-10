import { suite } from "./_harness.mjs";
import { MemoryIndex, cosine } from "./memory-index.mjs";

suite("memory index — ranked competition for k slots", ({ log, assert }) => {
  assert(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9, "identical unit vectors score 1");
  assert(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-9, "orthogonal vectors score 0");
  assert(Math.abs(cosine([1, 0, 0], [0.6, 0.8, 0]) - 0.6) < 1e-9, "partial overlap scores the dot product");

  const index = new MemoryIndex();
  assert(index.search([1, 0, 0], 3).length === 0, "an empty store returns []");

  index.add({ id: "coffee", vec: [1, 0, 0] });
  index.add({ id: "deploy", vec: [0, 1, 0] });
  index.add({ id: "mixed", vec: [0.6, 0.8, 0] });

  const r = index.search([1, 0, 0], 2);
  log("query toward 'coffee': " + r.map((x) => x.item.id + "@" + x.sim.toFixed(2)).join(", "));
  assert(r.length === 2, "asked for k=2, got " + r.length);
  assert(r[0].item.id === "coffee", "best match must come FIRST, got " + r[0].item.id);
  assert(r[1].item.id === "mixed", "second place goes to the partial overlap, got " + r[1].item.id);
  assert(r[0].sim >= r[1].sim, "results must be ordered best-first");

  const r2 = index.search([0, 1, 0], 1);
  assert(r2.length === 1 && r2[0].item.id === "deploy", "a different query direction finds a different best");

  const all = index.search([0, 0, 1], 10);
  assert(all.length === 3, "k beyond the store size returns everything, still ranked");
  return "cosine ranked, best-first, cut at k — retrieval as a scored competition";
});
