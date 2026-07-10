"use strict";
/* Observability Bootcamp — content pack: the rest of spot-the-bug (5 cards)
   and write-it (7 exercises). Loaded after the lesson packs, before the
   engine. Everything appends into BUGHUNT / WRITE; lesson back-links
   reference the final lesson indices (see the LESSON PLAN in content.js). */
(function () {

  /* =========================================================
     SPOT THE BUG
     ========================================================= */
  BUGHUNT.push(
  { id:"bug_tailbuffer", title:"Tail-sampling buffer", why:"the oldest open trace IS the slow trace you promised to keep", lesson:13,
    scenario:"Tail sampling was sold to the team as 'we keep 100% of slow traces.' In production, the slowest requests are exactly the ones missing from the store — and the miss rate climbs with traffic. Fast errors are kept fine. Which line(s) throw away the merchandise?",
    lines:[
      "class TailBuffer {",
      "  constructor(max, slowMs) {",
      "    this.max = max;        // open traces held in memory",
      "    this.slowMs = slowMs;",
      "    this.open = new Map();",
      "  }",
      "",
      "  start(traceId) {",
      "    if (this.open.size >= this.max) {",
      "      const oldest = this.open.keys().next().value;",
      "      this.open.delete(oldest);",
      "    }",
      "    this.open.set(traceId, { spans: [] });",
      "  }",
      "",
      "  addSpan(traceId, span) {",
      "    const t = this.open.get(traceId);",
      "    if (t) t.spans.push(span);",
      "  }",
      "",
      "  finish(traceId, outcome) {",
      "    const t = this.open.get(traceId);",
      "    if (!t) return null;   // unknown: was never buffered",
      "    this.open.delete(traceId);",
      "    if (outcome.error) return t.spans;",
      "    if (outcome.durationMs >= this.slowMs) return t.spans;",
      "    return null;",
      "  }",
      "}",
    ],
    bug:[9,10],
    explain:"Lines 10–11 handle overflow by evicting the OLDEST open trace — and 'oldest open' means 'longest-running', which under a latency incident means the slow traces themselves. The buffer systematically discards its most valuable inventory precisely when traffic (and slowness) spikes, then finish() returns null because the trace 'was never buffered'. The defensible policy is the opposite: when full, shed the NEWCOMER (`if (this.open.size >= this.max) return false;`) — you make no promise about a trace you never accepted, instead of silently breaking the promise you made to the one you did. (Real collectors also add a time-based flush so abandoned traces can't pin the buffer forever.)" },

  { id:"bug_burnrate", title:"Burn-rate pager", why:"both windows or no page — the AND is the design", lesson:20,
    scenario:"Since the new SLO alert shipped, on-call gets paged at 3am several times a week by 90-second blips that resolve before the laptop opens — and after real incidents END, the pager keeps firing for most of an hour on errors that already stopped. Which line?",
    lines:[
      "// w = windowed error rates: {m5, m30, h1, h6}",
      "function burn(rate, slo) {",
      "  return rate / (1 - slo);",
      "}",
      "",
      "function pagePolicy(w, slo) {",
      "  if (burn(w.h1, slo) > 14.4 ||",
      "      burn(w.m5, slo) > 14.4) {",
      "    return \"page\";",
      "  }",
      "  if (burn(w.h6, slo) > 6 &&",
      "      burn(w.m30, slo) > 6) {",
      "    return \"page\";",
      "  }",
      "  return null;",
      "}",
    ],
    bug:[6],
    explain:"Line 7 joins the fast pair with OR instead of AND. Either window alone can now page: the 5m window trips on every transient blip (five minutes of data is jumpy — that's the 3am noise), and the 1h window keeps paging for up to an hour AFTER recovery, because it still averages the incident's errors (that's the zombie pages). The multi-window design is `burn(h1) > 14.4 && burn(m5) > 14.4`: the long window proves the burn is real, the short window proves it's still happening — sensitive AND specific, and it resets promptly when the bleeding stops." },

  { id:"bug_logsampler", title:"Error-preserving log sampler", why:"classify first, roll dice second", lesson:18,
    scenario:"The sampler cut log costs by 99% — great. Then an outage produced about 4,000 ERROR lines and the log store shows 41 of them. The code review comment literally says 'errors always kept.' Which line breaks the promise?",
    lines:[
      "class LogSampler {",
      "  constructor(rate) {   // e.g. 0.01 -> keep 1%",
      "    this.rate = rate;",
      "  }",
      "",
      "  emit(record) {",
      "    const h = fnv1a(record.trace_id) % 10000;",
      "    if (h >= this.rate * 10000) return null;",
      "    if (record.level === \"error\") {",
      "      return record;           // errors always kept",
      "    }",
      "    record.sample_rate = 1 / this.rate;",
      "    return record;",
      "  }",
      "}",
    ],
    bug:[7],
    explain:"Line 8 rolls the sampling dice BEFORE the level check ever runs. Any error whose trace id lands on a dropped tick — 99% of them at a 1% rate — returns null without reaching the 'errors always kept' branch, which is now dead code for dropped ticks. The outage keeps ~1% of its evidence, exactly the observed 41 of 4,000. The classifier must run first: `if (record.level === \"error\") return record;` unconditionally (unstamped — a missing sample_rate means 1, the record stands for itself), and only THEN sample the happy path. Order of guards is the entire invariant in a sampler." },

  { id:"bug_spanwrap", title:"Span middleware", why:"exceptions take the exit you didn't instrument", lesson:11,
    scenario:"Tracing worked for weeks. Then: after the first exception in a worker process, every LATER request's spans nest under the request that failed hours ago — one zombie trace growing forever, its duration climbing monotonically. A restart clears it until the next exception. Which line?",
    lines:[
      "function withSpan(tracer, name, fn) {",
      "  const span = tracer.start(name);",
      "  const prev = tracer.current;",
      "  tracer.current = span;    // children attach here",
      "  const result = fn();",
      "  span.end();",
      "  tracer.current = prev;    // restore the parent",
      "  return result;",
      "}",
    ],
    bug:[4],
    explain:"Line 5 calls fn() with nothing catching a throw — and when it throws, lines 6–7 never run: the span is never ended (its duration grows until process death) and, worse, `tracer.current` is never restored, so the broken span stays the ambient parent for every subsequent request on this worker. One exception poisons the context for hours; that's the classic context leak. The fix is structural: `try { return fn(); } finally { span.end(); tracer.current = prev; }` — cleanup that must ALWAYS happen belongs in a finally, because exceptions take the exit you didn't instrument." },

  { id:"bug_cardguard", title:"Cardinality guard", why:"a series is name PLUS labels — guard the thing that explodes", lesson:2,
    scenario:"After a near-miss with the metrics bill, the team shipped a cardinality guard capped at 5,000 series. The guard's own gauge proudly reports 214 series in use — and the TSDB bill tripled anyway when someone added a user_id label. Which line lets the explosion walk straight through?",
    lines:[
      "class CardinalityGuard {",
      "  constructor(limit) {",
      "    this.limit = limit;",
      "    this.seen = new Set();",
      "  }",
      "",
      "  seriesKey(name, labels) {",
      "    return name;",
      "  }",
      "",
      "  admit(name, labels) {",
      "    const key = this.seriesKey(name, labels);",
      "    if (this.seen.has(key)) return labels;    // known series",
      "    if (this.seen.size >= this.limit) {",
      "      return { aggregated: \"overflow\" };     // clamp new series",
      "    }",
      "    this.seen.add(key);",
      "    return labels;",
      "  }",
      "}",
    ],
    bug:[7],
    explain:"Line 8 keys a 'series' by metric name alone — but a time series is the name plus the full label-set, and the label VALUES are what explode. Under this key, http_requests_total counts as one series whether it has 4 label combinations or 4 million, so the guard sees 214 'series' while the TSDB indexes millions. The key must canonicalize the whole identity: name + sorted label pairs (`name + Object.keys(labels).sort().map(k => k + \"=\" + labels[k]).join(\",\")`). Guards that measure the wrong unit don't just fail — they fail while reporting success, which is how the bill triples under a green dashboard." },
  );

  /* =========================================================
     WRITE IT
     ========================================================= */
  WRITE.push(
  { id:"w-critpath", title:"Critical-path finder — write it", why:"latency lives on exactly one chain through the tree", lesson:12,
    spec:"Write criticalPath(root): walk from the root, at each node following the child that FINISHES LAST (largest end), until a leaf. Return the span names along the way, root first. That last-finisher chain is the first-order critical path: the last finisher at every level is always on it (sequential predecessors that gate its start matter too — read the stairs).",
    pre:`// node = { name, start, end, children: [...] }
function criticalPath(root) {`,
    post:`}`,
    lines:[
      "  const path = [root.name];",
      "  let cur = root;",
      "  while (cur.children.length) {",
      "    cur = cur.children.reduce(",
      "      (a, b) => b.end > a.end ? b : a);",
      "    path.push(cur.name);",
      "  }",
      "  return path;",
    ],
    distractors:[
      { code:"      (a, b) => (b.end - b.start) > (a.end - a.start) ? b : a);",
        why:"The LONGEST child isn't what gates the parent — a short span that starts late can finish last and hold the request open. The critical path follows finish times, not durations." },
      { code:"    cur = cur.children[cur.children.length - 1];",
        why:"That's the child that STARTS last (children sort by start), not the one that finishes last — a long-running early child gets skipped and the path tells the wrong story." },
      { code:"    cur = cur.children[0];",
        why:"Walking the first child follows the earliest work, which usually ends long before the request does — you'd 'optimize' auth while the payment call holds the user hostage." },
    ],
    test:`const trace = {
  name: "GET /checkout", start: 0, end: 420, children: [
    { name: "auth.check", start: 0, end: 40, children: [] },
    { name: "cart.load", start: 40, end: 120, children: [] },
    { name: "charge", start: 120, end: 410, children: [
      { name: "stripe.post", start: 130, end: 400, children: [] },
    ] },
  ],
};
const p = criticalPath(trace);
log("path: " + p.join(" -> "));
assert(p.join(",") === "GET /checkout,charge,stripe.post",
  "must follow the last-finisher chain, got " + p.join(","));
const tricky = {
  name: "root", start: 0, end: 230, children: [
    { name: "long-early", start: 0, end: 200, children: [] },
    { name: "short-late", start: 150, end: 210, children: [] },
  ],
};
const p2 = criticalPath(tricky);
log("long-early (dur 200) vs short-late (ends 210): " + p2.join(" -> "));
assert(p2.join(",") === "root,short-late",
  "the LAST FINISHER gates the parent, not the longest child - got " + p2.join(","));
assert(criticalPath({ name: "leaf", start: 0, end: 5, children: [] }).join(",") === "leaf",
  "a childless root is its own critical path");
const gate = {
  name: "root", start: 0, end: 310, children: [
    { name: "long-span", start: 0, end: 300, children: [] },
    { name: "mid-burst", start: 100, end: 200, children: [] },
  ],
};
const p3 = criticalPath(gate);
log("last-started (mid-burst) vs last-finisher (long-span): " + p3.join(" -> "));
assert(p3.join(",") === "root,long-span",
  "the LAST-STARTED child is not the last finisher - got " + p3.join(","));`,
    pass:"the last-finisher chain found — including the trap where the longest child is NOT on the path",
    takeaway:"The last finisher at every level is always on the chain that gates total latency — the first-order critical path, and the place to look FIRST. Sequential predecessors that gate its start matter too; but when 'we made service X 40% faster and nothing changed', X was usually nowhere near this chain.",
    hint:"Start the path with root.name. While the current node has children, reduce them to the one with the largest end, push its name, descend. Return the names array." },

  { id:"w-headsampler", title:"Head sampler — write it", why:"every service must reach the same verdict, alone", lesson:13,
    spec:"Write the HeadSampler: keep(traceId) returns true for roughly `rate` of all traces, deterministically — hash the trace id (fnv1a provided) into 0..9999 and keep when it falls below rate × 10000. The same trace id must ALWAYS get the same verdict, so spans never fragment.",
    pre:`function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
class HeadSampler {`,
    post:`}`,
    lines:[
      "  constructor(rate) {",
      "    this.rate = rate;",
      "  }",
      "  keep(traceId) {",
      "    const h = fnv1a(traceId) % 10000;",
      "    return h < this.rate * 10000;",
      "  }",
    ],
    distractors:[
      { code:"    return Math.random() < this.rate;",
        why:"A coin flip per call: the same trace gets different verdicts on different spans and services — the store fills with fragments, parents without children. Sampling must be a pure function of the trace id." },
      { code:"    const h = fnv1a(traceId + Date.now()) % 10000;",
        why:"Salting with the clock makes two services (or two moments) disagree about the same trace — deterministic per call, fragmenting across the system. The hash input is the trace id, whole and unseasoned." },
      { code:"    return h < this.rate;",
        why:"Comparing 0..9999 against a 0..1 rate keeps almost nothing (only h === 0 survives at any rate) — tracing goes dark and the incident review asks why there are no traces at all. Scale the rate into the hash's range." },
    ],
    test:`const s = new HeadSampler(0.25);
const ids = [];
for (let i = 0; i < 400; i++) ids.push("trace-" + i);
const kept = ids.filter(id => s.keep(id)).length;
log("rate 0.25 over 400 trace ids -> kept " + kept);
assert(kept === 96, "the kept set is a pure function of the ids: exactly 96 of these 400, got " + kept);
assert(s.keep("trace-0") === true && s.keep("trace-42") === true &&
  s.keep("trace-1") === false && s.keep("trace-9") === false &&
  s.keep("trace-17") === false && s.keep("trace-99") === false,
  "golden verdicts: keep() must depend on the trace id ALONE - no randomness, no clock");
for (const id of ids.slice(0, 50))
  assert(s.keep(id) === s.keep(id), "the same trace id must always get the same verdict");
const s2 = new HeadSampler(0.25);
assert(ids.every(id => s.keep(id) === s2.keep(id)),
  "two independent samplers (two services) must agree on every trace");
assert(ids.every(id => !new HeadSampler(0).keep(id)), "rate 0 keeps nothing");
assert(ids.every(id => new HeadSampler(1).keep(id)), "rate 1 keeps everything");`,
    pass:"deterministic, coordination-free, and every service agrees — whole traces or nothing",
    takeaway:"Head sampling is a pure function of the trace id — that one property is what lets five services decide independently and still keep whole traces. The two classic bugs (random per span, hashing the span id) both break exactly it.",
    hint:"Store the rate. keep: fnv1a(traceId) % 10000, compare against rate * 10000. No randomness, no clock, no per-span anything." },

  { id:"w-tailbuffer", title:"Tail-sample buffer — write it", why:"decide after the ending — and never evict the story mid-telling", lesson:13,
    spec:"Write the TailBuffer: start(traceId) opens a trace unless the buffer is full — when full, SHED THE NEWCOMER (return false) rather than evicting an open trace. addSpan appends to an open trace. finish(traceId, {error, durationMs}) removes the trace and returns its spans if it's an error OR at least slowMs; otherwise returns null (dropped). finish of an unknown trace returns null.",
    pre:`class TailBuffer {
  constructor(max, slowMs) {
    this.max = max;
    this.slowMs = slowMs;
    this.open = new Map();
  }`,
    post:`}`,
    lines:[
      "  start(traceId) {",
      "    if (this.open.size >= this.max) return false;",
      "    this.open.set(traceId, { spans: [] });",
      "    return true;",
      "  }",
      "  addSpan(traceId, span) {",
      "    const t = this.open.get(traceId);",
      "    if (t) t.spans.push(span);",
      "  }",
      "  finish(traceId, outcome) {",
      "    const t = this.open.get(traceId);",
      "    if (!t) return null;",
      "    this.open.delete(traceId);",
      "    if (outcome.error) return t.spans;",
      "    if (outcome.durationMs >= this.slowMs) return t.spans;",
      "    return null;",
      "  }",
    ],
    distractors:[
      { code:"    if (this.open.size >= this.max)\n      this.open.delete(this.open.keys().next().value);",
        why:"Evicting the oldest open trace evicts the longest-RUNNING one — under a latency incident that's the slow trace tail sampling exists to keep. Shed the newcomer you've promised nothing to; never break the promise you already made." },
      { code:"    if (outcome.error && outcome.durationMs >= this.slowMs) return t.spans;",
        why:"AND drops fast errors — a 40ms 500 is exactly the specimen the incident channel is asking for. Error and slow are two independent reasons to keep; either one suffices." },
      { code:"    if (t) t.spans = [span];",
        why:"Overwriting instead of appending keeps only the LAST span of every trace — the store fills with one-span skeletons and every waterfall is a single bar. Buffering the whole trace is the entire point of paying tail sampling's memory bill." },
    ],
    test:`const tb = new TailBuffer(2, 1000);
assert(tb.start("t1") === true, "t1 opens");
tb.addSpan("t1", "edge"); tb.addSpan("t1", "db");
assert(tb.start("t2") === true, "t2 opens");
tb.addSpan("t2", "edge");
assert(tb.start("t3") === false, "buffer full: the NEWCOMER is shed");
assert(tb.open.has("t1") && tb.open.has("t2"), "open traces must survive the overflow");
const err = tb.finish("t1", { error: true, durationMs: 90 });
log("t1 finished as a fast error -> " + (err ? "KEPT " + err.length + " spans" : "dropped"));
assert(err && err.length === 2, "a fast error must be kept with ALL its spans");
const fast = tb.finish("t2", { error: false, durationMs: 90 });
assert(fast === null, "a fast success is dropped");
assert(tb.finish("t3", { error: false, durationMs: 5000 }) === null, "an unbuffered trace returns null");
assert(tb.start("t4") === true, "finishing traces frees buffer slots");
tb.addSpan("t4", "edge");
const slow = tb.finish("t4", { error: false, durationMs: 1500 });
assert(slow && slow.length === 1, "a slow success must be kept");
assert(tb.finish("t4", { error: true, durationMs: 1 }) === null, "finish consumes the trace");`,
    pass:"errors kept, slow kept, boring dropped, newcomers shed under pressure — the morgue always has the bodies",
    takeaway:"Tail sampling's power (it saw the ending) and its cost (buffer everything until the ending) are the same fact. The eviction policy under memory pressure is where implementations quietly break their own promise — shed what you never accepted, keep what you did.",
    hint:"start: refuse (false) when at max, else open a {spans: []} entry. addSpan: push if open. finish: unknown -> null; delete the entry; keep (return spans) on error OR durationMs >= slowMs; else null." },

  { id:"w-burnrate", title:"Multi-window burn alert — write it", why:"the pager policy, derived from the promise", lesson:20,
    spec:"Write evaluateBurn(w, slo): w carries windowed error RATES {m5, m30, h1, h6, d3}. Burn = rate / (1 − slo). Return \"page-fast\" when both 1h AND 5m burns exceed 14.4; else \"page-slow\" when both 6h AND 30m exceed 6; else \"ticket\" when both 3d AND 6h exceed 1; else null.",
    pre:`function evaluateBurn(w, slo) {`,
    post:`}`,
    lines:[
      "  const b = (r) => r / (1 - slo);",
      "  if (b(w.h1) > 14.4 && b(w.m5) > 14.4)",
      "    return \"page-fast\";",
      "  if (b(w.h6) > 6 && b(w.m30) > 6)",
      "    return \"page-slow\";",
      "  if (b(w.d3) > 1 && b(w.h6) > 1)",
      "    return \"ticket\";",
      "  return null;",
    ],
    distractors:[
      { code:"  const b = (r) => r / slo;",
        why:"Dividing by the SLO (0.999) instead of the budget (1 − slo = 0.001) makes every burn ~1000× too small — no alert ever fires again, which you discover during the outage it slept through." },
      { code:"  if (b(w.h1) > 14.4 || b(w.m5) > 14.4)",
        why:"OR pages on either window alone: every 90-second blip trips the 5m window, and the 1h window keeps paging for an hour after recovery. Long window = it's real; short window = it's still happening; you need both." },
      { code:"  if (b(w.m5) > 14.4)",
        why:"A lone short window is a nervous static threshold: jumpy on blips, blind to slow burns that never spike five minutes at a time. The window pairs are the design, not decoration." },
    ],
    test:`const slo = 0.999;   // budget 0.1%
const fire = evaluateBurn({ m5: 0.02, m30: 0.02, h1: 0.02, h6: 0.004, d3: 0.001 }, slo);
log("2% errors sustained -> " + fire);
assert(fire === "page-fast", "a real fire must page fast, got " + fire);
const blip = evaluateBurn({ m5: 0.16, m30: 0.027, h1: 0.01, h6: 0.002, d3: 0.0005 }, slo);
log("90-second blip (5m window screaming, 1h calm) -> " + blip);
assert(blip === null, "a blip must NOT page: the 1h window never confirmed it, got " + blip);
const leak = evaluateBurn({ m5: 0.0008, m30: 0.008, h1: 0.008, h6: 0.008, d3: 0.004 }, slo);
assert(leak === "page-slow", "a 0.8% slow leak burns 8x on 6h AND 30m -> page-slow, got " + leak);
const drip = evaluateBurn({ m5: 0.002, m30: 0.002, h1: 0.002, h6: 0.002, d3: 0.002 }, slo);
assert(drip === "ticket", "a 2x drip is morning work: ticket, got " + drip);
const calm = evaluateBurn({ m5: 0.0005, m30: 0.0005, h1: 0.0005, h6: 0.0005, d3: 0.0005 }, slo);
assert(calm === null, "burn 0.5 is within budget: silence, got " + calm);`,
    pass:"fires page in minutes, leaks page in hours, drips become tickets, blips stay silent",
    takeaway:"14.4 isn't folklore — it's 2% of a 30-day budget spent in one hour (0.02 × 720). The window pairs turn one SLO into a complete pager policy where severity sets the speed, and every constant is derivable on a whiteboard.",
    hint:"burn = rate / (1 − slo). Three AND-gated tiers, checked fast to slow: (h1, m5) > 14.4 -> page-fast; (h6, m30) > 6 -> page-slow; (d3, h6) > 1 -> ticket; else null." },

  { id:"w-canonlog", title:"Canonical line middleware — write it", why:"one wide event per request, no matter how it ends", lesson:17,
    spec:"Write wrap(handler): return a function that runs the handler with a set(k, v) collector, then emits EXACTLY ONE event per request via this.emit — carrying route, request_id, everything set() collected, status (from the handler's return, or 500 on throw), error message on throw, and duration_ms from this.now(). The event must emit on success AND on throw; a throw is re-thrown.",
    pre:`class CanonicalLine {
  constructor(emit, now) {
    this.emit = emit;   // (event) => void
    this.now = now;     // virtual clock
  }`,
    post:`}`,
    lines:[
      "  wrap(handler) {",
      "    return (req) => {",
      "      const canon = { route: req.route,",
      "        request_id: req.id, started: this.now() };",
      "      const set = (k, v) => { canon[k] = v; };",
      "      try {",
      "        const out = handler(req, set);",
      "        canon.status = out.status;",
      "        return out;",
      "      } catch (e) {",
      "        canon.status = 500;",
      "        canon.error = e.message;",
      "        throw e;",
      "      } finally {",
      "        canon.duration_ms = this.now() - canon.started;",
      "        this.emit(canon);",
      "      }",
      "    };",
      "  }",
    ],
    distractors:[
      { code:"      const out = handler(req, set);\n      canon.status = out.status;\n      this.emit(canon);\n      return out;",
        why:"Happy-path-only: a throw skips the emit, so the failing requests — the ones the 3am query exists for — are exactly the ones missing from the table. Telemetry that only survives success is anti-telemetry." },
      { code:"      } catch (e) {\n        canon.status = 500;\n        this.emit(canon);\n        throw e;\n      }",
        why:"Emit-in-catch-only inverts the hole: successes never emit (the return skips the catch) and errors emit without duration. One unconditional path must own the emit — that's what finally is for." },
      { code:"      } finally {\n        this.emit(canon);\n      }",
        why:"Emits without stamping duration_ms — every event ships with the field missing, and the latency-by-route query over your wide events silently returns nothing. The finally owns BOTH the stamp and the emit." },
    ],
    test:`const events = [];
let t = 0;
const canon = new CanonicalLine((e) => events.push(e), () => (t += 25));
const handler = canon.wrap((req, set) => {
  set("cache", "miss"); set("db_ms", 18);
  if (req.route === "/boom") throw new Error("upstream 502");
  return { status: 200 };
});
const out = handler({ id: "r1", route: "/checkout" });
assert(out.status === 200, "the wrapped handler must pass the response through");
let threw = false;
try { handler({ id: "r2", route: "/boom" }); } catch (e) { threw = e.message === "upstream 502"; }
assert(threw, "the original error must be re-thrown, not swallowed");
log(events.length + " requests -> " + events.length + " canonical events");
assert(events.length === 2, "exactly one event per request, got " + events.length);
assert(events[0].status === 200 && events[0].cache === "miss" && events[0].db_ms === 18,
  "collected fields must ride the success event");
assert(events[1].status === 500 && events[1].error === "upstream 502",
  "the throwing request must still emit, with status 500 and the error");
assert(events.every(e => typeof e.duration_ms === "number" && e.duration_ms > 0),
  "every event carries duration_ms");
assert(events[1].route === "/boom" && events[1].request_id === "r2",
  "identity fields must be present on the failure event too");`,
    pass:"two requests, two complete events — including the one that exploded mid-handler",
    takeaway:"The canonical line is 20 lines of middleware that turn 40 scattered log lines into one queryable wide event — and the finally is its load-bearing wall: the request that dies is the one you must not lose.",
    hint:"Build canon with route/request_id/started. try: run handler, record status, return. catch: status 500, error message, re-throw. finally: stamp duration_ms and emit — the finally ALWAYS runs." },

  { id:"w-logsampler", title:"Error-preserving log sampler — write it", why:"cut 99% of the bill, keep 100% of the evidence", lesson:18,
    spec:"Write emit(record): ERROR-level records are ALWAYS kept (pushed to this.kept and returned) — no dice ever rolled, and no sample_rate stamped: absent means 1, each record stands for itself. Other records are kept only when fnv1a(record.trace_id) lands under rate × 10000, and each kept one is stamped with sample_rate = 1/rate so query-time totals can reweigh. Dropped records return null.",
    pre:`function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
class LogSampler {
  constructor(rate) {
    this.rate = rate;
    this.kept = [];
  }`,
    post:`}`,
    lines:[
      "  emit(record) {",
      "    if (record.level === \"error\") {",
      "      this.kept.push(record);",
      "      return record;",
      "    }",
      "    if (fnv1a(record.trace_id) % 10000 < this.rate * 10000) {",
      "      record.sample_rate = 1 / this.rate;",
      "      this.kept.push(record);",
      "      return record;",
      "    }",
      "    return null;",
      "  }",
    ],
    distractors:[
      { code:"    if (fnv1a(record.trace_id) % 10000 >= this.rate * 10000)\n      return null;",
        why:"Placed first, this drops 99% of ERRORS too — the level check below becomes dead code for dropped ticks, and the outage keeps 1% of its evidence. Classify first; roll dice second." },
      { code:"      record.sample_rate = this.rate;",
        why:"The weight is inverted: reweighing multiplies by 0.01 instead of 100, so every dashboard built on the sampled stream reads 10,000× low. sample_rate means 'each kept record stands for N' — that's 1/rate." },
      { code:"    if (Math.random() < this.rate) {",
        why:"Random sampling keeps a different slice than the trace sampler did — your logs and traces disagree about which requests exist, and the join that debugging depends on comes up empty. Hash the trace id; signals should agree on their specimens." },
    ],
    test:`const s = new LogSampler(0.01);
const infoIds = [];
for (let i = 0; i < 400; i++) infoIds.push("trace-" + i);
for (const id of infoIds) s.emit({ level: "info", trace_id: id, msg: "ok" });
const infoKept = s.kept.filter(r => r.level === "info");
log("400 info records at 1% -> kept " + infoKept.length);
assert(infoKept.length >= 1 && infoKept.length <= 20, "1% sampling must thin the happy path, kept " + infoKept.length);
assert(infoKept.every(r => r.sample_rate === 100), "kept info must carry sample_rate = 1/rate = 100");
const dropped = infoIds.filter(id => !s.kept.some(r => r.trace_id === id));
assert(dropped.length > 0, "most info records are dropped");
for (let i = 0; i < 5; i++) {
  const r = s.emit({ level: "error", trace_id: dropped[i], msg: "boom" });
  assert(r !== null, "an ERROR must be kept even on a trace id the sampler would drop");
}
assert(s.kept.filter(r => r.level === "error").length === 5, "all 5 errors kept - no dice for errors");
const s2 = new LogSampler(0.01);
for (const id of infoIds) s2.emit({ level: "info", trace_id: id, msg: "ok" });
assert(s2.kept.length === infoKept.length &&
  s2.kept.every((r, i) => r.trace_id === infoKept[i].trace_id),
  "sampling must be deterministic: same input, same survivors");`,
    pass:"every error survived — including ones on 'dropped' trace ids — and the happy path thinned deterministically with its weight attached",
    takeaway:"A log sampler is two rules in strict order: errors are never negotiable, and everything else carries its weight (sample_rate) so aggregates stay honest. The order of those two checks is the difference between cost control and destroying evidence.",
    hint:"Check level === \"error\" FIRST — keep unconditionally. Otherwise hash the trace_id: below rate × 10000, stamp sample_rate = 1/rate and keep; else return null." },

  { id:"w-cardest", title:"Series-cardinality estimator — write it", why:"count series like the TSDB will bill them", lesson:2,
    spec:"Write seriesProduct(labelCards) — the product of each label's distinct-value count ({method: 7, status: 5} -> 35) — and SeriesTracker.observe(name, labels), which counts TRUE distinct series: the key is the metric name plus the label pairs sorted by key, so {a, b} and {b, a} are one series.",
    pre:`function seriesProduct(labelCards) {`,
    post:`}`,
    lines:[
      "  return Object.values(labelCards)",
      "    .reduce((a, b) => a * b, 1);",
      "}",
      "class SeriesTracker {",
      "  constructor() { this.seen = new Set(); }",
      "  observe(name, labels) {",
      "    const key = name + \"{\" + Object.keys(labels).sort()",
      "      .map(k => k + \"=\" + labels[k]).join(\",\") + \"}\";",
      "    this.seen.add(key);",
      "    return this.seen.size;",
      "  }",
    ],
    distractors:[
      { code:"  return Object.values(labelCards)\n    .reduce((a, b) => a + b, 0);",
        why:"Labels don't add — they MULTIPLY. Summing says user_id (40,000) plus path (1,200) is 41,200 series when the truth is 48 million per method-status combo; the estimate that approves the PR is off by three orders of magnitude." },
      { code:"    const key = name + \"{\" + Object.keys(labels)\n      .map(k => k + \"=\" + labels[k]).join(\",\") + \"}\";",
        why:"Unsorted keys make {method, path} and {path, method} two different 'series' — the tracker overcounts call-site by call-site, and as a guard key it splits one real explosion across phantom identities it then fails to cap." },
      { code:"    const key = name;",
        why:"Name-only counts every metric as one series regardless of labels — the accountant reports 40 while the TSDB indexes 14 million. This is the exact bug that lets a user_id label sail through a cardinality guard." },
    ],
    test:`assert(seriesProduct({ method: 7, status: 5 }) === 35, "7 methods x 5 statuses = 35 series");
const sane = seriesProduct({ method: 7, status: 5, path: 40 });
assert(sane === 1400, "adding a 40-value label multiplies to 1400, got " + sane);
const melted = seriesProduct({ method: 7, status: 5, path: 40, user_id: 10000 });
log("with user_id (10k values): " + melted.toLocaleString() + " series");
assert(melted === 14000000, "one unbounded label multiplies everything: 14,000,000, got " + melted);
assert(seriesProduct({}) === 1, "no labels = exactly one series (the bare metric)");
const tr = new SeriesTracker();
assert(tr.observe("http_requests_total", { method: "GET", path: "/a" }) === 1, "first label-set: 1 series");
assert(tr.observe("http_requests_total", { path: "/a", method: "GET" }) === 1,
  "the SAME labels in a different key order must NOT mint a new series");
assert(tr.observe("http_requests_total", { method: "GET", path: "/b" }) === 2,
  "a new label VALUE is a new series");
assert(tr.observe("http_errors_total", { method: "GET", path: "/a" }) === 3,
  "the same labels under a different metric name is a different series");
log("4 observations -> " + tr.seen.size + " true series");`,
    pass:"the product multiplied, the tracker canonicalized — you count series the way the bill does",
    takeaway:"A series is (metric name + canonical label-set), and the fleet-wide count is a product, not a sum. Every cardinality disaster starts with someone reasoning additively about a multiplicative cost — now you have the two functions that settle the argument.",
    hint:"seriesProduct: reduce the values with multiplication, seeded at 1. Tracker key: name + sorted label keys mapped to k=v, joined — sort BEFORE joining so insertion order can't mint phantom series." },
  );

})();
