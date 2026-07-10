import { suite } from "./_harness.mjs";
import { SessionBuffer, approxTokens } from "./session-buffer.mjs";

suite("session buffer — budget held, pins immortal, oldest-unpinned first", ({ log, assert }) => {
  const b = new SessionBuffer(40);
  b.push("system", "You are a support agent. Be brief.", true);
  b.push("user", "My name is Priya, please use it in replies.");
  b.push("user", "My order number is 88231, keep it handy too.");
  assert(b.tokens() <= 40, "buffer must stay within budget, at " + b.tokens());
  assert(b.msgs.length === 3, "nothing should be evicted while under budget");

  b.push("user", "Now check the shipping status for that order.");
  log("4 pushes against a 40-token budget -> " + b.msgs.length + " kept, " + b.tokens() + " tokens");
  assert(b.tokens() <= 40, "buffer exceeded its budget after the 4th push: " + b.tokens());
  assert(b.msgs[0].role === "system" && b.msgs[0].pin === true,
    "the pinned system prompt must survive every trim");
  assert(!b.msgs.some((m) => m.text.includes("Priya")),
    "the OLDEST unpinned turn must be evicted first");
  assert(b.msgs.some((m) => m.text.includes("shipping")),
    "the newest turn must never be the victim");

  const big = "x".repeat(200);   // 50 tokens — over budget on its own
  b.push("user", big);
  log("an oversized (" + approxTokens(big) + "-token) turn arrives");
  assert(b.tokens() <= 40, "one eviction is not always enough — keep evicting until the budget holds");
  assert(b.msgs.some((m) => m.pin), "pinned messages survive even the oversized-turn stampede");

  const only = new SessionBuffer(4);
  only.push("system", "You are terse but thorough.", true);   // 7 tokens > budget
  assert(only.msgs.length === 1, "when only pinned content remains, stop trimming — never evict the pin");
  return "budget held through every push, pins never left, oldest unpinned went first";
});
