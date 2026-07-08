/* throttle — leading-edge rate limit. Reference solution. */
export function throttle(fn, interval) {
  let last = 0;                                   // when fn last actually ran
  return function (...args) {
    const now = Date.now();
    if (now - last >= interval) {                 // window elapsed?
      last = now;                                 // advance the clock ONLY on a fire
      fn.apply(this, args);
    }
  };
}
