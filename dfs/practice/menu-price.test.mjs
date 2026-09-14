import { suite } from "./_harness.mjs";
import { getItemPrice, priceEveryItem } from "./menu-price.mjs";

const menu = {
  name: "Lunch", price: 12,
  groups: [
    { name: "Appetizers", price: 6, groups: [], items: [
      { id: "wings", name: "Wings", price: null },
      { id: "fries", name: "Fries", price: 4 } ] },
    { name: "Entrees", price: null, items: [ { id: "burger", name: "Burger", price: null } ], groups: [
      { name: "Salads", price: 8, groups: [], items: [
        { id: "cobb", name: "Cobb Salad", price: 10 },
        { id: "garden", name: "Garden Salad", price: null } ] } ] },
  ],
};

const promo = {
  name: "Happy Hour", price: 9, items: [ { id: "chips", name: "Chips", price: 0 } ],
  groups: [ { name: "Drinks", price: 0, groups: [], items: [
    { id: "water", name: "Water", price: null },
    { id: "soda", name: "Soda", price: 2 } ] } ],
};

suite("inherited prices — closest ancestor wins, and zero is a price", ({ log, assert }) => {
  const want = { wings: 6, fries: 4, burger: 12, cobb: 10, garden: 8 };
  for (const [id, price] of Object.entries(want)) {
    const got = getItemPrice(menu, id);
    log(id.padEnd(7) + "-> " + got);
    assert(got === price, id + " must be " + price + ", got " + got);
  }
  assert(getItemPrice(menu, "sushi") === null, "an unknown item is null — not 0, not undefined");

  assert(getItemPrice(promo, "water") === 0,
    "a declared price of 0 must be inherited, not treated as unset (use ?? not ||), got " + getItemPrice(promo, "water"));
  assert(getItemPrice(promo, "chips") === 0, "an item's own 0 must survive too, got " + getItemPrice(promo, "chips"));
  assert(getItemPrice(promo, "soda") === 2, "an item's own price still beats a 0 ancestor");
  log("free items stayed free — 0 survived resolve, inherit, and return");

  let deep = { name: "L4", items: [ { id: "x", name: "X" } ] };
  for (let i = 3; i >= 0; i--) deep = { name: "L" + i, items: [], groups: [deep] };
  deep.price = 5;
  assert(getItemPrice(deep, "x") === 5,
    "with nothing declared for four levels, the root's price must still reach the bottom, got " + getItemPrice(deep, "x"));

  const map = priceEveryItem(menu);
  assert(map.size === 5, "one entry per item: 5, got " + map.size);
  for (const [id, price] of Object.entries(want))
    assert(map.get(id) === price, "priceEveryItem disagrees with getItemPrice on " + id);
  assert([...map.keys()].join(",") === "wings,fries,burger,cobb,garden",
    "entries must be in DFS order, got " + [...map.keys()].join(","));
  assert(priceEveryItem(promo).get("water") === 0, "and 0 survives the one-pass version too");
  log("priceEveryItem agrees with 5 separate lookups — in one traversal");
  return "resolve, use, pass down: the value travels as a parameter, the answer as a return";
});
