import { suite } from "./_harness.mjs";
import { LogSampler } from "./log-sampler.mjs";

suite("log sampler — the crowd thinned, the bodies untouched", ({ log, assert }) => {
  const s = new LogSampler(0.01);
  const ids = [];
  for (let i = 0; i < 400; i++) ids.push("trace-" + i);
  for (const id of ids) s.emit({ level: "info", trace_id: id, msg: "ok" });

  const infoKept = s.kept.filter(r => r.level === "info");
  log("400 info records at 1% -> kept " + infoKept.length);
  assert(infoKept.length >= 1 && infoKept.length <= 20,
    "1% sampling must thin the happy path, kept " + infoKept.length);
  assert(infoKept.every(r => r.sample_rate === 100),
    "every kept info record carries its weight: sample_rate = 1/rate = 100");

  const dropped = ids.filter(id => !s.kept.some(r => r.trace_id === id));
  assert(dropped.length > 300, "most of the happy path is dropped");
  for (let i = 0; i < 5; i++) {
    const r = s.emit({ level: "error", trace_id: dropped[i], msg: "boom" });
    assert(r !== null, "an ERROR must be kept even on a trace id the sampler would drop");
  }
  assert(s.kept.filter(r => r.level === "error").length === 5,
    "all 5 errors kept — no dice are ever rolled for errors");

  const s2 = new LogSampler(0.01);
  for (const id of ids) s2.emit({ level: "info", trace_id: id, msg: "ok" });
  assert(s2.kept.length === infoKept.length &&
    s2.kept.every((r, i) => r.trace_id === infoKept[i].trace_id),
    "sampling must be deterministic: same input, same survivors");

  assert(s.emit({ level: "info", trace_id: dropped[0], msg: "x" }) === null,
    "a dropped record returns null");
  return "errors are never negotiable; everything else carries its weight — in that order";
});
