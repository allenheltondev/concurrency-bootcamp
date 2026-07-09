import { suite } from "./_harness.mjs";
import { fnv1a, HashRing } from "./hash-ring.mjs";

suite("Hash ring — remove a node, move only its arc", async ({ log, assert }) => {
  // fnv1a is a fixed algorithm — these are its published 32-bit test vectors.
  assert(fnv1a("") === 2166136261, "the empty string is the FNV offset basis 2166136261 — got " + fnv1a(""));
  assert(fnv1a("a") === 3826002220, 'fnv1a("a") must be 3826002220 — check the xor-then-multiply order and the unsigned >>> 0');
  assert(fnv1a("node-1#0") === fnv1a("node-1#0"), "same input, same hash — always");
  log("fnv1a matches the published 32-bit test vectors");

  const keys = Array.from({ length: 100 }, (_, i) => "item-" + i);
  const ring = new HashRing(["n1", "n2", "n3", "n4"]);
  const before = new Map(keys.map((k) => [k, ring.owner(k)]));
  assert(keys.every((k) => ring.owner(k) === before.get(k)), "ownership must be deterministic — the same key asked twice came back different");
  const spread = new Set(before.values());
  log("100 keys spread across " + spread.size + " nodes");
  assert(spread.size === 4, "with 8 vnodes each, every node should own some keys — only " + spread.size + " of 4 did");

  ring.remove("n3");
  const moved = keys.filter((k) => ring.owner(k) !== before.get(k));
  log("n3 removed: " + moved.length + "/100 keys moved");
  assert(moved.length > 0, "n3 owned keys — removing it must reassign them somewhere");
  assert(moved.length < 50, "only a minority may move (~1/N): " + moved.length + "/100 reshuffled — that's mod-N behavior, not a ring");
  assert(moved.every((k) => before.get(k) === "n3"), "a key that did NOT belong to n3 moved — removal must reassign only the lost node's arc");
  assert(keys.every((k) => ring.owner(k) !== "n3"), "n3 is gone — no key may still map to it");

  // STRENGTHEN: adding the node back restores the ORIGINAL mapping exactly —
  // its vnode points hash to exactly the same places on the ring.
  ring.add("n3");
  const restored = keys.filter((k) => ring.owner(k) === before.get(k)).length;
  log("n3 re-added: " + restored + "/100 keys back with their original owner");
  assert(restored === 100, "every key must return to its original owner — " + (100 - restored) + " didn't");

  // STRENGTHEN: wrap-around — a key hashing past the highest point takes the
  // ring's FIRST point, it doesn't fall off the end.
  const solo = new HashRing(["solo"]);
  const top = Math.max(...Array.from({ length: 8 }, (_, i) => fnv1a("solo#" + i)));
  let wrapKey = null;
  for (let i = 0; i < 100000 && !wrapKey; i++) if (fnv1a("wrap-" + i) > top) wrapKey = "wrap-" + i;
  assert(wrapKey, "test setup: no key found hashing past the highest point");
  assert(solo.owner(wrapKey) === "solo", '"' + wrapKey + '" hashes past every point — it must wrap to the ring\'s first point, got ' + solo.owner(wrapKey));
  log('"' + wrapKey + '" hashes past the top of the ring and wraps to solo');

  return "ownership was deterministic, removal moved only the lost node's arc, re-adding restored the mapping exactly, and the ring wrapped";
});
