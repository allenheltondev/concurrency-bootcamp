/* Observability Bootcamp — core: tiny helpers, reference implementations,
   and the demo runners that power every "run reference" button. Loaded first.

   Every telemetry system here is simulated in-process: scrapes are arrays of
   {t, v} samples, spans are plain objects, "hosts" are histograms in a list.
   The physics are the point — counter resets, bucket interpolation error,
   percentiles that refuse to average, samplers that fragment traces, burn
   rates that page or stay silent — and they behave exactly like the real
   thing (Prometheus / OpenTelemetry semantics), deterministically enough
   that every demo's invariant check always holds. */
"use strict";

/* ---------- tiny helpers available to demos ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const rnd = (n) => Math.floor(Math.random()*n);

function fnv1a(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
/* seeded PRNG for the simulator — deterministic runs, virtual time only */
function mulberry32(seed){ let a=seed>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
const pct = (x) => (x*100).toFixed(x*100>=10?0:1)+"%";

/* ===========================================================
   REFERENCE IMPLEMENTATIONS  (these power the Run buttons)
   =========================================================== */

/* ---- counters: monotonic, so rate() survives restarts ----
   samples: [{t (ms), v (cumulative count)}] — what a scraper collected.
   A decrease can only mean the process restarted and the counter began
   again at 0, so the post-reset sample IS the increase since the reset. */
function counterIncrease(samples){
  let inc=0;
  for(let i=1;i<samples.length;i++){
    const d=samples[i].v-samples[i-1].v;
    inc += d>=0 ? d : samples[i].v;          // reset: count from 0, not from the old value
  }
  return inc;
}
function counterRate(samples){                // per-second average over the window
  const seconds=(samples[samples.length-1].t-samples[0].t)/1000;
  return counterIncrease(samples)/seconds;
}
function naiveDelta(samples){                 // the bug rate() exists to avoid
  return samples[samples.length-1].v-samples[0].v;
}

/* ---- histograms: buckets, not values ----
   bounds are upper edges (like Prometheus `le`); everything above the last
   bound lands in the +Inf bucket. quantile() mirrors histogram_quantile():
   find the bucket the rank falls in, then LINEARLY INTERPOLATE inside it —
   the answer is an estimate whose accuracy is decided by the boundaries.
   A rank in the +Inf bucket returns the largest finite bound. */
class Histogram{
  constructor(bounds){
    this.bounds=bounds.slice();
    this.counts=new Array(bounds.length+1).fill(0);   // last slot = +Inf
    this.total=0; this.sum=0;
  }
  record(v){
    let i=this.bounds.findIndex(b=>v<=b);
    if(i===-1) i=this.bounds.length;
    this.counts[i]++; this.total++; this.sum+=v;
  }
  quantile(q){
    if(!this.total) return NaN;
    const rank=q*this.total;
    let cum=0;
    for(let i=0;i<this.counts.length;i++){
      const prev=cum; cum+=this.counts[i];
      if(cum>=rank && this.counts[i]>0){
        if(i>=this.bounds.length) return this.bounds[this.bounds.length-1];  // +Inf bucket
        const lo=i===0?0:this.bounds[i-1], hi=this.bounds[i];
        return lo+(hi-lo)*((rank-prev)/this.counts[i]);  // the interpolation
      }
    }
    return this.bounds[this.bounds.length-1];
  }
  /* estimated fraction of observations <= x (interpolating inside x's bucket) */
  fractionAtOrBelow(x){
    if(!this.total) return NaN;
    let cum=0;
    for(let i=0;i<this.counts.length;i++){
      const lo=i===0?0:this.bounds[i-1];
      const hi=i<this.bounds.length?this.bounds[i]:Infinity;
      if(x>=hi){ cum+=this.counts[i]; continue; }
      if(x>=lo && hi!==Infinity) cum+=this.counts[i]*((x-lo)/(hi-lo));
      break;
    }
    return cum/this.total;
  }
}
/* merging is exact — bucket counts are just sums. (Percentiles are NOT.) */
function mergeHistograms(hists){
  const bounds=hists[0].bounds;
  for(const h of hists) if(h.bounds.join()!==bounds.join()) throw new Error("bucket bounds must match to merge");
  const m=new Histogram(bounds);
  for(const h of hists){
    h.counts.forEach((c,i)=>m.counts[i]+=c);
    m.total+=h.total; m.sum+=h.sum;
  }
  return m;
}

/* ---- traces: spans -> tree -> critical path ----
   spans: {id, parent (null = root), name, start, end, error?} in ANY order —
   exporters ship children before parents all the time. */
function buildTrace(spans){
  const nodes=new Map(spans.map(s=>[s.id,{...s,children:[]}]));
  let root=null;
  for(const s of nodes.values()){
    if(s.parent==null) root=s;                         // the root is parentless, not first
    else if(nodes.has(s.parent)) nodes.get(s.parent).children.push(s);
  }
  for(const s of nodes.values()) s.children.sort((a,b)=>a.start-b.start);
  return root;
}
function criticalPath(root){                           // the chain that decides total latency
  const path=[root];
  let cur=root;
  while(cur.children.length){
    cur=cur.children.reduce((a,b)=>b.end>a.end?b:a);   // follow the child that finishes last
    path.push(cur);
  }
  return path;
}
function selfTime(node){                               // time NOT explained by children
  const ivs=node.children.map(c=>[Math.max(c.start,node.start),Math.min(c.end,node.end)])
    .filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  let covered=0, curEnd=-Infinity, curStart=0;
  for(const [a,b] of ivs){
    if(a>curEnd){ if(curEnd>-Infinity) covered+=curEnd-curStart; curStart=a; curEnd=b; }
    else curEnd=Math.max(curEnd,b);
  }
  if(curEnd>-Infinity) covered+=curEnd-curStart;
  return (node.end-node.start)-covered;
}
function walkTrace(root,fn){ fn(root); for(const c of root.children) walkTrace(c,fn); }

/* ---- sampling: head (decide at the start) vs tail (decide at the end) ----
   Head sampling MUST key on the trace id so every span of a trace gets the
   SAME verdict — a per-span coin flip ships fragments. Deterministic hash,
   not Math.random(): every service reaches the same decision independently. */
class HeadSampler{
  constructor(rate){ this.rate=rate; }
  keep(traceId){ return fnv1a(traceId)%10000 < this.rate*10000; }
}
/* Tail sampling sees the outcome: buffer the whole trace, then keep every
   error, every slow one, and a deterministic slice of the boring ones. */
class TailSampler{
  constructor({slowMs, baseRate=0}){ this.slowMs=slowMs; this.baseRate=baseRate; }
  decide(trace){                              // trace: {id, durationMs, error}
    if(trace.error) return true;              // errors are never negotiable
    if(trace.durationMs>=this.slowMs) return true;
    return fnv1a(trace.id)%10000 < this.baseRate*10000;
  }
}

/* ---- SLOs: burn rate is "how many times faster than budget am I failing" ----
   budget rate = 1 - SLO. burn 1 = exactly on budget: the whole 30-day budget
   dies in exactly 30 days. burn 14.4 = 2% of the budget per hour (0.02 x 720h).
   The canonical multi-window pages need BOTH windows over the line: the long
   window proves it's significant, the short one proves it's still happening. */
function burnRate(errRate, slo){ return errRate/(1-slo); }
function evaluateBurn(w, slo){               // w = {m5, m30, h1, h6, d3} error RATES
  const b=(r)=>burnRate(r,slo);
  if(b(w.h1)>14.4 && b(w.m5)>14.4) return "page-fast";   // 2% of budget in 1h
  if(b(w.h6)>6   && b(w.m30)>6)   return "page-slow";    // 5% of budget in 6h
  if(b(w.d3)>1   && b(w.h6)>1)    return "ticket";       // 10% of budget in 3d
  return null;
}
/* series alerting: series = per-minute error rates; evaluate at each minute */
function windowRate(series, i, mins){
  const from=Math.max(0,i-mins+1);
  let s=0; for(let j=from;j<=i;j++) s+=series[j];
  return s/(i-from+1);
}
function staticAlertFires(series, threshold, forMin){
  let run=0;
  for(let i=0;i<series.length;i++){
    run=series[i]>threshold?run+1:0;
    if(run>=forMin) return i;
  }
  return -1;
}
function burnAlertFires(series, slo){
  for(let i=0;i<series.length;i++){
    const w={m5:windowRate(series,i,5), m30:windowRate(series,i,30),
             h1:windowRate(series,i,60), h6:windowRate(series,i,360),
             d3:windowRate(series,i,4320)};
    const v=evaluateBurn(w,slo);
    if(v==="page-fast"||v==="page-slow") return i;
  }
  return -1;
}

/* ---- canonical log line: ONE wide event per request, emitted no matter what ---- */
class CanonicalLine{
  constructor(emit, now){ this.emit=emit; this.now=now; }
  wrap(handler){
    return (req)=>{
      const canon={route:req.route, request_id:req.id, started:this.now()};
      const set=(k,v)=>{ canon[k]=v; };
      try{
        const out=handler(req,set);
        canon.status=out.status;
        return out;
      }catch(e){
        canon.status=500; canon.error=e.message;   // failures are the events you need MOST
        throw e;
      }finally{
        canon.duration_ms=this.now()-canon.started;
        this.emit(canon);                          // exactly one line, success or throw
      }
    };
  }
}

/* ---- cardinality: series = every distinct (metric, label-set) combination ---- */
function seriesProduct(labelCards){            // {label: distinctValues} -> series count
  return Object.values(labelCards).reduce((a,b)=>a*b,1);
}
class SeriesTracker{
  #seen=new Set();
  observe(name,labels){                        // sorted keys: {a,b} === {b,a}
    const key=name+"{"+Object.keys(labels).sort().map(k=>k+"="+labels[k]).join(",")+"}";
    this.#seen.add(key);
    return this.#seen.size;
  }
  count(){ return this.#seen.size; }
}
function dropUntilBudget(labelCards, budget){  // greedy: shed the widest label first
  const cards={...labelCards}; const dropped=[];
  while(seriesProduct(cards)>budget){
    const worst=Object.keys(cards).reduce((a,b)=>cards[b]>cards[a]?b:a);
    dropped.push(worst); delete cards[worst];
    if(!Object.keys(cards).length) break;
  }
  return {dropped, series:seriesProduct(cards)};
}

/* ---- triage: which signal answers which question ---- */
function pickSignal(need){
  // detect: "is it broken / how much / for whom (in aggregate)?" -> metrics
  // localize: "WHERE in this request did the time/failure go?"   -> traces
  // explain: "WHY did that hop do that?"                          -> logs/events
  // explore: "a question no dashboard predicted?"                 -> wide events
  return {detect:"metrics", localize:"traces", explain:"logs", explore:"wide events"}[need]||null;
}

/* ---- find the culprit hop: deepest error, else biggest self-time on the path ---- */
function culpritHop(root){
  let deepestErr=null, errDepth=-1;
  (function walk(n,d){
    if(n.error && d>errDepth){ deepestErr=n; errDepth=d; }
    for(const c of n.children) walk(c,d+1);
  })(root,0);
  if(deepestErr) return deepestErr;                    // blame where the error was BORN
  return criticalPath(root).reduce((a,b)=>selfTime(b)>selfTime(a)?b:a);
}

/* ---- deploy correlation: find the step, then the last change before it ---- */
function detectStep(series){                   // index of the largest jump
  let at=1, best=0;
  for(let i=1;i<series.length;i++){
    const d=Math.abs(series[i]-series[i-1]);
    if(d>best){ best=d; at=i; }
  }
  return at;
}
function correlateChange(stepAt, changes, windowMin=30){
  const before=changes.filter(c=>c.t<=stepAt && stepAt-c.t<=windowMin);
  if(!before.length) return null;
  return before.reduce((a,b)=>b.t>a.t?b:a);    // the LATEST change before the step
}

/* ---- coverage: which incident questions can today's telemetry answer? ---- */
function coverageGaps(inventory, questions){
  const have=new Set(inventory);
  return questions.filter(q=>!q.needs.every(n=>have.has(n)));
}

/* ===========================================================
   DEMOS  -> return {lines:[{t}], pass:boolean, verdict}
   =========================================================== */
async function demoCounterRate(){
  const samples=[{t:0,v:1000},{t:15000,v:1300},{t:30000,v:70},{t:45000,v:370}]; // deploy between 15s and 30s
  const naive=naiveDelta(samples);
  const inc=counterIncrease(samples);
  const rate=counterRate(samples);
  const pass=naive===-630 && inc===670 && Math.abs(rate-670/45)<1e-9;
  return {lines:[
    {t:`scrapes: 1000 → 1300 → 70 → 370  (the process restarted mid-window)`},
    {t:`naive last-minus-first: ${naive} requests — the dashboard goes NEGATIVE`},
    {t:`reset-aware increase: 300 + 70 + 300 = ${inc} → rate ${rate.toFixed(1)}/s`},
  ], pass, verdict:pass?"a drop in a counter can only mean restart-from-zero — count the new value, never the difference":`naive=${naive} inc=${inc}`};
}
async function demoHistQuantile(){
  const h=new Histogram([100,250,500,1000]);
  for(let i=0;i<40;i++) h.record(50);
  for(let i=0;i<30;i++) h.record(200);
  for(let i=0;i<20;i++) h.record(400);
  for(let i=0;i<10;i++) h.record(800);
  const p50=h.quantile(0.5), p99=h.quantile(0.99);
  const pass=Math.abs(p50-150)<1e-9 && Math.abs(p99-950)<1e-9 && h.total===100;
  return {lines:[
    {t:`100 observations → buckets le=100:40, le=250:30, le=500:20, le=1000:10`},
    {t:`p50: rank 50 lands in (100,250], 10/30 deep → ${p50.toFixed(0)}ms (interpolated)`},
    {t:`p99: rank 99 lands in (500,1000], 9/10 deep → ${p99.toFixed(0)}ms — every real sample there was 800ms`},
  ], pass, verdict:pass?"the p99 is an interpolation inside a bucket — the boundaries decide the accuracy, not the data":`p50=${p50} p99=${p99}`};
}
async function demoHistMerge(){
  const a=new Histogram([100,250,500]), b=new Histogram([100,250,500]);
  for(let i=0;i<90;i++) a.record(80);   // healthy host
  for(let i=0;i<10;i++) a.record(200);
  for(let i=0;i<10;i++) b.record(80);   // the sick canary
  for(let i=0;i<90;i++) b.record(400);
  const pA=a.quantile(0.99), pB=b.quantile(0.99);
  const avg=(pA+pB)/2;
  const merged=mergeHistograms([a,b]);
  const real=merged.quantile(0.99);
  const pass=Math.abs(avg-366.11111111111114)<1e-6 && Math.abs(real-494.44444444444446)<1e-6 && merged.total===200;
  return {lines:[
    {t:`host A p99 ${pA.toFixed(0)}ms · host B (canary) p99 ${pB.toFixed(0)}ms`},
    {t:`"average of p99s": ${avg.toFixed(0)}ms — a number no request experienced`},
    {t:`merge buckets, THEN quantile: fleet p99 ${real.toFixed(0)}ms — the canary is visible`},
  ], pass, verdict:pass?"bucket counts add; percentiles don't — merge first, ask the distribution second":`avg=${avg} real=${real}`};
}
async function demoTraceAssemble(){
  const spans=[                                        // export order ≠ causal order
    {id:"s4",parent:"s3",name:"stripe.post",start:130,end:400},
    {id:"s2",parent:"s1",name:"cart.load",start:40,end:120},
    {id:"s3",parent:"s1",name:"charge",start:120,end:410},
    {id:"s1",parent:null,name:"GET /checkout",start:0,end:420},
    {id:"s0",parent:"s1",name:"auth.check",start:0,end:40},
  ];
  const root=buildTrace(spans);
  const path=criticalPath(root).map(s=>s.name);
  const pass=root.name==="GET /checkout" && root.children.length===3
    && path.join(" → ")==="GET /checkout → charge → stripe.post"
    && selfTime(root)===10;
  return {lines:[
    {t:`5 spans arrive out of order → tree rebuilt from parent ids, root = ${root.name}`},
    {t:`critical path: ${path.join(" → ")} (follow the child that finishes last)`},
    {t:`root self-time ${selfTime(root)}ms — only 10ms is unexplained by children`},
  ], pass, verdict:pass?"a trace is a tree keyed by parent ids — and the critical path, not the span count, decides the latency":`path=${path.join(",")}`};
}
async function demoHeadTail(){
  const head=new HeadSampler(0.25);
  const ids=Array.from({length:400},(_,i)=>"trace-"+i);
  const kept=ids.filter(id=>head.keep(id)).length;
  const consistent=ids.every(id=>head.keep(id)===head.keep(id));
  const tail=new TailSampler({slowMs:1000});
  const decisions=[
    tail.decide({id:"t-ok",durationMs:90,error:false}),
    tail.decide({id:"t-slow",durationMs:4200,error:false}),
    tail.decide({id:"t-err",durationMs:120,error:true}),
  ];
  const pass=consistent && kept>60 && kept<140
    && decisions[0]===false && decisions[1]===true && decisions[2]===true;
  return {lines:[
    {t:`head @25%: ${kept}/400 traces kept — hash(traceId), so every span agrees, no fragments`},
    {t:`head is blind: it decided before the outcome existed — errors get no favors`},
    {t:`tail: ok(90ms)→drop · slow(4.2s)→KEEP · error→KEEP — it saw the ending first`},
  ], pass, verdict:pass?"head is cheap and blind; tail keeps what matters but must buffer everything to know":`kept=${kept} d=${decisions}`};
}
async function demoBurnRate(){
  const slo=0.999;                                     // budget: 0.1% of requests
  const fast=evaluateBurn({m5:0.02,m30:0.02,h1:0.02,h6:0.004,d3:0.001},slo);
  const blip=evaluateBurn({m5:0.16,m30:0.027,h1:0.01,h6:0.002,d3:0.0005},slo);
  const slow=evaluateBurn({m5:0.0008,m30:0.008,h1:0.008,h6:0.008,d3:0.004},slo);
  const b=burnRate(0.02,slo);
  const pass=fast==="page-fast" && blip===null && slow==="page-slow" && Math.abs(b-20)<1e-9;
  return {lines:[
    {t:`2% errors vs 0.1% budget → burn ${b.toFixed(0)}× → 30-day budget gone in ${(30*24/b).toFixed(0)}h → page`},
    {t:`90-second blip: 5m window screams (burn 160) but the 1h window says ${burnRate(0.01,slo).toFixed(0)} < 14.4 → no page`},
    {t:`0.8% for six hours: burn 8 on BOTH 6h and 30m → page-slow — the leak a static threshold never sees`},
  ], pass, verdict:pass?"both windows or no page: the long window proves it's real, the short one proves it's still happening":`fast=${fast} blip=${blip} slow=${slow}`};
}
async function demoCanonLog(){
  const events=[];
  let t=0; const now=()=>(t+=25);
  const canon=new CanonicalLine((e)=>events.push(e),now);
  const handler=canon.wrap((req,set)=>{
    set("user_tier","pro"); set("cache","miss"); set("db_ms",18);
    if(req.route==="/boom") throw new Error("upstream 502");
    return {status:200};
  });
  handler({id:"r1",route:"/checkout"});
  let threw=false;
  try{ handler({id:"r2",route:"/boom"}); }catch(e){ threw=true; }
  const pass=events.length===2 && events[0].status===200 && events[0].cache==="miss"
    && events[1].status===500 && events[1].error==="upstream 502"
    && events.every(e=>typeof e.duration_ms==="number") && threw;
  return {lines:[
    {t:`req 1: one wide event — {route, user_tier, cache, db_ms, status:200, duration_ms}`},
    {t:`req 2 THROWS mid-handler → the finally still emits: {status:500, error:"upstream 502"}`},
    {t:`2 requests → exactly 2 events, every field queryable — not 40 scattered lines to reassemble`},
  ], pass, verdict:pass?"one wide event per request, emitted in a finally — the request that dies is the one you must not lose":`events=${events.length} threw=${threw}`};
}
async function demoCardinality(){
  const base=seriesProduct({method:7,status:5,path:40});
  const melted=seriesProduct({method:7,status:5,path:40,user_id:10000});
  const tr=new SeriesTracker();
  tr.observe("http_requests_total",{method:"GET",path:"/a",status:"200"});
  tr.observe("http_requests_total",{status:"200",path:"/a",method:"GET"});   // same set, reordered
  tr.observe("http_requests_total",{method:"GET",path:"/a",status:"500"});
  const pass=base===1400 && melted===14000000 && tr.count()===2;
  return {lines:[
    {t:`http_requests_total × {method:7, status:5, path:40} = ${base.toLocaleString()} series — fine`},
    {t:`add user_id (10k users): ${melted.toLocaleString()} series — one label melted the TSDB`},
    {t:`tracker: 3 observations, ${tr.count()} series — label ORDER doesn't mint new series, values do`},
  ], pass, verdict:pass?"series = the product of label cardinalities — every label multiplies, and unbounded values multiply forever":`base=${base} melted=${melted}`};
}

/* ---- problem-bank demos ---- */
async function demoPickSignal(){
  const routed=["detect","localize","explain","explore"].map(pickSignal);
  const pass=routed.join("|")==="metrics|traces|logs|wide events";
  return {lines:[
    {t:`"is checkout broken, and how much?" → ${pickSignal("detect")} (cheap, aggregated, alertable)`},
    {t:`"where did THIS request's 3s go?" → ${pickSignal("localize")} · "why did that hop 500?" → ${pickSignal("explain")}`},
    {t:`"a question nobody predicted?" → ${pickSignal("explore")} — high-cardinality events you can slice after the fact`},
  ], pass, verdict:pass?"metrics detect, traces localize, logs explain — start a grade left and you drown, a grade right and you're blind":routed.join(",")};
}
async function demoCulpritHop(){
  const errTrace=buildTrace([
    {id:"a",parent:null,name:"GET /order",start:0,end:500},
    {id:"b",parent:"a",name:"cache.get",start:20,end:90},
    {id:"c",parent:"a",name:"db.call",start:100,end:480,error:true},
    {id:"d",parent:"c",name:"db.query",start:110,end:470,error:true},
  ]);
  const slowTrace=buildTrace([
    {id:"a",parent:null,name:"GET /order",start:0,end:500},
    {id:"b",parent:"a",name:"api.auth",start:0,end:100},
    {id:"c",parent:"a",name:"db.call",start:100,end:490},
  ]);
  const c1=culpritHop(errTrace), c2=culpritHop(slowTrace);
  const pass=c1.name==="db.query" && c2.name==="db.call" && selfTime(c2)===390;
  return {lines:[
    {t:`error trace: both db.call and db.query flag errors → blame the DEEPEST: ${c1.name} (where it was born)`},
    {t:`slow trace, no errors: critical path self-times → ${c2.name} owns ${selfTime(c2)}ms of the 500`},
    {t:`parents inherit failure from children — walking UP the tree finds symptoms, walking DOWN finds causes`},
  ], pass, verdict:pass?"deepest error first, else biggest self-time on the critical path — that's the hop to page":`c1=${c1.name} c2=${c2.name}`};
}
async function demoBucketDesign(){
  const mk=(bounds)=>{ const h=new Histogram(bounds); for(let i=0;i<85;i++) h.record(280); for(let i=0;i<15;i++) h.record(450); return h; };
  const generic=mk([100,250,500,1000]);      // no edge at the SLO threshold
  const aligned=mk([100,300,1000]);          // 300ms IS a boundary
  const estG=generic.fractionAtOrBelow(300), estA=aligned.fractionAtOrBelow(300);
  const pass=Math.abs(estG-0.2)<1e-9 && Math.abs(estA-0.85)<1e-9;
  return {lines:[
    {t:`truth: 85/100 requests ≤ 300ms (SLO threshold) — 85% compliant`},
    {t:`bounds [100,250,500,1000]: all 100 samples share (250,500] → interpolation says ${pct(estG)} compliant`},
    {t:`bounds [100,300,1000]: the threshold is an EDGE → exact count: ${pct(estA)} compliant`},
  ], pass, verdict:pass?"an SLO threshold inside a bucket is a guess; on a boundary it's a count — put the edge where the promise is":`estG=${estG} estA=${estA}`};
}
async function demoAlertDesign(){
  const slo=0.99;
  const blip=new Array(720).fill(0); blip[460]=1; blip[461]=1;   // 6h+ healthy, then 2 min of 100% errors
  const leak=new Array(720).fill(0);                             // 6h healthy, then 8% errors sustained
  for(let i=360;i<720;i++) leak[i]=0.08;
  const staticBlip=staticAlertFires(blip,0.10,2);
  const staticLeak=staticAlertFires(leak,0.10,2);
  const burnBlip=burnAlertFires(blip,slo);
  const burnLeak=burnAlertFires(leak,slo);
  const pass=staticBlip===461 && staticLeak===-1 && burnBlip===-1 && burnLeak===630;
  return {lines:[
    {t:`blip (100% for 2 min at t=460, self-healed): static "err>10% for 2m" PAGES at t=${staticBlip} · burn-rate stays quiet (1h burn 3.3 < 14.4)`},
    {t:`leak (8% from t=360): static NEVER fires (8 < 10) · burn-rate pages at t=${burnLeak} — ${((burnLeak-360)/60).toFixed(1)}h after onset, once the 6h AND 30m burns both clear 6`},
    {t:`same two alerts, opposite verdicts — the static threshold woke you for nothing and slept through the outage`},
  ], pass, verdict:pass?"thresholds ask 'how high?'; burn rates ask 'how fast is the promise dying?' — only one of those is the question":`sb=${staticBlip} sl=${staticLeak} bb=${burnBlip} bl=${burnLeak}`};
}
async function demoCardTriage(){
  const labels={method:7,path:1200,status:5,user_id:40000};
  const before=seriesProduct(labels);
  const r=dropUntilBudget(labels,10000);
  const pass=before===1680000000 && r.dropped.join(",")==="user_id,path" && r.series===35;
  return {lines:[
    {t:`{method:7, path:1200, status:5, user_id:40000} → ${before.toLocaleString()} series — the bill that gets a VP involved`},
    {t:`drop user_id → 42,000 (still over 10k) → drop raw path too → ${r.series} series`},
    {t:`user_id moves to traces/events (exemplars bridge back); path gets bucketed to route templates`},
  ], pass, verdict:pass?"cardinality triage is greedy: shed the widest label first, and move per-user questions to the signal built for them":`dropped=${r.dropped}`};
}
async function demoMissingTelemetry(){
  const inventory=["fleet error rate","per-route latency histogram","edge request logs"];
  const questions=[
    {q:"is checkout erroring right now?",            needs:["fleet error rate"]},
    {q:"is it all users or just one shard?",         needs:["per-shard error breakdown"]},
    {q:"which hop is eating the 3 seconds?",         needs:["per-hop spans"]},
  ];
  const gaps=coverageGaps(inventory,questions);
  const pass=gaps.length===2 && gaps[0].q.includes("shard") && gaps[1].q.includes("hop");
  return {lines:[
    {t:`triage script vs telemetry inventory: 1 of 3 questions answerable`},
    {t:`GAP: "${gaps[0].q}" needs ${gaps[0].needs[0]} — you'd ssh-and-guess at 3am`},
    {t:`GAP: "${gaps[1].q}" needs ${gaps[1].needs[0]} — the postmortem's action items, written BEFORE the incident`},
  ], pass, verdict:pass?"an incident you can't interrogate is an instrumentation gap wearing a pager — audit the questions, not the dashboards":`gaps=${gaps.length}`};
}
async function demoDeployCorr(){
  const series=new Array(60).fill(0.3).map((v,i)=>i>=42?4.0:v);
  const changes=[{t:10,what:"config: db pool 20→40"},{t:41,what:"deploy: api v142"},{t:55,what:"deploy: web v9"}];
  const step=detectStep(series);
  const culprit=correlateChange(step,changes);
  const pass=step===42 && culprit.what==="deploy: api v142";
  return {lines:[
    {t:`error rate: 0.3% … 0.3% │ 4.0% — step change at minute ${step}`},
    {t:`changes: db config @10 (too early) · api v142 @41 · web v9 @55 (AFTER the step — can't be it)`},
    {t:`latest change ≤ the step: ${culprit.what} — roll it back first, investigate second`},
  ], pass, verdict:pass?"most outages are self-inflicted and recent — the change log is the first dashboard, and the step points at the culprit":`step=${step} culprit=${culprit&&culprit.what}`};
}
