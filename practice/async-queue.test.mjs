import { suite, sleep } from "./_harness.mjs";
import { AsyncQueue } from "./async-queue.mjs";

suite("Async queue — exactly-once handoff, FIFO", async ({ log, assert }) => {
  const q = new AsyncQueue();
  const first = q.pop();          // consumer arrives before any item
  q.push("a");
  assert(await first === "a", "a parked pop() must be woken by the next push, with the item");
  log('pop-before-push: parked consumer got "a"');

  q.push("b"); q.push("c");       // producer runs ahead
  assert(await q.pop() === "b", "buffered items must come out in FIFO order");
  assert(await q.pop() === "c", "buffered items must come out in FIFO order");
  log("push-before-pop: b, c buffered and served in order");

  const p = q.pop();
  q.push("d");
  assert(await p === "d", "each item must be delivered exactly once");

  const empty = await Promise.race([q.pop(), sleep(15).then(() => "still-waiting")]);
  assert(empty === "still-waiting", "pop() on an empty queue must park, not return");
  log("exactly-once delivery held; empty pop parks");

  // STRENGTHEN: several parked consumers are served FIFO, one item each.
  const q2 = new AsyncQueue();
  const order = [];
  const consumers = [1, 2, 3].map((n) => q2.pop().then((v) => order.push(n + ":" + v)));
  q2.push("x"); q2.push("y"); q2.push("z");
  await Promise.all(consumers);
  log("three parked consumers, three pushes -> " + order.join(", "));
  assert(order.join(",") === "1:x,2:y,3:z", "parked consumers must be woken FIFO and each get exactly one item");

  return "handoff worked both ways, FIFO held, nothing lost or duplicated";
});
