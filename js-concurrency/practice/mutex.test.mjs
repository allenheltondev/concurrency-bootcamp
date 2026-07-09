import { suite, sleep } from "./_harness.mjs";
import { Mutex } from "./mutex.mjs";

suite("Mutex — direct handoff, no barging window", async ({ log, assert }) => {
  const m = new Mutex();
  let inside = 0, peak = 0, finished = 0;
  async function job() {
    await m.acquire();
    inside++; peak = Math.max(peak, inside);
    await sleep(5);
    inside--; finished++;
    m.release();
  }
  await Promise.all([job(), job(), job()]);
  log("3 jobs through the critical section, peak occupancy " + peak);
  assert(finished === 3, "all 3 jobs must finish — release() has to wake the queue");
  assert(peak === 1, "two jobs were inside the critical section at once — mutual exclusion broken");

  // Direct handoff: a brand-new acquire() must not barge in during release().
  const m2 = new Mutex();
  await m2.acquire();
  let holders = 0;
  const enter = async () => { await m2.acquire(); holders++; };
  const parked = enter();     // parks on the queue
  m2.release();               // must hand over directly...
  const barger = enter();     // ...so this newcomer must queue, not barge
  void parked; void barger;
  await sleep(10);
  log("release with one waiter parked + an instant barge attempt: " + holders + " holder(s)");
  assert(holders === 1, "the lock looked free for an instant — a barger got in alongside the woken waiter");

  // STRENGTHEN: waiters are handed the lock in FIFO order.
  const m3 = new Mutex();
  await m3.acquire();
  const woke = [];
  const parkers = [1, 2, 3].map((n) => (async () => { await m3.acquire(); woke.push(n); })());
  await sleep(5);
  m3.release(); await sleep(1);   // wakes 1
  m3.release(); await sleep(1);   // wakes 2
  m3.release(); await sleep(1);   // wakes 3
  await Promise.all(parkers);
  log("three parked waiters woke in order: [" + woke.join(", ") + "]");
  assert(woke.join(",") === "1,2,3", "waiters must be handed the lock FIFO — a fair mutex wakes them in arrival order");

  return "mutual exclusion held, direct handoff left no gap for a barger, and waiters woke FIFO";
});
