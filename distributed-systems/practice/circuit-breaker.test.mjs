import { suite } from "./_harness.mjs";
import { CircuitBreaker } from "./circuit-breaker.mjs";

suite("Circuit breaker — trip at the threshold, fail fast, probe once", async ({ log, assert }) => {
  let clock = 0; const now = () => clock;            // manual clock — no sleeping
  let hits = 0, healthy = false;
  const dep = async () => { hits++; if (!healthy) throw new Error("timeout"); return "data"; };
  const cb = new CircuitBreaker({ threshold: 3, cooldown: 50, now });

  await cb.call(dep).catch(() => {});
  await cb.call(dep).catch(() => {});
  assert(cb.state === "closed", "2 failures < threshold 3 — the breaker must still be closed");
  await cb.call(dep).catch(() => {});
  log("3 consecutive failures -> " + cb.state);
  assert(cb.state === "open", "the 3rd consecutive failure must trip the breaker open");

  // fast-fail: inside the cooldown the dependency must NOT be touched
  clock = 10;
  const before = hits;
  let fastErr = null;
  try { await cb.call(dep); } catch (e) { fastErr = e; }
  assert(fastErr, "a call while open must throw");
  assert(hits === before, "…and it must throw WITHOUT invoking the dependency — fn ran " + (hits - before) + " extra time(s), that's not failing fast");
  log("call at t=10 (cooldown 50): failed fast, dependency untouched");

  // half-open: after the cooldown, one probe — success closes and resets
  clock = 60; healthy = true;
  const probe = await cb.call(dep);
  log("probe at t=60 -> '" + probe + "', state " + cb.state);
  assert(probe === "data" && cb.state === "closed", "a successful probe must return the value and close the breaker");

  // the close must reset the streak: old failures don't carry over
  healthy = false;
  await cb.call(dep).catch(() => {});
  await cb.call(dep).catch(() => {});
  assert(cb.state === "closed", "closing must reset the failure count — 2 fresh failures < threshold, got state " + cb.state);

  // STRENGTHEN: a failed probe re-opens on ONE strike and restarts the cooldown.
  await cb.call(dep).catch(() => {});                // 3rd consecutive -> open, openedAt=60
  assert(cb.state === "open", "the fresh streak reached the threshold — open again");
  clock = 120;                                       // cooldown elapsed -> half-open
  const beforeProbe = hits;
  await cb.call(dep).catch(() => {});                // the probe fails
  assert(hits === beforeProbe + 1, "the half-open probe must reach the dependency exactly once — it reached it " + (hits - beforeProbe) + " time(s)");
  assert(cb.state === "open", "a failed probe re-opens on ONE strike — no fresh threshold streak required");
  clock = 130;
  const afterReopen = hits;
  await cb.call(dep).catch(() => {});
  assert(hits === afterReopen, "re-opening must RESTART the cooldown — t=130 is only 10ms past the failed probe, so this call must fail fast");
  log("failed probe re-opened the breaker and restarted the cooldown");

  // STRENGTHEN: only an UNBROKEN streak trips — a success in between resets the count.
  const cb2 = new CircuitBreaker({ threshold: 3, cooldown: 50, now });
  let ok = false;
  const dep2 = async () => { if (!ok) throw new Error("blip"); return "fine"; };
  await cb2.call(dep2).catch(() => {});
  await cb2.call(dep2).catch(() => {});
  ok = true;  await cb2.call(dep2);
  ok = false; await cb2.call(dep2).catch(() => {});
  await cb2.call(dep2).catch(() => {});
  assert(cb2.state === "closed", "2 fails, a success, 2 fails: the success must reset the streak — got state " + cb2.state);
  log("2 fails, success, 2 fails: still closed — the streak reset");

  return "tripped at the threshold, failed fast without touching the dependency, one probe decided the reopen, and only unbroken streaks counted";
});
