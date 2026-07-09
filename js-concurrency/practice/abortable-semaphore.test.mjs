import { suite, sleep } from "./_harness.mjs";
import { Semaphore } from "./abortable-semaphore.mjs";

suite("Abortable semaphore — abort a waiter, no permit leak", async ({ log, assert }) => {
  const s = new Semaphore(1);
  await s.acquire();               // take the only permit

  const ac = new AbortController();
  let w1 = "pending", w2 = "pending";
  const p1 = s.acquire(ac.signal).then(() => (w1 = "acquired"), (e) => (w1 = "rejected:" + (e && e.message)));
  const p2 = s.acquire().then(() => (w2 = "acquired"));

  ac.abort(new Error("gone"));     // abort the FIRST waiter while it's parked
  await p1.catch(() => {});
  assert(w1.startsWith("rejected"), "an aborted waiter must reject, not stay parked (state = " + w1 + ")");
  assert(w1 === "rejected:gone", "the rejection must carry the signal's reason (state = " + w1 + ")");
  log("first waiter aborted -> " + w1);

  s.release();                     // freed permit must go to the NEXT live waiter (w2)
  await p2;
  assert(w2 === "acquired", "the freed permit must go to the next LIVE waiter, not the aborted one (state = " + w2 + ")");
  log("release handed the permit to the live waiter, not the aborted one");

  // Permit conservation: w2 holds the only permit, so a fresh acquire must park.
  const parked = await Promise.race([s.acquire(), sleep(20).then(() => "parked")]);
  assert(parked === "parked", "permit count leaked — someone acquired when none was free");
  log("no permit leak: a new acquire correctly parks");

  // Already-aborted signal rejects immediately without queueing.
  const pre = AbortSignal.abort(new Error("already"));
  let immediate = false;
  try { await s.acquire(pre); } catch (e) { immediate = e && e.message === "already"; }
  assert(immediate, "an already-aborted signal must reject immediately with its reason");
  log("already-aborted signal rejected immediately, never queued");

  return "aborted waiter rejected and freed its slot, the permit went to the next live waiter, count conserved";
});
