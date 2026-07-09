import { suite } from "./_harness.mjs";
import { OrderedMerger } from "./ordered-merge.mjs";

suite("Ordered merge — watermark k-way merge", async ({ log, assert }) => {
  const out = [];
  const m = new OrderedMerger(3, (item) => out.push(item.ts));

  // p2 stays silent — an open, empty producer must stall ALL emission.
  m.push(0, { ts: 1 });
  m.push(1, { ts: 2 });
  m.push(0, { ts: 3 });
  assert(out.length === 0, "a silent open producer must stall emission — it might still send a smaller ts");
  log("p0,p1 buffered, p2 silent -> nothing emitted (stalled on the watermark)");

  // p2 finally speaks: heads p0:1, p1:2, p2:5 -> emit 1, then 2, then p1 runs dry (open) -> stall.
  m.push(2, { ts: 5 });
  assert(out.join(",") === "1,2", "emit the global-min heads until an open producer runs dry, then stall (got " + out.join(",") + ")");
  log("p2 spoke -> released 1,2, then stalled on p1 running dry");

  m.push(1, { ts: 4 });   // p1 refilled: heads p0:3, p1:4, p2:5 -> emit 3, then p0 dry (open) -> stall
  assert(out.join(",") === "1,2,3", "p0's head (3) is the next global min");

  m.end(0);               // p0 ended + drained -> no longer gates the watermark
  assert(out.join(",") === "1,2,3,4", "ending a drained producer must stop it blocking the watermark (got " + out.join(",") + ")");
  log("end(p0) released 4");

  m.end(1);
  m.end(2);
  assert(out.join(",") === "1,2,3,4,5", "ending the remaining producers must flush the rest in ts order");
  log("all ended -> flushed the tail: [" + out.join(", ") + "]");

  // STRENGTHEN: ties break toward the lowest producer index.
  const tied = [];
  const m2 = new OrderedMerger(2, (item) => tied.push(item.tag));
  m2.push(0, { ts: 7, tag: "a" });
  m2.push(1, { ts: 7, tag: "b" });
  m2.end(0);
  m2.end(1);
  assert(tied.join(",") === "a,b", "equal ts must break toward the LOWEST producer index (got " + tied.join(",") + ")");
  log("tie at ts=7 broke toward the lower index: [" + tied.join(", ") + "]");

  return "interleaved streams merged in global ts order, a silent producer stalled the flush, ties broke by index";
});
