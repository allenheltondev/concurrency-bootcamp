// worker.js — the genuine data race for Concurrency Bootcamp.
//
// Each worker increments a single shared Int32 over a SharedArrayBuffer. All
// workers park on Atomics.wait until the main thread opens the gate, so they
// start hammering the same memory address at the same instant — that's what
// makes the lost-update race show up reliably instead of by luck.
//
// Shared layout (Int32Array over an 8-byte SharedArrayBuffer):
//   view[0] = the contended counter
//   view[1] = start gate (0 = wait, 1 = go)
"use strict";

self.onmessage = (e) => {
  const { buffer, iters, atomic } = e.data;
  const view = new Int32Array(buffer);

  self.postMessage({ ready: true });   // "I'm set up"
  Atomics.wait(view, 1, 0);            // block until main flips the gate to 1

  for (let i = 0; i < iters; i++) {
    if (atomic) {
      Atomics.add(view, 0, 1);         // one indivisible read-modify-write — exact
    } else {
      view[0] = view[0] + 1;           // read, +1, write — three steps that interleave and lose updates
    }
  }

  self.postMessage({ done: true });
};
