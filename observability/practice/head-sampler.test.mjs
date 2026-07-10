import { suite } from "./_harness.mjs";
import { HeadSampler } from "./head-sampler.mjs";

suite("head sampler — every service reaches the same verdict, alone", ({ log, assert }) => {
  const s = new HeadSampler(0.25);
  const ids = [];
  for (let i = 0; i < 400; i++) ids.push("trace-" + i);
  const kept = ids.filter(id => s.keep(id)).length;
  log("rate 0.25 over 400 trace ids -> kept " + kept);
  assert(kept > 60 && kept < 140, "kept fraction must be near 25%, got " + kept + "/400");

  for (const id of ids.slice(0, 50))
    assert(s.keep(id) === s.keep(id), "the same trace id must ALWAYS get the same verdict");

  const s2 = new HeadSampler(0.25);
  assert(ids.every(id => s.keep(id) === s2.keep(id)),
    "two independent samplers (two services) must agree on every trace — no fragments");

  assert(ids.every(id => !new HeadSampler(0).keep(id)), "rate 0 keeps nothing");
  assert(ids.every(id => new HeadSampler(1).keep(id)), "rate 1 keeps everything");

  const half = new HeadSampler(0.5);
  const verdicts = ids.map(id => half.keep(id));
  assert(verdicts.some(v => v) && verdicts.some(v => !v), "rate 0.5 must split the population");
  return "a pure function of the trace id — whole traces or nothing, with zero coordination";
});
