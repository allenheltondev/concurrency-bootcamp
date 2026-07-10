import { suite } from "./_harness.mjs";
import { FactStore } from "./fact-store.mjs";

suite("fact store — one key, one current truth, history preserved", ({ log, assert }) => {
  const s = new FactStore();
  assert(s.get("user", "city") === null, "unknown facts answer null, not undefined behavior");

  assert(s.upsert("user", "city", "Austin", 1000) === "added", 'first write must return "added"');
  assert(s.upsert("user", "city", "Austin", 2000) === "confirmed", 'same value again must return "confirmed"');
  assert(s.record("user", "city").confirmations === 2, "confirmation must bump the streak");

  const r = s.upsert("user", "city", "Denver", 3000);
  log('"Austin" ×2, then "Denver" -> ' + r);
  assert(r === "superseded", 'a different value must return "superseded", got ' + r);
  assert(s.get("user", "city") === "Denver", "the key must answer with the NEW value");
  assert(s.facts.size === 1, "one question, one record — the store holds " + s.facts.size);

  const rec = s.record("user", "city");
  assert(rec.confirmations === 1, "a revised fact must NOT inherit the old streak, got " + rec.confirmations);
  assert(rec.history.length === 1, "the old value belongs in history");
  assert(rec.history[0].value === "Austin" && rec.history[0].ts === 2000,
    "history must preserve the superseded {value, ts}");

  assert(s.upsert("user", "team", "platform", 4000) === "added", "a different attribute is a different fact");
  assert(s.get("user", "team") === "platform" && s.get("user", "city") === "Denver",
    "facts must not clobber each other");

  s.upsert("user", "city", "Denver", 5000);
  assert(s.record("user", "city").confirmations === 2, "the revised belief re-earns confirmations by repetition");
  return "added / confirmed / superseded — contradictions resolved at write time, with an audit trail";
});
