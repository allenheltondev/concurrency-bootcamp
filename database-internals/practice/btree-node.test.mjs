import { suite } from "./_harness.mjs";
import { search, insert } from "./btree-node.mjs";

const sorted = (keys) => keys.every((k, i) => i === 0 || keys[i - 1] < k);

suite("B-tree node — always sorted, split loses nothing, sep routes right", ({ log, assert }) => {
  const node = { keys: [] };
  const order = 4;

  // Inserts at both extremes and in the middle — sorted at every return.
  for (const k of [50, 20, 70, 10]) {
    assert(insert(node, k, order) === null, "no split may happen while length <= order (order " + order + ")");
    assert(sorted(node.keys), "keys must be sorted ascending after EVERY insert, got [" + node.keys + "]");
  }
  assert(node.keys.join(",") === "10,20,50,70",
    "inserts at the extremes must land at the ends, not where push() left them: [" + node.keys + "]");

  assert(search(node, 50) === 2, "search must return the index of a present key (50 lives at index 2)");
  assert(search(node, 33) === -1, "search must return -1 for an absent key — not undefined, not the insert point");

  assert(insert(node, 20, order) === null && node.keys.length === 4,
    "a duplicate insert must change NOTHING and return null — one key, one slot");

  // The 5th key overflows a node of order 4 -> split. mid = ceil(5/2) = 3.
  const res = insert(node, 5, order);
  log("insert 5 into [10,20,50,70] (order 4) -> left [" + node.keys + "], sep " +
    (res && res.sep) + ", right [" + (res && res.right.keys) + "]");
  assert(res !== null, "exceeding the order must SPLIT — returning null here loses the overflow");
  assert(node.keys.join(",") === "5,10,20",
    "mid = Math.ceil(5/2) = 3: the LEFT node keeps the first 3 keys (odd counts favor the left), got [" + node.keys + "]");
  assert(res.right.keys.join(",") === "50,70",
    "the right sibling takes keys[mid..], got [" + res.right.keys + "]");
  assert(res.sep === 50,
    "sep must equal the RIGHT node's smallest key — a parent routing k >= sep right must find " +
    "every moved key; sep " + res.sep + " would strand key 50");
  assert(sorted(node.keys) && sorted(res.right.keys), "both halves must be sorted after the split");

  // No key lost or duplicated across the halves.
  const all = [...node.keys, ...res.right.keys].sort((a, b) => a - b);
  assert(all.join(",") === "5,10,20,50,70",
    "the split lost or duplicated a key: the two halves hold [" + all + "]");
  for (const k of res.right.keys) {
    assert(k >= res.sep, "key " + k + " sits in the right node but k >= sep would not route there");
    assert(search(res.right, k) !== -1, "key " + k + " must be findable in the right node after the split");
  }
  for (const k of node.keys) {
    assert(k < res.sep, "key " + k + " sits in the left node but k >= sep routes it right — it is unreachable");
  }

  // A split at the HIGH extreme, and an even count: 4 keys + 1 = 5, same math.
  const n2 = { keys: [] };
  for (const k of [1, 2, 3, 4]) insert(n2, k, order);
  const res2 = insert(n2, 99, order);   // new largest key triggers the split
  assert(res2 !== null && n2.keys.join(",") === "1,2,3" && res2.right.keys.join(",") === "4,99",
    "a split triggered by a new LARGEST key follows the same mid rule: left [1,2,3], right [4,99]");
  assert(res2.sep === 4, "sep must be the right node's smallest key (4), got " + res2.sep);

  return "sorted at every return, split halves clean, sep = right's smallest — no key lost, none duplicated";
});
