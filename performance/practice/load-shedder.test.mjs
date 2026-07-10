import { suite } from "./_harness.mjs";
import { DeadlineShedder } from "./load-shedder.mjs";

suite("deadline shedder — a fast no beats a slow nothing", ({ log, assert }) => {
  const s = new DeadlineShedder(10);
  assert(s.offer(0, 100) === "admitted", "empty queue, 100ms budget: admit");
  s.done();
  assert(s.queued === 0, "done() must free the slot, got " + s.queued);

  for (let i = 0; i < 5; i++)
    assert(s.offer(0, 50) === "admitted", "request " + i + " projects to finish inside 50ms");
  assert(s.queued === 5, "five admitted requests occupy the queue, got " + s.queued);
  assert(s.offer(0, 50) === "shed", "the 6th would finish at 60ms > 50: shed");
  assert(s.queued === 5, "a SHED request must not occupy the queue, got " + s.queued);
  log("5 admitted (each can still make it), 6th shed instantly and free");

  s.done();
  assert(s.offer(0, 50) === "admitted", "a completion frees a slot the next request can use");

  const s2 = new DeadlineShedder(10);
  assert(s2.offer(100, 90) === "shed", "already expired: shed even with an empty queue");
  assert(s2.offer(100, 110) === "admitted", "10ms of service fits a 10ms budget exactly");
  assert(s2.offer(100, 115) === "shed", "behind one queued request, 15ms budget can't fit 20ms");
  log("the verdict comes from projected finish vs deadline — never queue length alone");
  return "everything admitted could still succeed; overload became fast errors, not slow ones";
});
