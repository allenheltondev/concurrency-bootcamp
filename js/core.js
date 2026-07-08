/* Concurrency Bootcamp — core: tiny helpers, reference implementations, and
   the demo runners that power every "run reference" button. Loaded first. */
"use strict";

/* ---------- tiny helpers available to demos ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const rnd = (n) => Math.floor(Math.random()*n);

/* ===========================================================
   REFERENCE IMPLEMENTATIONS  (these power the Run buttons)
   =========================================================== */
class Mutex{
  #locked=false; #queue=[];
  async acquire(){ if(!this.#locked){this.#locked=true;return;} const d=deferred(); this.#queue.push(d); await d.promise; }
  release(){ const n=this.#queue.shift(); if(n) n.resolve(); else this.#locked=false; }
  async runExclusive(fn){ await this.acquire(); try{ return await fn(); } finally{ this.release(); } }
}
class Semaphore{
  #permits; #queue=[];
  constructor(p){ this.#permits=p; }
  async acquire(){ if(this.#permits>0){this.#permits--;return;} const d=deferred(); this.#queue.push(d); await d.promise; }
  release(){ const n=this.#queue.shift(); if(n) n.resolve(); else this.#permits++; }
}
class Latch{ #d=deferred(); wait(){return this.#d.promise;} open(){this.#d.resolve();} }
class Barrier{
  #parties; #count=0; #d=deferred();
  constructor(p){ this.#parties=p; }
  async arrive(label){ if(++this.#count===this.#parties) this.#d.resolve(); await this.#d.promise; return label; }
}
class AsyncQueue{
  #values=[]; #waiters=[];
  push(v){ const w=this.#waiters.shift(); if(w) w.resolve(v); else this.#values.push(v); }
  async pull(){ if(this.#values.length) return this.#values.shift(); const d=deferred(); this.#waiters.push(d); return d.promise; }
}
class Sequencer{
  #next=0; #gates=new Map();
  acquire(seq){ if(seq<=this.#next) return Promise.resolve(); return new Promise(res=>this.#gates.set(seq,res)); }
  release(seq){ this.#next=seq+1; const n=this.#gates.get(this.#next); if(n){ this.#gates.delete(this.#next); n(); } }
}
async function pool(items,limit,worker){
  const results=[]; const executing=new Set();
  for(const [i,item] of items.entries()){
    const p=Promise.resolve().then(()=>worker(item,i));
    results.push(p); executing.add(p); p.finally(()=>executing.delete(p));
    if(executing.size>=limit) await Promise.race(executing);
  }
  return Promise.all(results);
}
class TokenBucket{
  #capacity; #tokens; #ratePerMs; #last=Date.now();
  constructor(capacity,ratePerSec){ this.#capacity=capacity; this.#tokens=capacity; this.#ratePerMs=ratePerSec/1000; }
  #refill(){ const now=Date.now(); const gained=(now-this.#last)*this.#ratePerMs; this.#last=now; this.#tokens=Math.min(this.#capacity,this.#tokens+gained); }
  async take(){ this.#refill(); while(this.#tokens<1){ await sleep((1-this.#tokens)/this.#ratePerMs); this.#refill(); } this.#tokens-=1; }
}
function debounce(fn,wait){
  let t;                                  // the pending timer
  return function(...args){
    clearTimeout(t);                      // cancel the prior pending call
    t=setTimeout(()=>fn.apply(this,args),wait);
  };
}
function throttle(fn,interval){
  let last=0;
  return function(...args){
    const now=Date.now();
    if(now-last>=interval){ last=now; fn.apply(this,args); }
  };
}
function promiseAll(promises){
  return new Promise((resolve,reject)=>{
    const results=[]; let done=0;
    if(promises.length===0) resolve(results);
    promises.forEach((p,i)=>{
      Promise.resolve(p).then(v=>{ results[i]=v; if(++done===promises.length) resolve(results); }, reject);
    });
  });
}
async function retry(fn,{tries=3,base=10}={}){
  let attempt=0;
  for(;;){
    try{ return await fn(); }
    catch(err){
      if(++attempt>=tries) throw err;
      await sleep(base*2**(attempt-1));   // exponential backoff
    }
  }
}
/* ---- durable-execution helpers (replay determinism, durable timeout, condition) ---- */
function makeRuntime(history){
  let cursor=0;
  return {
    // first run: execute fn and record it. replay: return the recorded value verbatim.
    sideEffect(fn){
      if(cursor<history.length) return history[cursor++];
      const v=fn(); history.push(v); cursor++; return v;
    }
  };
}
function withTimeout(work,ms){
  return Promise.race([                          // first to settle wins
    work,
    sleep(ms).then(()=>({timedOut:true})),
  ]);
}
function makeCondition(){
  let waiters=[];
  return {
    notify(){ const w=waiters; waiters=[]; w.forEach(r=>r()); },
    async wait(pred){ while(!pred()){ const d=deferred(); waiters.push(d.resolve); await d.promise; } }
  };
}
function select(sources){
  // race tagged sources; resolve with {label,value} of whichever settles first
  return Promise.race(sources.map(s=>s.promise.then(v=>({label:s.label,value:v}))));
}
function memoizeAsync(fn){
  const cache=new Map();   // key -> in-flight or settled promise
  return (key)=>{
    if(cache.has(key)) return cache.get(key);                 // share the existing computation
    const p=fn(key).catch(e=>{ cache.delete(key); throw e; }); // evict on failure
    cache.set(key,p);
    return p;
  };
}
class BoundedQueue{
  #cap; #buf=[]; #pushW=[]; #pullW=[];
  constructor(cap){ this.#cap=cap; }
  async push(v){
    while(this.#buf.length>=this.#cap){ const d=deferred(); this.#pushW.push(d); await d.promise; }   // block while full
    this.#buf.push(v);
    const w=this.#pullW.shift(); if(w) w.resolve();      // wake a waiting consumer
  }
  async pull(){
    while(this.#buf.length===0){ const d=deferred(); this.#pullW.push(d); await d.promise; }           // block while empty
    const v=this.#buf.shift();
    const w=this.#pushW.shift(); if(w) w.resolve();      // wake a blocked producer
    return v;
  }
  size(){ return this.#buf.length; }
}
function atomicTryAcquire(cell){ return Atomics.compareExchange(cell,0,0,1)===0; }  // 0->1 iff free
function atomicRelease(cell){ Atomics.store(cell,0,0); }
class RWLock{
  #readers=0; #writing=false; #rq=[]; #wq=[];
  async acquireRead(){ if(this.#writing||this.#wq.length){ const d=deferred(); this.#rq.push(d); await d.promise; } else this.#readers++; }
  releaseRead(){ this.#readers--; this.#dispatch(); }
  async acquireWrite(){ if(this.#writing||this.#readers>0||this.#wq.length){ const d=deferred(); this.#wq.push(d); await d.promise; } else this.#writing=true; }
  releaseWrite(){ this.#writing=false; this.#dispatch(); }
  #dispatch(){
    if(this.#writing) return;
    if(this.#readers===0 && this.#wq.length){ this.#writing=true; this.#wq.shift().resolve(); }
    else if(!this.#wq.length){ while(this.#rq.length){ this.#readers++; this.#rq.shift().resolve(); } }
  }
}
function once(fn){ let p; return ()=> (p ??= fn()); }
function withTimeoutCancel(workFn,ms){
  const ctrl=new AbortController();
  const work=workFn(ctrl.signal).then(v=>({ok:v}),()=>({aborted:true}));
  const timer=sleep(ms).then(()=>{ ctrl.abort(); return {timedOut:true}; });   // cancel the loser
  return Promise.race([work,timer]);
}
async function errgroup(taskFns){
  const ctrl=new AbortController();
  const tasks=taskFns.map(fn=>fn(ctrl.signal).catch(err=>{ ctrl.abort(); throw err; }));  // first failure cancels the rest
  return Promise.all(tasks);
}

/* ===========================================================
   DEMOS  -> return {lines:[{t,cls}], pass:boolean}
   =========================================================== */
async function demoMutex(){
  const m=new Mutex(); let inside=0,max=0;
  await Promise.all([1,2,3,4,5].map(()=>m.runExclusive(async()=>{inside++;max=Math.max(max,inside);await sleep(rnd(18));inside--;})));
  return {lines:[{t:`5 tasks ran through one lock`},{t:`max concurrent holders = ${max}`}], pass:max===1, verdict:`max holders ${max} (want 1)`};
}
async function demoSemaphore(){
  const s=new Semaphore(2); let inside=0,max=0;
  await Promise.all([1,2,3,4,5,6].map(async()=>{await s.acquire();inside++;max=Math.max(max,inside);await sleep(rnd(18));inside--;s.release();}));
  return {lines:[{t:`6 tasks, 2 permits`},{t:`max concurrent = ${max}`}], pass:max===2, verdict:`max concurrent ${max} (want 2)`};
}
async function demoLatch(){
  const l=new Latch(); const order=[];
  const w=[1,2,3].map(n=>l.wait().then(()=>order.push("released-"+n)));
  order.push("all-waiting"); await sleep(12); l.open(); await Promise.all(w);
  const pass=order[0]==="all-waiting"&&order.length===4;
  return {lines:[{t:order.join("  ")}], pass, verdict:pass?"all waited, then released together":"order wrong"};
}
async function demoBarrier(){
  const b=new Barrier(3); const log=[];
  const ps=[8,28,14].map((d,i)=>sleep(d).then(()=>{log.push("arrive-"+i);return b.arrive(i).then(()=>log.push("go-"+i));}));
  await Promise.all(ps);
  const firstGo=log.findIndex(x=>x.startsWith("go"));
  const pass=log.slice(0,firstGo).every(x=>x.startsWith("arrive"))&&firstGo===3;
  return {lines:[{t:log.join("  ")}], pass, verdict:pass?"all 3 arrived before any proceeded":"a party left early"};
}
async function demoQueue(){
  const q=new AsyncQueue(); const got=[];
  const c=(async()=>{for(let i=0;i<3;i++)got.push(await q.pull());})();
  await sleep(10); q.push("a"); await sleep(6); q.push("b"); q.push("c"); await c;
  const pass=got.join(",")==="a,b,c";
  return {lines:[{t:`consumer pulled: [${got.join(", ")}]`},{t:`(it blocked until each push arrived)`}], pass, verdict:pass?"delivered in order, no busy-wait":"out of order"};
}
async function demoSequencer(){
  const seq=new Sequencer(); const out=[]; const pos={A:0,B:1,C:2}; const cyc={A:0,B:0,C:0};
  const emit=async(slot)=>{const s=cyc[slot]++*3+pos[slot]; await seq.acquire(s); out.push(slot); seq.release(s);};
  const prod=slot=>(async()=>{for(let c=0;c<4;c++){await sleep(rnd(10));await emit(slot);}})();
  await Promise.all([prod("A"),prod("B"),prod("C")]);
  const pass=out.join("")==="ABCABCABCABC";
  return {lines:[{t:`emitted: ${out.join(" ")}`},{t:`(3 producers fired in random order)`}], pass, verdict:pass?"perfect A→B→C every cycle":"order broke"};
}
async function demoPrintOrder(){ return demoSequencer(); }
async function demoPool(){
  let inflight=0,max=0;
  await pool([1,2,3,4,5,6],2,async()=>{inflight++;max=Math.max(max,inflight);await sleep(rnd(18));inflight--;});
  return {lines:[{t:`6 jobs, limit 2`},{t:`max in-flight = ${max}`}], pass:max===2, verdict:`max in-flight ${max} (want 2)`};
}
async function demoDining(){
  const n=5, rounds=2;
  const fork=Array.from({length:n},()=>new Mutex());
  let meals=0;
  const seat=async(i)=>{
    const left=i, right=(i+1)%n;
    const [a,b]= left<right ? [left,right] : [right,left];   // global lock order
    for(let r=0;r<rounds;r++){
      await fork[a].acquire(); await fork[b].acquire();
      try{ meals++; await sleep(rnd(6)); } finally{ fork[b].release(); fork[a].release(); }
    }
  };
  await Promise.all(Array.from({length:n},(_,i)=>seat(i)));
  const pass=meals===n*rounds;
  return {lines:[{t:`${n} philosophers, ${rounds} rounds each`},{t:`${meals} meals served — ran to completion`}], pass, verdict:pass?`all ${meals} meals served, no deadlock`:`stalled at ${meals}/${n*rounds}`};
}
async function demoTokenBucket(){
  const cap=3, ratePerSec=100;            // ~1 token / 10ms once the burst is spent
  const tb=new TokenBucket(cap,ratePerSec);
  const start=Date.now(); const at=[];
  for(let i=0;i<6;i++){ await tb.take(); at.push(Date.now()-start); }
  const burst=at.filter(t=>t<8).length;   // tokens served effectively instantly
  const total=at[at.length-1];
  const pass = burst===cap && total>=20;
  return {lines:[{t:`bucket: capacity ${cap}, ${ratePerSec}/sec`},{t:`take() at ms: ${at.map(t=>Math.round(t)).join(", ")}`},{t:`${burst} instant (burst), rest throttled`}], pass, verdict:pass?`burst of ${cap}, then steady ~${Math.round(1000/ratePerSec)}ms/token`:`rate-limit broke (burst ${burst}, total ${total}ms)`};
}
async function demoDebounce(){
  let calls=0; const f=debounce(()=>{calls++;},40);
  for(let i=0;i<5;i++){ f(); await sleep(4); }   // burst: 5 calls, ~4ms apart
  await sleep(60);                                // let it settle past wait=40
  const pass=calls===1;
  return {lines:[{t:`5 rapid calls (~4ms apart), wait=40ms`},{t:`fn actually ran ${calls} time(s)`}], pass, verdict:pass?"collapsed a burst into 1 call":`ran ${calls}× (want 1)`};
}
async function demoThrottle(){
  let calls=0; const f=throttle(()=>{calls++;},20);
  for(let i=0;i<10;i++){ f(); await sleep(5); }   // 10 calls over ~50ms
  const pass=calls>=2&&calls<=6;
  return {lines:[{t:`10 calls over ~50ms, interval=20ms`},{t:`fn ran ${calls} time(s)`}], pass, verdict:pass?`throttled to ${calls} (≈ once / 20ms)`:`ran ${calls}× (want ~3)`};
}
async function demoPromiseAll(){
  const mk=(v,ms)=>new Promise(r=>setTimeout(()=>r(v),ms));
  const out=await promiseAll([mk("a",18),mk("b",2),mk("c",10)]);
  const pass=out.join(",")==="a,b,c";
  return {lines:[{t:`resolved [a@18ms, b@2ms, c@10ms]`},{t:`result: [${out.join(", ")}]`}], pass, verdict:pass?"input order preserved despite finish order":`got [${out.join(", ")}]`};
}
async function demoRetry(){
  let n=0; const flaky=async()=>{ if(++n<3) throw new Error("fail "+n); return "ok@"+n; };
  const t0=Date.now();
  const r=await retry(flaky,{tries:5,base:8});
  const ms=Date.now()-t0;
  const pass=r==="ok@3"&&n===3&&ms>=18;          // backed off 8ms + 16ms before the 3rd try (loose floor: timers can fire ~1ms early and Date.now() truncates)
  return {lines:[{t:`fn fails twice, succeeds on attempt 3`},{t:`got "${r}" after ${n} tries, ~${ms}ms`}], pass, verdict:pass?"backed off 8ms→16ms, then succeeded":`r=${r} n=${n} ${ms}ms`};
}
async function demoReplay(){
  const decide=(rt)=> rt.sideEffect(()=>Math.random())<0.5 ? "refund" : "ship";
  const history=[];
  const first=decide(makeRuntime(history));                     // first run records
  const replays=[0,0,0].map(()=>decide(makeRuntime(history.slice())));
  const deterministic=replays.every(d=>d===first);
  const naive=Array.from({length:8},()=> Math.random()<0.5?"refund":"ship");
  return {lines:[{t:`first run decided: ${first}`},{t:`3 replays from recorded history: ${replays.join(", ")}`},{t:`raw Math.random() over 8 runs: ${new Set(naive).size} distinct outcome(s)`}], pass:deterministic, verdict:deterministic?`replay reproduced "${first}" every time — raw randomness wouldn't`:`replay diverged: ${replays.join(",")}`};
}
async function demoDurableTimeout(){
  const activity=(delay,val)=>sleep(delay).then(()=>({ok:val}));
  const a=await withTimeout(activity(5,"charged"),40);          // activity wins
  const b=await withTimeout(activity(60,"charged"),20);         // timer wins
  const pass=a.ok==="charged" && b.timedOut===true;
  return {lines:[{t:`activity 5ms vs timer 40ms → ${a.timedOut?"timeout":"ok:"+a.ok}`},{t:`activity 60ms vs timer 20ms → ${b.timedOut?"timeout":"ok:"+b.ok}`}], pass, verdict:pass?"first to settle wins — the durable-timeout race":`a=${JSON.stringify(a)} b=${JSON.stringify(b)}`};
}
async function demoSignalMutex(){
  const run=async(useMutex)=>{
    let balance=100; const m=new Mutex();
    const withdraw=async(amt)=>{
      const body=async()=>{ const b=balance; await sleep(rnd(8)); balance=b-amt; };
      if(useMutex) await m.runExclusive(body); else await body();
    };
    await Promise.all([withdraw(30),withdraw(30),withdraw(30)]);
    return balance;
  };
  const racy=await run(false), safe=await run(true);
  const pass=safe===10 && racy!==10;
  return {lines:[{t:`3 concurrent withdrawals of 30 from 100`},{t:`no mutex → balance ${racy}  (updates lost)`},{t:`mutex.runExclusive → balance ${safe}`}], pass, verdict:pass?"mutex serialized the read-modify-write across the await":`racy=${racy} safe=${safe}`};
}
async function demoCondition(){
  let ready=false; const cond=makeCondition(); const order=[];
  const wf=(async()=>{ order.push("await"); await cond.wait(()=>ready); order.push("proceed"); })();
  await sleep(10); order.push("signal"); ready=true; cond.notify(); await wf;
  const pass=order.join(",")==="await,signal,proceed";
  return {lines:[{t:`order: ${order.join(" → ")}`}], pass, verdict:pass?"workflow parked on the predicate until a signal flipped it":`order: ${order.join(",")}`};
}
async function demoCondVar(){
  let a=false,b=false; const cv=makeCondition(); const done=[];
  const w1=(async()=>{ await cv.wait(()=>a); done.push("A"); })();
  const w2=(async()=>{ await cv.wait(()=>b); done.push("B"); })();
  await sleep(5); a=true; b=true; cv.notify();   // one signal → both re-check their own predicate
  await Promise.all([w1,w2]);
  const pass=done.length===2 && done.includes("A") && done.includes("B");
  return {lines:[{t:`two waiters on different predicates`},{t:`one signalAll woke both → [${done.join(", ")}]`}], pass, verdict:pass?"signalAll let each waiter re-check and proceed":`woke ${done.join(",")}`};
}
async function demoBoundedQueue(){
  const q=new BoundedQueue(2); let maxLen=0; const got=[];
  const producer=(async()=>{ for(let i=1;i<=6;i++){ await q.push(i); maxLen=Math.max(maxLen,q.size()); } })();
  const consumer=(async()=>{ for(let i=0;i<6;i++){ await sleep(rnd(10)); got.push(await q.pull()); } })();
  await Promise.all([producer,consumer]);
  const pass=got.join(",")==="1,2,3,4,5,6" && maxLen<=2;
  return {lines:[{t:`6 items, capacity 2, slow consumer`},{t:`consumed: [${got.join(", ")}]`},{t:`max buffered at once: ${maxLen}`}], pass, verdict:pass?`producer blocked at capacity (backpressure); all 6 in order, never >2 buffered`:`order ${got.join(",")} maxLen ${maxLen}`};
}
async function demoLogProcessor(){
  const out=[]; const seq=new Sequencer(); const pos={A:0,B:1,C:2}; const cyc={A:0,B:0,C:0}; let bFails=1;
  const action=(slot)=>async()=>{ if(slot==="B"&&bFails>0){ bFails--; throw new Error("B offline"); } out.push(slot); };
  const run=(slot)=>async()=>{ const s=cyc[slot]++*3+pos[slot]; await seq.acquire(s); await retry(action(slot),{tries:5,base:2}); seq.release(s); };
  const fire=(slot)=>(async()=>{ for(let c=0;c<2;c++){ await sleep(rnd(8)); await run(slot)(); } })();
  await Promise.all([fire("A"),fire("B"),fire("C")]);
  const pass=out.join("")==="ABCABC";
  return {lines:[{t:`2 cycles · subsystem B fails once, then recovers`},{t:`processed: ${out.join(" ")}`}], pass, verdict:pass?"order A→B→C held across a transient failure":`got ${out.join("")}`};
}
async function demoSelect(){
  const src=(label,ms,v)=>({label,promise:sleep(ms).then(()=>v)});
  const r=await select([src("A",30,"a"),src("B",6,"b"),src("C",18,"c")]);
  const pass=r.label==="B";
  return {lines:[{t:`raced A@30ms, B@6ms, C@18ms`},{t:`select picked: ${r.label} (= ${r.value})`}], pass, verdict:pass?"first-ready source won the select":`picked ${r.label}`};
}
async function demoMemoize(){
  let calls=0; const slow=async(k)=>{ calls++; await sleep(10); return k.toUpperCase(); };
  const m=memoizeAsync(slow);
  const results=await Promise.all(["x","x","x","y","x"].map(k=>m(k)));
  const pass=calls===2 && results.join(",")==="X,X,X,Y,X";
  return {lines:[{t:`5 concurrent calls: x, x, x, y, x`},{t:`underlying fn ran ${calls}× (once per distinct key)`},{t:`results: ${results.join(", ")}`}], pass, verdict:pass?"concurrent calls for a key deduped to one computation":`ran ${calls}× → ${results.join(",")}`};
}
async function demoAtomicLock(){
  const cell=new Int32Array(1);   // 0 = free, 1 = held (a SharedArrayBuffer across real threads)
  const a=atomicTryAcquire(cell), b=atomicTryAcquire(cell);
  atomicRelease(cell);
  const c=atomicTryAcquire(cell); atomicRelease(cell);
  const pass=a&&!b&&c;
  return {lines:[{t:`acquire while free → ${a}`},{t:`acquire while already held → ${b}`},{t:`acquire after release → ${c}`}], pass, verdict:pass?"compare-and-swap gives exclusive ownership in one indivisible step":`a=${a} b=${b} c=${c}`};
}
async function demoRWLock(){
  const rw=new RWLock(); let readers=0,maxR=0,writing=false,violation=false;
  const reader=async()=>{ await rw.acquireRead(); readers++; maxR=Math.max(maxR,readers); if(writing)violation=true; await sleep(rnd(10)); readers--; rw.releaseRead(); };
  const writer=async()=>{ await rw.acquireWrite(); writing=true; if(readers>0)violation=true; await sleep(8); writing=false; rw.releaseWrite(); };
  await Promise.all([reader(),reader(),reader(),writer(),reader(),writer()]);
  const pass=!violation && maxR>=2;
  return {lines:[{t:`4 readers + 2 writers contend`},{t:`max concurrent readers: ${maxR}`},{t:`reader/writer overlaps: ${violation?"yes":"none"}`}], pass, verdict:pass?`readers ran in parallel (max ${maxR}); writers stayed exclusive`:`maxR=${maxR} violation=${violation}`};
}
async function demoOnce(){
  let calls=0; const init=once(async()=>{ calls++; await sleep(5); return "ready"; });
  const rs=await Promise.all([init(),init(),init(),init()]);
  const pass=calls===1 && rs.every(r=>r==="ready");
  return {lines:[{t:`4 concurrent init() calls`},{t:`initializer ran ${calls}× (want 1)`}], pass, verdict:pass?"initialized exactly once; all callers shared the result":`ran ${calls}×`};
}
async function demoCancelTimeout(){
  let cleanedUp=false;
  const workFn=(signal)=> new Promise((resolve,reject)=>{ const t=setTimeout(()=>resolve("done"),1000); signal.addEventListener("abort",()=>{ clearTimeout(t); cleanedUp=true; reject(new Error("aborted")); },{once:true}); });
  const r=await withTimeoutCancel(workFn,20); await sleep(5);
  const pass=r.timedOut===true && cleanedUp===true;
  return {lines:[{t:`work takes 1000ms, timeout 20ms`},{t:`result: ${r.timedOut?"timeout":"ok"} · losing work cleaned up: ${cleanedUp}`}], pass, verdict:pass?"timed out AND cancelled the losing work — no leak":`timedOut=${r.timedOut} cleaned=${cleanedUp}`};
}
async function demoErrgroup(){
  let aborts=0;
  const slow=(ms)=>(signal)=> new Promise((resolve,reject)=>{ const t=setTimeout(()=>resolve("ok"),ms); signal.addEventListener("abort",()=>{ clearTimeout(t); aborts++; reject(new Error("aborted")); },{once:true}); });
  const failing=(ms)=>()=> sleep(ms).then(()=>{ throw new Error("boom"); });
  let caught=false;
  try{ await errgroup([slow(1000),failing(10),slow(1000)]); }catch(e){ caught=true; }
  await sleep(5);
  const pass=caught && aborts===2;
  return {lines:[{t:`3 tasks; #2 fails at 10ms, #1 and #3 take 1000ms`},{t:`group rejected: ${caught} · siblings cancelled: ${aborts}`}], pass, verdict:pass?"first failure cancelled the siblings (errgroup)":`caught=${caught} aborts=${aborts}`};
}

/* ===========================================================
   CONTENT
   =========================================================== */
