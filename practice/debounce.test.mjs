import { suite, sleep } from "./_harness.mjs";
import { debounce } from "./debounce.mjs";

suite("Debounce — trailing edge, last args win", async ({ log, assert }) => {
  const hits = [];
  const save = debounce((v) => hits.push(v), 30);

  save(1);
  // STRENGTHEN: debounce must not fire on the leading edge.
  assert(hits.length === 0, "debounce must not fire synchronously on the first call — it waits for quiet");
  await sleep(10); save(2); await sleep(10); save(3);
  await sleep(60);
  log("burst 1,2,3 inside the window -> fired with: [" + hits.join(", ") + "]");
  assert(hits.length === 1, "a burst of 3 calls inside the window must collapse to exactly 1 run (got " + hits.length + ")");
  assert(hits[0] === 3, "the LAST call's arguments must win (fired with " + hits[0] + ")");

  save(4);
  await sleep(60);
  assert(hits.length === 2 && hits[1] === 4, "a lone call after quiet must fire on its own, once");
  log("lone call after quiet fired once");

  return "the burst collapsed to one trailing call carrying the final arguments";
});
