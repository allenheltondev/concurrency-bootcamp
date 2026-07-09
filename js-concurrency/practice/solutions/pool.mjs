/* mapPool — bounded concurrency via a shared cursor. Reference solution. */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;                    // claim this index ONCE, atomically
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(limit, items.length); // never more workers than items
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
