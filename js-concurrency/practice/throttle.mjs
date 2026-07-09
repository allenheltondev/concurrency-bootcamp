/* throttle(fn, interval) — leading-edge rate limit.

   Return a wrapped function that runs fn at most once per `interval` ms,
   however often it is called. The FIRST call in a window fires immediately;
   calls within the interval are dropped.

   INVARIANT: fn fires only when at least `interval` ms have passed since the
   last accepted call — and the "last accepted" clock advances ONLY then.
   NOT debounce: fire on the leading edge, drop the middle, do not defer.
   PITFALLS: set `last = now` only when you actually fire (setting it every
   call makes now-last always 0 and fn never runs); never updating `last` lets
   every call through once the first window elapses.
*/
export function throttle(fn, interval) {
  throw new Error("implement me");
}
