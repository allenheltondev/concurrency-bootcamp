import { suite } from "./_harness.mjs";
import { findMenuItem, findItemPath } from "./menu-find.mjs";

const menu = {
  name: "Lunch",
  groups: [
    { name: "Appetizers", groups: [], items: [
      { id: "wings", name: "Wings" }, { id: "fries", name: "Fries" } ] },
    { name: "Entrees", items: [ { id: "burger", name: "Burger" } ], groups: [
      { name: "Salads", items: [ { id: "cobb", name: "Cobb Salad" } ] } ] },
  ],
};

suite("menu lookup — arbitrary depth, and a path that doesn't drift", ({ log, assert }) => {
  assert(findMenuItem(menu, "wings").name === "Wings", "one level down");
  assert(findMenuItem(menu, "burger").name === "Burger", "a match in the SECOND group must be reachable");
  assert(findMenuItem(menu, "cobb") === menu.groups[1].groups[0].items[0],
    "two levels down, and it must be the item object itself");
  assert(findMenuItem(menu, "sushi") === null, "an id that isn't on the menu returns null");
  assert(findMenuItem({ name: "Empty" }, "wings") === null, "missing items/groups keys must not throw");

  let deep = { name: "L4", items: [ { id: "deep", name: "Deep Dish" } ] };
  for (let i = 3; i >= 0; i--) deep = { name: "L" + i, groups: [deep] };
  assert(findMenuItem(deep, "deep").name === "Deep Dish", "five levels — depth is recursed, not enumerated");
  log("five levels deep -> Deep Dish");

  assert(findItemPath(menu, "wings").join(" > ") === "Lunch > Appetizers > Wings",
    "got " + JSON.stringify(findItemPath(menu, "wings")));
  const cobb = findItemPath(menu, "cobb");
  log("cobb -> " + cobb.join(" > "));
  assert(cobb.join(" > ") === "Lunch > Entrees > Salads > Cobb Salad",
    "the path must not carry the Appetizers branch that failed first, got " + JSON.stringify(cobb));
  assert(findItemPath(menu, "sushi") === null, "no item, no path");

  // call it repeatedly: a shared, unpopped trail shows up as drift
  for (let i = 0; i < 3; i++) {
    assert(findItemPath(menu, "cobb").length === 4, "repeated calls must not grow the path");
    assert(findItemPath(menu, "wings").length === 3, "and neither must the shorter one");
  }
  log("six lookups, no drift between branches or calls");
  return "the trail travels down like any other inherited state — and a dead end must cost nothing";
});
