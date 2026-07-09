/* debounce(fn, ms) — trailing-edge debounce.

   Return a wrapped function. A burst of calls collapses to ONE run, ms after
   the burst goes quiet, carrying the LAST call's arguments.

   INVARIANT: fn never fires while calls keep arriving within `ms` of each
   other — each call resets the countdown.
   LAST-WINS: the arguments of the final call in the burst are the ones fn sees.
   NOT throttle: do not fire on the leading edge; do not ignore calls while a
   timer is pending — cancel and re-arm.
*/
export function debounce(fn, ms) {
  throw new Error("implement me");
}
