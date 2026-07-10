/* Bloom filter — reference solution. */
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
    this.m = m;
    this.k = k;
    this.bits = new Array(m).fill(0);
  }

  add(key) {
    for (let i = 0; i < this.k; i++) {
      this.bits[hash(key, i) % this.m] = 1;
    }
  }

  mightContain(key) {
    for (let i = 0; i < this.k; i++) {
      if (this.bits[hash(key, i) % this.m] === 0) return false;   // proof of absence
    }
    return true;                                                  // maybe — go look
  }
}
