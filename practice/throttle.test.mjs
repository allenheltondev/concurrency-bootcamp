import { suite, sleep } from "./_harness.mjs";
import { throttle } from "./throttle.mjs";

suite("Throttle — leading edge, one per interval", async ({ log, assert }) => {
  let calls = 0, firstArg = null;
  const f = throttle((v) => { calls++; if (calls === 1) firstArg = v; }, 30);

  f("a");   // leading edge: fires immediately
  assert(calls === 1, "leading-edge throttle must fire on the FIRST call, immediately");
  assert(firstArg === "a", "the first call must run with its own arguments");
  log("first call fired immediately with 'a'");

  f("b"); f("c");   // within the interval -> dropped
  assert(calls === 1, "calls within the interval must be dropped, not queued (calls = " + calls + ")");
  log("two calls inside the window were dropped");

  await sleep(40);  // interval elapsed
  f("d");           // fires again
  assert(calls === 2, "a call after the interval elapses must fire again (calls = " + calls + ")");
  log("after the interval, a call fired again");

  // STRENGTHEN: a steady stream is capped to roughly one per interval, not one per call.
  let n = 0;
  const g = throttle(() => { n++; }, 20);
  for (let i = 0; i < 12; i++) { g(); await sleep(5); }   // ~60ms of calls, 5ms apart
  assert(n >= 2 && n <= 5, "a steady stream must be capped near once/interval, not fire on every call (fired " + n + ")");
  log("12 calls over ~60ms, interval 20ms -> fired " + n + " times");

  return "leading edge fired first, in-window calls dropped, and a steady stream stayed capped";
});
