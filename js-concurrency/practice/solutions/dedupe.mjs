/* dedupe — in-flight promise sharing, per-key eviction. Reference solution. */
export function dedupe(fn) {
  const inflight = new Map();                                   // key -> in-flight promise
  return (key) => {
    if (inflight.has(key)) return inflight.get(key);           // share the flight
    const p = fn(key).finally(() => inflight.delete(key));     // evict THIS key on settle
    inflight.set(key, p);
    return p;
  };
}
