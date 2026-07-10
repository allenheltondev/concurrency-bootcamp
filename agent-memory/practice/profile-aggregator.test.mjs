import { suite } from "./_harness.mjs";
import { AggregateMemory } from "./profile-aggregator.mjs";

suite("profile aggregator — the aggregate evolves as episodes arrive", ({ log, assert }) => {
  const m = new AggregateMemory(3);

  const c1 = m.applyEpisode({ ts: 1, facts: [{ topic: "user", attribute: "drink", value: "coffee" }] });
  assert(Array.isArray(c1) && c1[0] === "learned user|drink", 'first sighting must report "learned", got ' + c1);
  assert(m.get("user", "drink").confidence === 1, "a new belief starts at confidence 1");

  const c2 = m.applyEpisode({ ts: 2, facts: [{ topic: "user", attribute: "drink", value: "coffee" }] });
  assert(c2[0] === "reinforced user|drink", "repetition must reinforce");
  assert(m.get("user", "drink").confidence === 2, "two agreeing episodes -> confidence 2");

  m.applyEpisode({ ts: 3, facts: [{ topic: "user", attribute: "drink", value: "coffee" }] });
  m.applyEpisode({ ts: 4, facts: [{ topic: "user", attribute: "drink", value: "coffee" }] });
  assert(m.get("user", "drink").confidence === 3,
    "confidence must cap at 3, got " + m.get("user", "drink").confidence);
  log("coffee ×4 -> confidence " + m.get("user", "drink").confidence + " (capped)");

  const c5 = m.applyEpisode({ ts: 5, facts: [{ topic: "user", attribute: "drink", value: "tea" }] });
  const f = m.get("user", "drink");
  log('"switched to tea" -> ' + c5[0] + " · now " + f.value + " @ confidence " + f.confidence);
  assert(c5[0] === "revised user|drink", "a contradiction must revise");
  assert(f.value === "tea", "the new value must supersede");
  assert(f.confidence === 1, "a revision starts over at 1, got " + f.confidence);
  assert(f.history.length === 1 && f.history[0].value === "coffee",
    "the superseded belief belongs in history — nothing is lost");

  const c6 = m.applyEpisode({ ts: 6, facts: [
    { topic: "user", attribute: "editor", value: "vim" },
    { topic: "user", attribute: "drink", value: "tea" },
  ] });
  assert(c6.length === 2, "one episode can carry several facts");
  assert(m.get("user", "editor").value === "vim", "new topics are learned alongside reinforcements");
  assert(m.get("user", "drink").confidence === 2, "the revised belief re-earns confidence by repetition");

  const lines = m.render();
  assert(lines[0].includes("tea"), "render() lists the strongest current belief first: " + lines.join(" · "));
  return "learned / reinforced (capped) / revised (reset) — the profile evolved without losing its past";
});
