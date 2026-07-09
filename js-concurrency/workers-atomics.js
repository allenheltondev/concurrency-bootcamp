// workers-atomics.js — the genuine data race, in Node (worker_threads).
//
// This is the logic reference for the browser's worker.js: same shared Int32Array,
// same two modes, same Atomics.wait gate so every thread starts together. Run it on
// a laptop to SEE plain increments lose updates across threads while Atomics.add
// stays exact — and to see the lost count vary run to run.
//
//   node workers-atomics.js [threads] [millionsPerThread]
//   node workers-atomics.js 4 5      # 4 threads, 5,000,000 increments each
"use strict";

const { Worker, isMainThread, workerData, parentPort } = require("node:worker_threads");

// Shared layout (Int32Array over an 8-byte SharedArrayBuffer):
//   view[0] = the contended counter
//   view[1] = start gate (0 = wait, 1 = go)

if (!isMainThread) {
  const { buffer, iters, atomic } = workerData;
  const view = new Int32Array(buffer);

  parentPort.postMessage({ ready: true });   // "I'm set up"
  Atomics.wait(view, 1, 0);                   // block until main flips the gate to 1

  for (let i = 0; i < iters; i++) {
    if (atomic) {
      Atomics.add(view, 0, 1);                // one indivisible read-modify-write — exact
    } else {
      view[0] = view[0] + 1;                  // read, +1, write — interleaves and loses updates
    }
  }

  parentPort.postMessage({ done: true });
  return;
}

function race({ threads, iters, atomic }) {
  return new Promise((resolve) => {
    const sab = new SharedArrayBuffer(8);
    const view = new Int32Array(sab);
    const workers = [];
    let ready = 0, done = 0;
    for (let i = 0; i < threads; i++) {
      const w = new Worker(__filename, { workerData: { buffer: sab, iters, atomic } });
      w.on("message", (m) => {
        if (m.ready) {
          if (++ready === threads) { Atomics.store(view, 1, 1); Atomics.notify(view, 1); } // open the gate for all at once
        } else if (m.done) {
          if (++done === threads) {
            workers.forEach((x) => x.terminate());
            resolve({ mem: Atomics.load(view, 0), expected: threads * iters });
          }
        }
      });
      workers.push(w);
    }
  });
}

(async () => {
  const threads = Number(process.argv[2]) || 4;
  const iters = (Number(process.argv[3]) || 5) * 1_000_000;
  const f = (n) => n.toLocaleString("en-US");
  console.log(`data race: ${threads} threads × ${f(iters)} increments each\n`);
  for (const atomic of [false, true]) {
    const { mem, expected } = await race({ threads, iters, atomic });
    const lost = expected - mem;
    const tag = atomic ? "Atomics.add(v,0,1)" : "v[0] = v[0] + 1   ";
    const verdict = lost === 0 ? "exact ✓" : `${f(lost)} updates lost ✗`;
    console.log(`  ${tag} | counter=${f(mem)}  expected=${f(expected)}  ${verdict}`);
  }
})();
