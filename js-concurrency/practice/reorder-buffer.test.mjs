import { suite } from "./_harness.mjs";
import { Reorderer } from "./reorder-buffer.mjs";

suite("Reorder buffer — hold and release the prefix", async ({ log, assert }) => {
  const out = [];
  const r = new Reorderer((x) => out.push(x));

  r.push(2, "c");   // arrives first, but 0 and 1 are missing -> hold
  assert(out.length === 0, "seq 2 arriving before 0,1 must be held, not emitted");
  log("seq 2 arrived early -> held");

  r.push(0, "a");   // emits a, then 1 is still missing -> stop
  assert(out.join(",") === "a", "emitting 0 must not release the held 2 while 1 is still missing (got " + out.join(",") + ")");
  log("seq 0 arrived -> emitted a, 2 stays held behind the gap at 1");

  r.push(1, "b");   // gap-filler: releases 1, then the held 2 -> a,b,c
  assert(out.join(",") === "a,b,c", "a late gap-filler must release everything held behind it (got " + out.join(",") + ")");
  log("seq 1 filled the gap -> released b and the held c in order");

  // STRENGTHEN: a longer held run releases in one flush when its filler lands.
  const out2 = [];
  const r2 = new Reorderer((x) => out2.push(x));
  r2.push(3, "d"); r2.push(1, "b"); r2.push(2, "c");
  assert(out2.length === 0, "with seq 0 missing, everything must stay held");
  r2.push(0, "a");
  assert(out2.join(",") === "a,b,c,d", "filling seq 0 must release the whole contiguous run 0..3 (got " + out2.join(",") + ")");
  log("held 1,2,3 all released the instant 0 arrived: [" + out2.join(", ") + "]");

  return "out-of-order arrivals held, contiguous prefix released in seq order, one filler drained the run";
});
