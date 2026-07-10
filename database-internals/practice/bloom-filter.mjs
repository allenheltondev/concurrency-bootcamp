/* Bloom filter — the "definitely not here" gate in front of every SSTable.

   hash(key, seed) is GIVEN below (FNV-1a, deterministic). k different seeds
   stand in for k independent hash functions.

   add(key): set bits[hash(key, i) % m] = 1 for every i in 0..k-1.
   mightContain(key): true iff ALL k positions are set — one clear bit is
   proof of absence, so answer false and skip the table.

   INVARIANT: no false negatives, EVER — every key that was add()ed must
   answer true, no matter what else was added. False positives are allowed
   (that is the price of the compression); a false negative would silently
   drop committed data on the read path.
   EDGE: a fresh filter answers false for everything. */
"use strict";

export function hash(key, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class BloomFilter {
  constructor(m, k) {
    this.m = m;                          // number of bits
    this.k = k;                          // number of hash positions per key
    this.bits = new Array(m).fill(0);
  }

  add(key) {
    throw new Error("implement me");
  }

  mightContain(key) {
    throw new Error("implement me");
  }
}
