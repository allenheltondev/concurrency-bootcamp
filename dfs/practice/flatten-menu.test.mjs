import { suite } from "./_harness.mjs";
import { flattenMenu, cheapestItem } from "./flatten-menu.mjs";

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

suite("flatten — every item, priced and located, in one pass", ({ log, assert }) => {
  const rows = flattenMenu(menu);
  rows.forEach(r => log(r.id.padEnd(7) + "$" + String(r.price).padEnd(3) + r.path.join(" > ")));
  assert(rows.length === 5, "one row per item: 5, got " + rows.length);
  assert(rows.map(r => r.id).join(",") === "wings,fries,burger,cobb,garden",
    "rows must come out in DFS order, got " + rows.map(r => r.id).join(","));
  assert(rows.map(r => r.price).join(",") === "6,4,12,10,8",
    "inheritance must be resolved in the row, got " + rows.map(r => r.price).join(","));
  assert(rows[0].name === "Wings", "rows carry the item's name");
  assert(rows[4].path.join(">") === "Lunch>Entrees>Salads>Garden Salad",
    "full path including the item, got " + rows[4].path.join(">"));
  assert(rows[0].path.join(">") === "Lunch>Appetizers>Wings", "paths must not leak between branches");

  const promo = { name: "HH", price: 9, items: [], groups: [
    { name: "Free", price: 0, groups: [], items: [ { id: "water", name: "Water", price: null } ] } ] };
  assert(flattenMenu(promo)[0].price === 0, "a 0 price must survive into the export");

  assert(flattenMenu({ name: "Empty" }).length === 0, "no items and no groups yields no rows, and must not throw");
  assert(flattenMenu(menu).length === 5, "a second call must start from a fresh accumulator, got " + flattenMenu(menu).length);

  const cheap = cheapestItem(menu);
  assert(cheap.id === "fries", "cheapest is fries at $4, got " + (cheap && cheap.id));
  log("cheapest: " + cheap.name + " $" + cheap.price);
  const tie = cheapestItem({ name: "T", price: 3, groups: [], items: [
    { id: "a", name: "A" }, { id: "b", name: "B" } ] });
  assert(tie.id === "a", "ties go to the first in DFS order, got " + tie.id);
  assert(cheapestItem({ name: "Empty" }) === null, "a menu with no items has no cheapest item");
  return "find-all, path, and price are one traversal with more carried in the frame";
});
