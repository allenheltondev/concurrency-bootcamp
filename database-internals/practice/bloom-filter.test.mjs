import { suite } from "./_harness.mjs";
import { BloomFilter, hash } from "./bloom-filter.mjs";

suite("bloom filter — no false negatives, ever; absence answered without a disk read", ({ log, assert }) => {
  // hash() is the given FNV-1a — pin it so a "fixed" hash can't quietly change the game.
  assert(hash("sstable", 0) === (hash("sstable", 0) >>> 0), "hash must return an unsigned 32-bit integer");
  assert(hash("key", 0) !== hash("key", 1),
    "different seeds must act as different hash functions — k copies of one position is not a bloom filter");

  const f = new BloomFilter(256, 3);
  assert(f.mightContain("anything") === false,
    "a fresh filter has every bit clear — it must answer false for everything");

  const added = [];
  for (let i = 0; i < 20; i++) added.push("user:" + i);
  for (const k of added) f.add(k);

  const setBits = f.bits.filter((b) => b === 1).length;
  log("20 keys added -> " + setBits + " of 256 bits set");
  assert(setBits > 0 && setBits <= 60, "add() must set at most k=3 bits per key — " + setBits + " bits for 20 keys");

  // THE invariant: every added key answers true. One false here and a read
  // path that trusts the filter silently loses committed data.
  for (const k of added) {
    assert(f.mightContain(k) === true,
      'false negative for added key "' + k + '" — mightContain must be true iff ALL k positions are set, ' +
      "and add() must set exactly those positions. A bloom filter may cry wolf; it may never miss a wolf.");
  }

  // Absent keys: false positives are allowed, but the filter must FILTER —
  // most absent keys should be turned away without touching the SSTable.
  let filtered = 0;
  const maybes = [];
  for (let i = 0; i < 40; i++) {
    const k = "ghost:" + i;
    if (f.mightContain(k)) maybes.push(k);
    else filtered++;
  }
  log("40 absent keys probed -> " + filtered + " answered false, " + maybes.length + " false positive(s)");
  assert(filtered >= 1,
    "every absent key answered true — a filter that never says no skips nothing and saves no reads; " +
    "check that mightContain requires ALL k positions, not ANY");

  return "all 20 added keys answered true, " + filtered + "/40 absent keys filtered — no false negatives";
});
