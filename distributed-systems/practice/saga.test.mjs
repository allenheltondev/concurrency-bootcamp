import { suite, sleep } from "./_harness.mjs";
import { Saga } from "./saga.mjs";

suite("Saga — compensate the completed steps in reverse; a failed saga is a result", async ({ log, assert }) => {
  // happy path: every action, in order, no compensation, caller's log appended
  const order = [];
  const extLog = [];
  const happy = await new Saga()
    .step("reserve-flight", async () => { order.push("flight"); }, async () => { order.push("undo-flight"); })
    .step("reserve-hotel",  async () => { order.push("hotel"); },  async () => { order.push("undo-hotel"); })
    .step("charge-card",    async () => { order.push("card"); },   async () => { order.push("undo-card"); })
    .run(extLog);
  log(happy.log.join("  ->  "));
  assert(happy.ok === true, "all steps succeeded — ok must be true");
  assert(happy.log === extLog, "run(log) must append to the CALLER'S array and hand it back");
  assert(happy.log.join("|") === "ok:reserve-flight|ok:reserve-hotel|ok:charge-card", "each completed action logs ok:<name>, in declaration order — got " + happy.log.join("|"));
  assert(order.join("|") === "flight|hotel|card", "actions must run in declaration order, and no compensation may run on success");

  // failure at the third step: undo hotel, then flight — and NOT the card
  let cardUndone = 0;
  const r = await new Saga()
    .step("reserve-flight", async () => {}, async () => {})
    .step("reserve-hotel",  async () => {}, async () => {})
    .step("charge-card",    async () => { throw new Error("card declined"); }, async () => { cardUndone++; })
    .run();
  log(r.log.join("  ->  "));
  assert(r.ok === false, "a failed saga resolves { ok: false } — it must not reject");
  assert(r.log.join("|") === "ok:reserve-flight|ok:reserve-hotel|undo:reserve-hotel|undo:reserve-flight",
    "completed steps must be compensated in REVERSE order (unwind the stack you built) — got " + r.log.join("|"));
  assert(cardUndone === 0, "charge-card never completed — the FAILED step must not be compensated");

  // STRENGTHEN: failure at the FIRST step compensates nothing.
  let undone = 0;
  const r2 = await new Saga()
    .step("charge-card", async () => { throw new Error("declined"); }, async () => { undone++; })
    .step("ship",        async () => {},                              async () => { undone++; })
    .run();
  assert(r2.ok === false && r2.log.length === 0 && undone === 0,
    "nothing completed, so nothing gets undone and the log stays empty — got ok:" + r2.ok + ", log [" + r2.log.join(",") + "], " + undone + " compensation(s)");
  log("first step failed: 0 compensations, empty log");

  // STRENGTHEN: async actions and compensations — awaited one at a time, still
  // strictly in order, still unwound in reverse.
  const seq = [];
  const r3 = await new Saga()
    .step("a", async () => { await sleep(2); seq.push("a"); }, async () => { await sleep(1); seq.push("undo-a"); })
    .step("b", async () => { await sleep(1); seq.push("b"); }, async () => { seq.push("undo-b"); })
    .step("c", async () => { seq.push("boom"); throw new Error("c failed"); }, async () => { seq.push("undo-c"); })
    .run();
  log("async saga: " + seq.join(" -> "));
  assert(r3.ok === false, "the async saga failed at c — ok must be false");
  assert(seq.join("|") === "a|b|boom|undo-b|undo-a",
    "each async action (and compensation) must be awaited before the next — got " + seq.join("|"));

  return "actions ran in order, compensations unwound the completed prefix newest-first, and the failed step was left alone";
});
