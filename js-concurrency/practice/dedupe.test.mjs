import { suite, sleep, deferred } from "./_harness.mjs";
import { dedupe } from "./dedupe.mjs";

suite("In-flight dedup — share while flying, evict on settle", async ({ log, assert }) => {
  const gates = {};
  const launches = { a: 0, b: 0 };
  const fetcher = (key) => { launches[key]++; gates[key] = deferred(); return gates[key].promise; };
  const get = dedupe(fetcher);
  const p1 = get("a"), p2 = get("a"), pb = get("b");
  assert(p1 === p2, "two calls for the same key in flight must share ONE promise");
  assert(launches.a === 1, "the underlying fetch for 'a' must launch once (launched " + launches.a + " times)");
  log("concurrent get(a), get(a): one launch, one shared promise");

  gates.a.resolve("A1");
  assert(await p1 === "A1", "callers must receive the fetched value");
  await sleep(1);
  get("a");
  assert(launches.a === 2, "after the fetch settles the entry must be evicted - a new call refetches (launched " + launches.a + " times)");
  log("post-settle get(a) launched a fresh fetch");

  const pb2 = get("b");
  assert(pb === pb2 && launches.b === 1, "evicting 'a' must not touch 'b', still in flight (b launched " + launches.b + " times)");
  log("b's in-flight entry survived a's eviction");
  gates.b.resolve("B1"); gates.a.resolve("A2");

  // STRENGTHEN: a REJECTED in-flight promise is also evicted, so a later call retries.
  let n = 0;
  const getF = dedupe(() => { n++; return Promise.reject(new Error("boom")); });
  await getF("k").catch(() => {});
  await getF("k").catch(() => {});
  assert(n === 2, "a failed fetch must evict its key so the next caller retries (launched " + n + " times)");
  log("rejection evicted the key; the retry launched a fresh fetch");

  return "one launch per key in flight, per-key eviction on settle (success or failure), fresh fetch afterward";
});
