import { suite } from "./_harness.mjs";
import { MenuIndex } from "./menu-index.mjs";

const makeMenu = () => ({
  name: "Lunch", price: 12,
  groups: [
    { name: "Appetizers", price: 6, groups: [], items: [
      { id: "wings", name: "Wings", price: null }, { id: "fries", name: "Fries", price: 4 } ] },
    { name: "Entrees", price: null, items: [ { id: "burger", name: "Burger", price: null } ], groups: [
      { name: "Salads", price: 8, groups: [], items: [
        { id: "cobb", name: "Cobb Salad", price: 10 },
        { id: "garden", name: "Garden Salad", price: null } ] } ] },
  ],
});

suite("menu index — one traversal, then O(1) forever (until the menu changes)", ({ log, assert }) => {
  const menu = makeMenu();
  const idx = new MenuIndex(menu);
  assert(idx.walks === 1, "construction must traverse exactly once, got " + idx.walks);

  const want = { wings: 6, fries: 4, burger: 12, cobb: 10, garden: 8 };
  for (const [id, price] of Object.entries(want))
    assert(idx.price(id) === price, id + " must be " + price + ", got " + idx.price(id));
  assert(idx.walks === 1, "lookups must NOT traverse the menu — walks is still 1, got " + idx.walks);
  log("5 lookups, " + idx.walks + " traversal — that's the whole trade");

  const row = idx.get("garden");
  assert(row.name === "Garden Salad" && row.price === 8, "rows carry the resolved price");
  assert(row.path.join(">") === "Lunch>Entrees>Salads>Garden Salad", "and the full path, got " + row.path.join(">"));
  assert(idx.get("sushi") === null, "an unknown id is null from get()");
  assert(idx.price("sushi") === null, "and null from price() — never undefined");

  // 1000 lookups still cost one traversal
  for (let i = 0; i < 1000; i++) idx.price("cobb");
  assert(idx.walks === 1, "a thousand lookups, still one traversal, got " + idx.walks);

  // the cost of caching: the index is stale until someone rebuilds it
  menu.groups[0].price = 3;
  assert(idx.price("wings") === 6, "before rebuild the index must still answer from its snapshot");
  idx.rebuild();
  assert(idx.walks === 2, "rebuild traverses once more, got " + idx.walks);
  assert(idx.price("wings") === 3, "after rebuild the new price must show, got " + idx.price("wings"));
  log("edited the menu -> stale until rebuild(), fresh after — that's who owns invalidation");

  const zero = new MenuIndex({ name: "HH", price: 9, items: [], groups: [
    { name: "Free", price: 0, groups: [], items: [ { id: "water", name: "Water", price: null } ] } ] });
  assert(zero.price("water") === 0, "a 0 price must survive into the index, got " + zero.price("water"));

  const dupes = new MenuIndex({ name: "D", price: 1, groups: [
    { name: "First", price: 2, groups: [], items: [ { id: "x", name: "First X" } ] },
    { name: "Second", price: 3, groups: [], items: [ { id: "x", name: "Second X" } ] } ] });
  assert(dupes.get("x").name === "First X", "duplicate ids keep the FIRST in DFS order, got " + dupes.get("x").name);
  return "O(n + k) instead of O(k*n) — and the bill is invalidation, not the build";
});
