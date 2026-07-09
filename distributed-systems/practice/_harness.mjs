/* Concurrency Bootcamp — practice pack test harness.
   A tiny, dependency-free runner in the style of the app's in-page console.

   Exports:
     sleep(ms)                 -> Promise that resolves after ms
     deferred()                -> { promise, resolve, reject }
     suite(title, fn)          -> runs fn({ log, assert }); prints ✓ PASS / ✗ FAIL

   A suite:
     - prints each log(t) line as it happens
     - prints "✓ PASS — <verdict>" (green) when fn returns, using fn's return
       value as the verdict, or a default
     - prints "✗ FAIL — <message>" (red) on the first failed assert, thrown
       error, or an unimplemented skeleton — cleanly, no stack-trace mess
     - fails a suite that hangs past 5s with a deadlock message
     - forces a deterministic exit code (0 pass, 1 fail) even when a lingering
       timer/interval would otherwise keep the process alive
*/
"use strict";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const G = "\x1b[32m", R = "\x1b[31m", DIM = "\x1b[2m", RST = "\x1b[0m";
const TIMEOUT_MS = 5000;

class AssertionError extends Error { constructor(m) { super(m); this.name = "AssertionError"; } }
class DeadlockError extends Error { constructor(m) { super(m); this.name = "DeadlockError"; } }

function formatError(err) {
  if (!err) return "unknown failure";
  const msg = err.message || String(err);
  if (/implement me/i.test(msg)) {
    return 'not implemented yet — this skeleton still throws "implement me". ' +
           "Fill in the body until the test goes green.";
  }
  if (err instanceof AssertionError) return msg;
  if (err instanceof DeadlockError) return msg;
  return `${err.name || "Error"}: ${msg}`;
}

let settled = false;

function finish(code, line) {
  if (settled) return;
  settled = true;
  console.log(line);
  process.exitCode = code;
  // Flush stdout, then hard-exit so a stray setInterval (e.g. a token bucket)
  // or a parked waiter can't keep the process alive with a wrong exit status.
  process.stdout.write("", () => process.exit(code));
}

// Safety net: a background promise a broken skeleton left rejected should fold
// into a single clean failure, never Node's unhandled-rejection noise.
process.on("unhandledRejection", (reason) => {
  finish(1, `${R}✗ FAIL — ${formatError(reason)}${RST}`);
});

export function suite(title, fn) {
  console.log(`${DIM}▶ ${title}${RST}`);
  const log = (t) => console.log(`  ${t}`);
  const assert = (cond, msg) => { if (!cond) throw new AssertionError(msg); };

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlockError(
        "a suite await never resolved within 5s — that's a deadlock " +
        "(a waiter parked with nobody left to wake it).")),
      TIMEOUT_MS,
    );
  });

  const run = Promise.resolve()
    .then(() => fn({ log, assert }))
    .then(
      (verdict) => {
        clearTimeout(timer);
        finish(0, `${G}✓ PASS — ${verdict || "all assertions held"}${RST}`);
      },
      (err) => {
        clearTimeout(timer);
        finish(1, `${R}✗ FAIL — ${formatError(err)}${RST}`);
      },
    );

  // Whichever settles first wins; the timeout only matters if `run` hangs.
  return Promise.race([run, timeout]).catch((err) => {
    clearTimeout(timer);
    finish(1, `${R}✗ FAIL — ${formatError(err)}${RST}`);
  });
}
