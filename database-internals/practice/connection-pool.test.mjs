import { suite, sleep } from "./_harness.mjs";
import { Pool } from "./connection-pool.mjs";

suite("connection pool — size is a hard cap, FIFO service, hand-off before idle", async ({ log, assert }) => {
  const pool = new Pool(2);
  assert(pool.stats().idle === 2 && pool.stats().inUse === 0 && pool.stats().waiting === 0,
    "a fresh pool is all idle: " + JSON.stringify(pool.stats()));

  const c1 = await pool.acquire();
  const c2 = await pool.acquire();
  assert(c1 !== c2, "two acquires must dispense two DIFFERENT connections");
  assert(pool.stats().idle === 0 && pool.stats().inUse === 2,
    "both connections out: stats must say so, got " + JSON.stringify(pool.stats()));

  // The pool is dry — the next two callers park FIFO.
  const order = [];
  const w3 = pool.acquire().then((c) => { order.push("w3:" + c); return c; });
  const w4 = pool.acquire().then((c) => { order.push("w4:" + c); return c; });
  await sleep(0);
  assert(order.length === 0, "an empty pool must QUEUE acquirers, never mint connection #" + (pool.size + 1));
  assert(pool.stats().waiting === 2, "two parked acquirers must show as waiting, got " + JSON.stringify(pool.stats()));

  pool.release(c1);
  assert(pool.idle.length === 0,
    "a released connection must reach the oldest waiter DIRECTLY — it landed in idle, where a " +
    "newcomer could steal it past the queue");
  const got3 = await w3;
  assert(got3 === c1, "the oldest waiter must receive the exact released connection, got " + got3);
  assert(order.join(",") === "w3:" + c1, "FIFO: the FIRST waiter is served first, got [" + order + "]");

  pool.release(c2);
  const got4 = await w4;
  assert(got4 === c2 && order.join(",") === "w3:" + c1 + ",w4:" + c2,
    "waiters are served strictly in arrival order, got [" + order + "]");

  // Release with no waiters: back to idle, stats exact.
  pool.release(got3);
  pool.release(got4);
  assert(pool.stats().idle === 2 && pool.stats().inUse === 0 && pool.stats().waiting === 0,
    "with no waiters a release returns the connection to idle — stats drifted: " + JSON.stringify(pool.stats()));

  // The storm: 8 jobs over 2 connections — the cap holds and the books balance.
  let inFlight = 0, peak = 0, done = 0;
  const job = async () => {
    const c = await pool.acquire();
    inFlight++; peak = Math.max(peak, inFlight);
    await sleep(2);
    inFlight--; done++;
    pool.release(c);
  };
  await Promise.all(Array.from({ length: 8 }, job));
  log("8 jobs through a pool of 2 -> peak concurrency " + peak + ", " + done + " completed");
  assert(done === 8, "every job must eventually be served — a dropped waiter starves forever");
  assert(peak <= 2,
    "more connections in flight (" + peak + ") than the pool owns (2) — the cap is the whole point: " +
    "the database pays for every extra backend");
  const s = pool.stats();
  assert(s.idle === 2 && s.inUse === 0 && s.waiting === 0,
    "after the storm the books must balance exactly: " + JSON.stringify(s));

  return "cap held at " + peak + "/2 through an 8-job storm, FIFO service, hand-off before idle, stats exact";
});
