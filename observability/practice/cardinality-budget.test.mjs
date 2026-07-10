import { suite } from "./_harness.mjs";
import { seriesProduct, SeriesTracker, dropUntilBudget } from "./cardinality-budget.mjs";

suite("cardinality budget — the product, the canonical key, the triage", ({ log, assert }) => {
  assert(seriesProduct({ method: 7, status: 5 }) === 35, "7 x 5 = 35 series");
  assert(seriesProduct({ method: 7, status: 5, path: 40 }) === 1400, "labels multiply, got " + seriesProduct({ method: 7, status: 5, path: 40 }));
  const melted = seriesProduct({ method: 7, status: 5, path: 40, user_id: 10000 });
  log("adding user_id (10k values): " + melted.toLocaleString() + " series");
  assert(melted === 14000000, "one unbounded label multiplies everything, got " + melted);
  assert(seriesProduct({}) === 1, "no labels = exactly one series (the bare metric)");

  const tr = new SeriesTracker();
  assert(tr.observe("http_requests_total", { method: "GET", path: "/a" }) === 1, "first label-set: 1");
  assert(tr.observe("http_requests_total", { path: "/a", method: "GET" }) === 1,
    "the SAME labels in a different key order must NOT mint a new series");
  assert(tr.observe("http_requests_total", { method: "GET", path: "/b" }) === 2,
    "a new label VALUE is a new series");
  assert(tr.observe("http_errors_total", { method: "GET", path: "/a" }) === 3,
    "same labels under a different metric name is a different series");

  const labels = { method: 7, path: 1200, status: 5, user_id: 40000 };
  const r = dropUntilBudget(labels, 10000);
  log("1,680,000,000 series, budget 10,000 -> dropped " + r.dropped.join(" then ") + " -> " + r.series);
  assert(r.dropped.join(",") === "user_id,path",
    "greedy triage sheds the WIDEST label first, got " + r.dropped.join(","));
  assert(r.series === 35, "method x status = 35 remains, got " + r.series);
  assert(labels.user_id === 40000, "triage must not mutate its input");

  const fine = dropUntilBudget({ method: 7, status: 5 }, 10000);
  assert(fine.dropped.length === 0 && fine.series === 35, "under budget drops nothing");
  return "series are a product, identity is canonical, and triage sheds the widest label first";
});
