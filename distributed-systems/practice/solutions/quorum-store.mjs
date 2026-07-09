/* Quorum store — count acks, take the highest version. Reference solution. */
export class Replica {
  #data = new Map();
  constructor(name) { this.name = name; this.up = true; }

  async put(key, rec) {                              // rec = {value, version}
    if (!this.up) throw new Error(this.name + " unreachable");
    const cur = this.#data.get(key);
    if (!cur || rec.version >= cur.version) this.#data.set(key, rec);  // last-writer-wins by version
    return true;
  }

  async get(key) {
    if (!this.up) throw new Error(this.name + " unreachable");
    return this.#data.get(key) || null;              // null is a reply, not a failure
  }

  peek(key) { return this.#data.get(key) || null; }  // test-only: no network, no up check
}

export class QuorumStore {
  #version = 0;
  constructor(replicas, w, r) { this.replicas = replicas; this.w = w; this.r = r; }

  async put(key, value) {
    const rec = { value, version: ++this.#version };            // monotonic per store
    const settled = await Promise.allSettled(this.replicas.map((rep) => rep.put(key, rec)));
    const acks = settled.filter((s) => s.status === "fulfilled").length;
    if (acks < this.w) throw new Error(`write failed: ${acks}/${this.w} acks`);
    return { version: rec.version, acks };
  }

  async get(key) {
    const settled = await Promise.allSettled(this.replicas.map((rep) => rep.get(key)));
    const reads = settled.filter((s) => s.status === "fulfilled");
    if (reads.length < this.r) throw new Error(`read failed: ${reads.length}/${this.r} replies`);
    let newest = null;
    for (const s of reads) if (s.value && (!newest || s.value.version > newest.version)) newest = s.value;
    return newest;                                   // highest version among the quorum wins
  }
}
