/* retry — bounded, exponential backoff. Reference solution. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function retry(fn, tries, baseMs) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();                        // await INSIDE try or catch sees nothing
    } catch (err) {
      if (attempt >= tries) throw err;          // exhausted: rethrow the original
      await sleep(baseMs * 2 ** (attempt - 1)); // exponential backoff
    }
  }
}
