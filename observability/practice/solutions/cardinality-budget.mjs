/* Cardinality budget — reference solution. */
"use strict";

export function seriesProduct(labelCards) {
  return Object.values(labelCards).reduce((a, b) => a * b, 1);
}

export class SeriesTracker {
  constructor() {
    this.seen = new Set();
  }

  observe(name, labels) {
    const key = name + "{" + Object.keys(labels).sort()
      .map(k => k + "=" + labels[k]).join(",") + "}";
    this.seen.add(key);
    return this.seen.size;
  }
}

export function dropUntilBudget(labelCards, budget) {
  const cards = { ...labelCards };            // never mutate the input
  const dropped = [];
  while (seriesProduct(cards) > budget && Object.keys(cards).length) {
    const worst = Object.keys(cards).reduce((a, b) => cards[b] > cards[a] ? b : a);
    dropped.push(worst);
    delete cards[worst];
  }
  return { dropped, series: seriesProduct(cards) };
}
