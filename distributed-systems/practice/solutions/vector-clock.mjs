/* Vector clock — element-wise max, then your own slot. Reference solution. */
export class VectorClock {
  constructor(id, n) { this.id = id; this.v = new Array(n).fill(0); }

  tick() { this.v[this.id]++; return this.v.slice(); }    // only your own slot — and hand out a copy
  stamp() { this.v[this.id]++; return this.v.slice(); }
  recv(remote) {
    for (let i = 0; i < this.v.length; i++) this.v[i] = Math.max(this.v[i], remote[i]);  // merge FIRST
    this.v[this.id]++;                                    // THEN count this receive
    return this.v.slice();
  }
}

export function vcCompare(a, b) {        // "before" | "after" | "concurrent" | "equal"
  let le = true, ge = true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) le = false;
    if (a[i] < b[i]) ge = false;
  }
  if (le && ge) return "equal";
  if (le) return "before";
  if (ge) return "after";
  return "concurrent";                   // each side won a slot — causally unrelated
}
