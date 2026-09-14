import { suite } from "./_harness.mjs";
import { preorderIterative, priceIterative } from "./iterative-dfs.mjs";

const tree = { name: "root", children: [
  { name: "A", children: [ { name: "A1", children: [] }, { name: "A2", children: [] } ] },
  { name: "B", children: [ { name: "B1", children: [] } ] },
] };

const menu = {
  name: "Lunch", price: 12,
  groups: [
    { name: "Appetizers", price: 6, groups: [], items: [
      { id: "wings", name: "Wings", price: null }, { id: "fries", name: "Fries", price: 4 } ] },
    { name: "Entrees", price: null, items: [ { id: "burger", name: "Burger", price: null } ], groups: [
      { name: "Salads", price: 8, groups: [], items: [
        { id: "cobb", name: "Cobb Salad", price: 10 },
        { id: "garden", name: "Garden Salad", price: null } ] } ] },
  ],
};

suite("explicit stack — same order, no frames", ({ log, assert }) => {
  const got = preorderIterative(tree);
  log("iterative: " + got.join(" -> "));
  assert(got.join(",") === "root,A,A1,A2,B,B1",
    "must match the recursive order exactly (push children REVERSED), got " + got.join(","));
  assert(preorderIterative({ name: "only", children: [] }).join(",") === "only", "a lone root returns itself");
  const wide = { name: "w", children: [1,2,3,4,5].map(i => ({ name: "c" + i, children: [] })) };
  assert(preorderIterative(wide).join(",") === "w,c1,c2,c3,c4,c5", "wide nodes keep left-to-right order");

  let chain = { name: "leaf", children: [] };
  for (let i = 0; i < 50000; i++) chain = { name: "n" + i, children: [chain] };
  const deep = preorderIterative(chain);
  assert(deep.length === 50001, "a 50k-deep chain must not overflow, got " + deep.length);
  assert(deep[0] === "n49999" && deep[deep.length - 1] === "leaf", "and it must still be in order");
  log("50,001 nodes deep — no RangeError (the recursion dies around 10k)");

  const want = { wings: 6, fries: 4, burger: 12, cobb: 10, garden: 8 };
  for (const [id, price] of Object.entries(want))
    assert(priceIterative(menu, id) === price,
      id + " must be " + price + " iteratively too, got " + priceIterative(menu, id));
  assert(priceIterative(menu, "sushi") === null, "an unknown item is still null");
  const promo = { name: "HH", price: 9, items: [], groups: [
    { name: "Free", price: 0, groups: [], items: [ { id: "water", name: "Water", price: null } ] } ] };
  assert(priceIterative(promo, "water") === 0, "0 must survive being pushed onto the stack too");
  log("inherited prices identical to the recursive version — carried on the stack by hand");
  return "the call stack was storing your locals for free; going iterative means pushing them yourself";
});
