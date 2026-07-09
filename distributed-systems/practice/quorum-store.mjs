/* Quorum replication — N replicas, W write acks, R read replies.

   A Replica is one storage node: an in-memory map behind an async interface
   with an `up` flag — a down replica throws instead of answering. A
   QuorumStore fans every operation out to ALL replicas and counts replies.

   INVARIANTS:
   - Replica.put is last-writer-wins by version: an older record must never
     overwrite a newer one (rec.version >= current wins).
   - QuorumStore.put stamps each write with a monotonically increasing
     version, fans out with Promise.allSettled (a down replica must not sink
     the whole write), and THROWS unless at least W replicas acked.
   - QuorumStore.get needs at least R replies (else it throws) and returns
     the record with the HIGHEST version among them — with R + W > N, some
     replier must overlap the last write, so the newest version is always in
     the room.
   EDGE: a replica that never saw the key replies null — null is a reply, not
   a failure; it just never wins the version contest.
*/
export class Replica {
  #data = new Map();
  constructor(name) { this.name = name; this.up = true; }

  async put(key, rec) {                 // rec = {value, version}
    throw new Error("implement me");
  }

  async get(key) {
    throw new Error("implement me");
  }

  peek(key) {                           // test-only: read the map directly — no network, no up check
    throw new Error("implement me");
  }
}

export class QuorumStore {
  #version = 0;
  constructor(replicas, w, r) { this.replicas = replicas; this.w = w; this.r = r; }

  async put(key, value) {               // -> {version, acks}
    throw new Error("implement me");
  }

  async get(key) {                      // -> the newest record, or null
    throw new Error("implement me");
  }
}
