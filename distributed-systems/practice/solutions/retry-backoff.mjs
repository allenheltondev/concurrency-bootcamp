/* retryBackoff — exponential, capped, full jitter, injected time. Reference solution. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function retryBackoff(fn, { tries = 4, base = 8, cap = 1000, jitter = false, wait = sleep, random = Math.random } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();                                        // await INSIDE the try, or the catch sees nothing
    } catch (err) {
      if (++attempt >= tries) throw err;                        // exhausted: rethrow the LAST error, no final wait
      const ceiling = Math.min(cap, base * 2 ** (attempt - 1)); // exponential, capped
      await wait(jitter ? Math.floor(random() * ceiling) : ceiling);  // full jitter: uniform in [0, ceiling)
    }
  }
}
