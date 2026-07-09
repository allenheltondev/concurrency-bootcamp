/* Distributed Systems Bootcamp — core: tiny helpers, reference implementations,
   and the demo runners that power every "run reference" button. Loaded first.

   Every "node", "replica", and "network" here is simulated in-process: a node
   is an object, a message is an async call, latency is a sleep. The physics
   are the point — delays, losses, duplicates, and stale leaders behave exactly
   like the real thing, just at millisecond scale and deterministically enough
   that every demo's invariant check always holds. */
"use strict";

/* ---------- tiny helpers available to demos ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const rnd = (n) => Math.floor(Math.random()*n);

/* ===========================================================
   REFERENCE IMPLEMENTATIONS  (these power the Run buttons)
   =========================================================== */

/* ---- time: logical clocks ---- */
class LamportClock{
  #t=0;
  tick(){ return ++this.#t; }                                  // local event
  stamp(){ return ++this.#t; }                                 // stamp an outgoing message
  recv(remote){ this.#t=Math.max(this.#t,remote)+1; return this.#t; }  // merge rule: max, then +1
  now(){ return this.#t; }
}
class VectorClock{
  constructor(id,n){ this.id=id; this.v=new Array(n).fill(0); }
  tick(){ this.v[this.id]++; return this.v.slice(); }
  stamp(){ this.v[this.id]++; return this.v.slice(); }
  recv(remote){                                                // element-wise max, THEN count this receive
    for(let i=0;i<this.v.length;i++) this.v[i]=Math.max(this.v[i],remote[i]);
    this.v[this.id]++;
    return this.v.slice();
  }
}
function vcCompare(a,b){                                       // "before" | "after" | "concurrent" | "equal"
  let le=true, ge=true;
  for(let i=0;i<a.length;i++){ if(a[i]>b[i]) le=false; if(a[i]<b[i]) ge=false; }
  if(le&&ge) return "equal";
  if(le) return "before";
  if(ge) return "after";
  return "concurrent";
}

/* ---- replication: replicas + quorum store ---- */
class Replica{
  #data=new Map();
  constructor(name){ this.name=name; this.up=true; }
  async put(key,rec){                                          // rec = {value, version}
    if(!this.up) throw new Error(this.name+" unreachable");
    await sleep(rnd(4));
    const cur=this.#data.get(key);
    if(!cur||rec.version>=cur.version) this.#data.set(key,rec);   // last-writer-wins by version
    return true;
  }
  async get(key){
    if(!this.up) throw new Error(this.name+" unreachable");
    await sleep(rnd(4));
    return this.#data.get(key)||null;
  }
  peek(key){ return this.#data.get(key)||null; }               // test-only: no network
}
class QuorumStore{
  #version=0;
  constructor(replicas,w,r){ this.replicas=replicas; this.w=w; this.r=r; }
  async put(key,value){
    const rec={value,version:++this.#version};
    const settled=await Promise.allSettled(this.replicas.map(rep=>rep.put(key,rec)));
    const acks=settled.filter(s=>s.status==="fulfilled").length;
    if(acks<this.w) throw new Error(`write failed: ${acks}/${this.w} acks`);
    return {version:rec.version,acks};
  }
  async get(key){
    const settled=await Promise.allSettled(this.replicas.map(rep=>rep.get(key)));
    const reads=settled.filter(s=>s.status==="fulfilled");
    if(reads.length<this.r) throw new Error(`read failed: ${reads.length}/${this.r} replies`);
    let newest=null;
    for(const s of reads) if(s.value&&(!newest||s.value.version>newest.version)) newest=s.value;
    return newest;                                             // newest version among the quorum wins
  }
  async getRepair(key){                                        // quorum read + read repair
    const newest=await this.get(key);
    if(newest) await Promise.allSettled(this.replicas.map(rep=>rep.put(key,newest)));
    return newest;
  }
}

/* ---- failure detection: heartbeats against a manual clock (deterministic) ---- */
class FailureDetector{
  #last=new Map(); #timeout;
  constructor(timeout){ this.#timeout=timeout; }
  beat(node,now){ this.#last.set(node,now); }
  status(node,now){
    const t=this.#last.get(node);
    if(t==null) return "unknown";
    return (now-t)>this.#timeout ? "suspect" : "alive";        // can't distinguish slow from dead — only suspect
  }
}

/* ---- leases + fencing tokens ---- */
class LeaseServer{
  #holder=null; #expires=0; #token=0;
  acquire(node,now,ttl){
    if(this.#holder!==null && now<this.#expires) return null;  // someone holds a live lease
    this.#holder=node; this.#expires=now+ttl;
    return ++this.#token;                                      // token increases monotonically per grant
  }
  holder(now){ return now<this.#expires ? this.#holder : null; }
}
class FencedStore{
  #highest=0; log=[];
  write(token,who,value){
    if(token<this.#highest) return false;                      // stale holder — fence it out
    this.#highest=token;
    this.log.push(`${who}:${value}`);
    return true;
  }
}

/* ---- idempotent consumer: at-least-once delivery, effectively-once effect ---- */
class IdempotentConsumer{
  #seen=new Set();
  applied=0;
  handle(msg){                                                 // msg = {id, work}
    if(this.#seen.has(msg.id)) return false;                   // duplicate — drop it
    this.#seen.add(msg.id);                                    // record BEFORE the effect is visible twice
    this.applied++;
    return true;
  }
}

/* ---- consistent hashing ---- */
function fnv1a(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
class HashRing{
  #ring=[];                                                    // sorted [{h, node}]
  constructor(nodes=[],vnodes=8){ this.vnodes=vnodes; nodes.forEach(n=>this.add(n)); }
  add(node){ for(let i=0;i<this.vnodes;i++) this.#ring.push({h:fnv1a(node+"#"+i),node}); this.#ring.sort((a,b)=>a.h-b.h); }
  remove(node){ this.#ring=this.#ring.filter(e=>e.node!==node); }
  owner(key){
    if(!this.#ring.length) return null;
    const h=fnv1a(key);
    for(const e of this.#ring) if(e.h>=h) return e.node;       // first point clockwise
    return this.#ring[0].node;                                 // wrap around
  }
}

/* ---- leader election: majority of reachable nodes, highest id wins the term ---- */
function electLeader(nodes,term){
  const up=nodes.filter(n=>n.up);
  if(up.length*2<=nodes.length) return {leader:null,term,votes:up.length};   // no majority — no leader, on purpose
  const winner=up.reduce((a,b)=>a.id>b.id?a:b);
  return {leader:winner.id,term:term+1,votes:up.length};
}

/* ---- term-fenced replicated log: commit at majority ---- */
class LogReplica{
  term=0; entries=[];
  append(term,entry){
    if(term<this.term) return false;                           // stale leader's term — reject
    this.term=term;
    this.entries.push(entry);
    return true;
  }
}
class LogLeader{
  #commitIndex=-1;
  constructor(replicas,term){ this.replicas=replicas; this.term=term; }
  async append(entry,reachable=this.replicas){
    const acks=(await Promise.all(this.replicas.map(async r=>{
      if(!reachable.includes(r)) return false;
      await sleep(rnd(4));
      return r.append(this.term,entry);
    }))).filter(Boolean).length;
    if(acks*2>this.replicas.length) this.#commitIndex++;       // majority ack -> committed
    return {acks,committed:this.#commitIndex};
  }
  get commitIndex(){ return this.#commitIndex; }
}

/* ---- saga: local steps + compensations, undone in reverse ---- */
class Saga{
  #steps=[];
  step(name,action,compensate){ this.#steps.push({name,action,compensate}); return this; }
  async run(log=[]){
    const done=[];
    for(const s of this.#steps){
      try{ await s.action(); log.push("ok:"+s.name); done.push(s); }
      catch(e){
        for(const d of done.reverse()){ await d.compensate(); log.push("undo:"+d.name); }
        return {ok:false,log};
      }
    }
    return {ok:true,log};
  }
}

/* ---- two-phase commit ---- */
async function twoPhaseCommit(participants){
  const votes=await Promise.all(participants.map(p=>p.prepare()));   // phase 1: everyone votes
  if(votes.every(v=>v==="yes")){
    await Promise.all(participants.map(p=>p.commit()));              // phase 2: all commit
    return "committed";
  }
  await Promise.all(participants.map(p=>p.abort()));                 // any "no" aborts everyone
  return "aborted";
}

/* ---- gossip: rumor spreads fanout-wise per round ---- */
function gossipRounds(n,fanout){
  const infected=new Set([0]);
  let rounds=0;
  while(infected.size<n && rounds<20){
    rounds++;
    for(const i of [...infected]){
      for(let k=1;k<=fanout;k++) infected.add((i+k*rounds)%n);       // deterministic peer pick
    }
  }
  return {rounds,infected:infected.size};
}

/* ---- resilience toolkit ---- */
async function retryBackoff(fn,{tries=4,base=8,cap=1000,jitter=false,wait=sleep,random=Math.random}={}){
  let attempt=0;
  for(;;){
    try{ return await fn(); }
    catch(err){
      if(++attempt>=tries) throw err;
      const ceiling=Math.min(cap, base*2**(attempt-1));              // exponential, capped
      await wait(jitter ? Math.floor(random()*ceiling) : ceiling);   // full jitter: uniform in [0, ceiling)
    }
  }
}
class CircuitBreaker{
  #state="closed"; #fails=0; #openedAt=0;
  constructor({threshold=3,cooldown=50,now=Date.now}={}){ this.threshold=threshold; this.cooldown=cooldown; this.now=now; }
  get state(){ return this.#state; }
  async call(fn){
    if(this.#state==="open"){
      if(this.now()-this.#openedAt<this.cooldown) throw new Error("open — fast fail");
      this.#state="half-open";                                 // cooldown elapsed: let ONE probe through
    }
    try{
      const v=await fn();
      this.#state="closed"; this.#fails=0;                     // success closes and resets the count
      return v;
    }catch(err){
      this.#fails++;
      if(this.#state==="half-open"||this.#fails>=this.threshold){ this.#state="open"; this.#openedAt=this.now(); }
      throw err;
    }
  }
}
function hedged(taskFactory,hedgeAfter){
  return new Promise((resolve,reject)=>{
    let settled=false, pending=0, lastErr=null;
    const attempt=(which)=>{
      pending++;
      taskFactory(which).then(
        v=>{ if(!settled){ settled=true; resolve({value:v,by:which}); } },
        e=>{ lastErr=e; if(--pending===0&&!settled){ settled=true; reject(lastErr); } });
    };
    attempt("primary");
    sleep(hedgeAfter).then(()=>{ if(!settled) attempt("hedge"); });   // slow? place a second bet
    // note: pending never hits 0 while the hedge timer might still fire — primary rejection
    // before the hedge starts is covered because attempt("hedge") only runs if !settled,
    // and a pre-hedge failure leaves pending===0 only after the timer decides.
  });
}
function makeDeadline(budgetMs,now=Date.now){
  const at=now()+budgetMs;
  return { remaining:()=>Math.max(0,at-now()), expired:()=>now()>=at };
}
async function callWithDeadline(deadline,defaultTimeout,work){
  const allow=Math.min(defaultTimeout,deadline.remaining());   // pass the REMAINING budget down, not a fresh timeout
  if(allow<=0) throw new Error("deadline exceeded before the call");
  const r=await Promise.race([work(allow),sleep(allow).then(()=>({timedOut:true}))]);
  if(r&&r.timedOut) throw new Error("deadline exceeded");
  return r;
}
class Bulkhead{
  #inflight=0; #queue=[];
  constructor(limit,maxQueue=0){ this.limit=limit; this.maxQueue=maxQueue; }
  async run(fn){
    if(this.#inflight>=this.limit){
      if(this.#queue.length>=this.maxQueue) throw new Error("rejected — bulkhead full");
      const d=deferred(); this.#queue.push(d); await d.promise;
    }
    this.#inflight++;
    try{ return await fn(); }
    finally{
      this.#inflight--;
      const n=this.#queue.shift(); if(n) n.resolve();
    }
  }
}
function firstN(taskFns,need){
  return new Promise((resolve,reject)=>{
    const wins=[]; let fails=0;
    taskFns.forEach((fn)=>Promise.resolve().then(fn).then(
      v=>{ wins.push(v); if(wins.length===need) resolve(wins.slice()); },       // resolve at the Nth success
      ()=>{ if(++fails>taskFns.length-need) reject(new Error("quorum impossible")); }));
  });
}

/* ===========================================================
   DEMOS  -> return {lines:[{t}], pass:boolean, verdict}
   =========================================================== */
async function demoLamport(){
  const A=new LamportClock(), B=new LamportClock();
  A.tick();                              // A: local event        -> A=1
  const m1=A.stamp();                    // A sends (stamp 2)     -> A=2
  B.tick(); B.tick(); B.tick();          // B: three local events -> B=3
  const atRecv=B.recv(m1);               // B receives A's 2      -> max(3,2)+1 = 4
  const m2=B.stamp();                    // B replies (stamp 5)
  const back=A.recv(m2);                 // A: max(2,5)+1 = 6
  const pass=atRecv===4 && back===6;
  return {lines:[
    {t:`A ticks to 2, sends msg stamped 2`},
    {t:`B is already at 3; on receive: max(3,2)+1 = ${atRecv}`},
    {t:`B replies stamped 5; A merges: max(2,5)+1 = ${back}`},
  ], pass, verdict:pass?"every receive lands after its send — happened-before is preserved":`recv=${atRecv} back=${back}`};
}
async function demoVClock(){
  const A=new VectorClock(0,2), B=new VectorClock(1,2);
  const a1=A.tick();                     // A: [1,0]
  const b1=B.tick();                     // B: [0,1]  — concurrent with a1
  const m=A.stamp();                     // A: [2,0]
  const b2=B.recv(m);                    // B: max([0,1],[2,0])+self = [2,2]
  const rel1=vcCompare(a1,b1), rel2=vcCompare(m,b2);
  const pass=rel1==="concurrent" && rel2==="before";
  return {lines:[
    {t:`A=[1,0] vs B=[0,1] → ${rel1}`},
    {t:`A sends [2,0]; B merges to [${b2.join(",")}]`},
    {t:`[2,0] vs [${b2.join(",")}] → ${rel2}`},
  ], pass, verdict:pass?"vector clocks detect concurrency Lamport clocks can't":`rel1=${rel1} rel2=${rel2}`};
}
async function demoQuorum(){
  // N=3, W=2, R=2 — overlap guaranteed even with one replica down
  const reps=[new Replica("A"),new Replica("B"),new Replica("C")];
  const store=new QuorumStore(reps,2,2);
  reps[1].up=false;                                  // B is down during the write
  const w=await store.put("cart","v1");              // A + C ack
  reps[1].up=true;                                   // B comes back — stale
  reps[0].up=false;                                  // and A (which HAS the write) goes away
  const r=await store.get("cart");                   // read hits B (stale) + C (fresh)
  const pass=w.acks===2 && r && r.value==="v1";
  return {lines:[
    {t:`write with B down: ${w.acks}/3 acks (W=2) — accepted`},
    {t:`read with A down: replies from stale B + fresh C`},
    {t:`newest version wins → "${r&&r.value}"`},
  ], pass, verdict:pass?"R+W>N forced the read to overlap the write — no stale answer possible":`acks=${w.acks} read=${r&&r.value}`};
}
async function demoHeartbeat(){
  const fd=new FailureDetector(30);                  // suspect after 30ms of silence
  let now=0;
  fd.beat("node-2",now);
  now=20;  const at20=fd.status("node-2",now);       // 20ms silent — still alive
  fd.beat("node-2",now);
  now=60;  const at60=fd.status("node-2",now);       // 40ms silent — suspect
  const pass=at20==="alive" && at60==="suspect";
  return {lines:[
    {t:`t=20: last beat 20ms ago → ${at20}`},
    {t:`t=60: last beat 40ms ago → ${at60}`},
    {t:`(suspect, not dead — a slow node looks identical)`},
  ], pass, verdict:pass?"silence past the timeout means SUSPECT — certainty is not on the menu":`at20=${at20} at60=${at60}`};
}
async function demoLease(){
  const lease=new LeaseServer(), store=new FencedStore();
  const t1=lease.acquire("A",0,50);                  // A holds token 1 until t=50
  // A stalls (GC pause). Lease expires. B takes over with token 2.
  const t2=lease.acquire("B",60,50);
  const bWrote=store.write(t2,"B","order-42");
  const aWrote=store.write(t1,"A","order-42");       // A wakes up and tries with its old token
  const pass=t1===1 && t2===2 && bWrote===true && aWrote===false;
  return {lines:[
    {t:`A acquires lease, fencing token ${t1}`},
    {t:`A pauses; lease expires; B acquires token ${t2} and writes → ${bWrote}`},
    {t:`A wakes, writes with stale token ${t1} → ${aWrote?"ACCEPTED (!)":"rejected"}`},
  ], pass, verdict:pass?"the fencing token turned a split brain into a no-op":`t1=${t1} t2=${t2} b=${bWrote} a=${aWrote}`};
}
async function demoIdempotency(){
  // the same charge message delivered twice (ack was lost, sender retried)
  let naive=0;
  const dupes=[{id:"chg-1"},{id:"chg-2"},{id:"chg-1"}];        // chg-1 arrives twice
  dupes.forEach(()=>naive++);
  const c=new IdempotentConsumer();
  const results=dupes.map(m=>c.handle(m));
  const pass=naive===3 && c.applied===2 && results.join(",")==="true,true,false";
  return {lines:[
    {t:`3 deliveries (chg-1 twice — its ack was lost)`},
    {t:`naive counter applied ${naive} charges`},
    {t:`idempotent consumer applied ${c.applied} (duplicate dropped)`},
  ], pass, verdict:pass?"at-least-once delivery + idempotent receiver = effectively once":`naive=${naive} applied=${c.applied}`};
}
async function demoHashRing(){
  const keys=Array.from({length:60},(_,i)=>"user-"+i);
  const ring=new HashRing(["n1","n2","n3","n4"]);
  const before=new Map(keys.map(k=>[k,ring.owner(k)]));
  ring.remove("n3");
  const movedRing=keys.filter(k=>ring.owner(k)!==before.get(k)).length;
  // versus mod-N placement
  const nodes=["n1","n2","n3","n4"];
  const modBefore=new Map(keys.map(k=>[k,nodes[fnv1a(k)%4]]));
  const rest=["n1","n2","n4"];
  const movedMod=keys.filter(k=>rest[fnv1a(k)%3]!==modBefore.get(k)).length;
  const pass=movedRing>0 && movedRing<=keys.length/2 && movedMod>movedRing;
  return {lines:[
    {t:`60 keys on 4 nodes; n3 leaves`},
    {t:`consistent hashing moved ${movedRing} keys (~1/N)`},
    {t:`hash % N moved ${movedMod} keys — almost everything reshuffles`},
  ], pass, verdict:pass?`ring: ${movedRing} moved · mod-N: ${movedMod} moved — the ring only remaps the lost node's arc`:`ring=${movedRing} mod=${movedMod}`};
}
async function demoElection(){
  const nodes=[1,2,3,4,5].map(id=>({id,up:true}));
  nodes[4].up=false;                                 // leader 5 dies
  const e1=electLeader(nodes,1);
  nodes[2].up=false; nodes[3].up=false;              // partition: only 1 and 2 reachable
  const e2=electLeader(nodes,e1.term);
  const pass=e1.leader===4 && e1.votes===4 && e2.leader===null;
  return {lines:[
    {t:`5 nodes, leader 5 dies → node ${e1.leader} elected, term ${e1.term}, ${e1.votes}/5 votes`},
    {t:`partition leaves 2 of 5 reachable → ${e2.leader===null?"NO leader (no majority)":"leader "+e2.leader}`},
  ], pass, verdict:pass?"a leader needs a majority — a minority side stays leaderless on purpose":`e1=${e1.leader} e2=${e2.leader}`};
}
async function demoReadRepair(){
  const reps=[new Replica("A"),new Replica("B"),new Replica("C")];
  const store=new QuorumStore(reps,2,3);
  reps[2].up=false;                                  // C misses the write
  await store.put("profile","v2");
  reps[2].up=true;
  const stale=reps[2].peek("profile");
  const r=await store.getRepair("profile");          // read all 3, repair the laggard
  await sleep(8);
  const fixed=reps[2].peek("profile");
  const pass=stale===null && r.value==="v2" && fixed && fixed.value==="v2";
  return {lines:[
    {t:`C missed the write (had: ${stale?stale.value:"nothing"})`},
    {t:`quorum read returns "${r.value}" and writes it back to C`},
    {t:`C now has: ${fixed&&fixed.value}`},
  ], pass, verdict:pass?"the read noticed the stale replica and healed it in passing":`stale=${stale} fixed=${fixed&&fixed.value}`};
}
async function demoGossip(){
  const {rounds,infected}=gossipRounds(16,2);
  const pass=infected===16 && rounds<=5;
  return {lines:[
    {t:`rumor starts at 1 of 16 nodes, fanout 2`},
    {t:`round by round the infected set compounds`},
    {t:`all 16 reached in ${rounds} rounds (log-ish, not linear)`},
  ], pass, verdict:pass?`epidemic spread: ${rounds} rounds for 16 nodes — O(log N), no coordinator`:`rounds=${rounds} infected=${infected}`};
}
async function demoLogCommit(){
  const reps=[new LogReplica(),new LogReplica(),new LogReplica()];
  const leader=new LogLeader(reps,2);
  const r1=await leader.append("set x=1",[reps[0],reps[1]]);   // one follower unreachable
  const stale=new LogLeader(reps,1);                           // deposed leader, old term
  const r2=await stale.append("set x=99");                     // only the laggard (never saw term 2) accepts
  const pass=r1.acks===2 && r1.committed===0 && r2.acks===1 && r2.committed===-1;
  return {lines:[
    {t:`term-2 leader appends: ${r1.acks}/3 acks → committed (majority)`},
    {t:`deposed term-1 leader appends: ${r2.acks}/3 acks — only the replica that never saw term 2`},
    {t:`1/3 is no majority: the zombie can scrape an ack, but it can never COMMIT`},
  ], pass, verdict:pass?"commit = majority ack; any majority overlaps the new term and rejects the zombie":`r1=${r1.acks}/${r1.committed} r2=${r2.acks}/${r2.committed}`};
}
async function demoSaga(){
  const log=[];
  const saga=new Saga()
    .step("reserve-flight", async()=>{}, async()=>{})
    .step("reserve-hotel",  async()=>{}, async()=>{})
    .step("charge-card",    async()=>{ throw new Error("card declined"); }, async()=>{});
  const r=await saga.run(log);
  const pass=!r.ok && log.join("|")==="ok:reserve-flight|ok:reserve-hotel|undo:reserve-hotel|undo:reserve-flight";
  return {lines:[
    {t:`flight ✓ · hotel ✓ · charge ✗ (declined)`},
    {t:log.join("  →  ")},
  ], pass, verdict:pass?"compensations ran in REVERSE order — unwind the stack you built":log.join(",")};
}
async function demoTwoPhase(){
  const mk=(vote)=>{ const p={vote,state:"init",prepare:async()=>{p.state="prepared";return p.vote;},commit:async()=>{p.state="committed";},abort:async()=>{p.state="aborted";}}; return p; };
  const all=[mk("yes"),mk("yes"),mk("yes")];
  const r1=await twoPhaseCommit(all);
  const mixed=[mk("yes"),mk("no"),mk("yes")];
  const r2=await twoPhaseCommit(mixed);
  const noPartial=mixed.every(p=>p.state==="aborted");
  const pass=r1==="committed" && r2==="aborted" && noPartial;
  return {lines:[
    {t:`all vote yes → ${r1}`},
    {t:`one votes no → ${r2}; states: ${mixed.map(p=>p.state).join(", ")}`},
  ], pass, verdict:pass?"atomic across nodes: everyone commits or everyone aborts — never a mix":`r1=${r1} r2=${r2}`};
}
async function demoOutbox(){
  // dual write: DB commit succeeds, then the process dies before publishing
  const db=[]; const bus=[];
  const dualWrite=(order)=>{ db.push(order); /* CRASH here */ };
  dualWrite("order-1");
  const lostEvents=db.length-bus.length;
  // outbox: the event is part of the SAME transaction; a relay publishes later
  const db2=[]; const outbox=[]; const bus2=[];
  const withOutbox=(order)=>{ db2.push(order); outbox.push({event:"created:"+order,sent:false}); /* CRASH here */ };
  withOutbox("order-1");
  // ...process restarts; the relay drains the outbox
  outbox.filter(e=>!e.sent).forEach(e=>{ bus2.push(e.event); e.sent=true; });
  const pass=lostEvents===1 && bus2.length===1 && bus2[0]==="created:order-1";
  return {lines:[
    {t:`dual write + crash: DB has the order, bus has ${bus.length} events — they disagree forever`},
    {t:`outbox + crash: event was committed WITH the order; relay publishes after restart`},
    {t:`bus finally has: ${bus2[0]}`},
  ], pass, verdict:pass?"one transaction, one truth — the relay turns it into an event, eventually":`lost=${lostEvents} bus2=${bus2.length}`};
}
async function demoSplitBrain(){
  const store=new FencedStore(); const lease=new LeaseServer();
  const tOld=lease.acquire("A",0,50);
  store.write(tOld,"A","w1");                        // A is legitimately leader
  const tNew=lease.acquire("B",100,50);              // A's lease lapsed; B elected
  store.write(tNew,"B","w2");
  const zombie=store.write(tOld,"A","w3");           // A never noticed — writes anyway
  const pass=zombie===false && store.log.join(",")==="A:w1,B:w2";
  return {lines:[
    {t:`A leads with token ${tOld}, writes w1`},
    {t:`A stalls; B leads with token ${tNew}, writes w2`},
    {t:`zombie A writes w3 with token ${tOld} → ${zombie?"ACCEPTED (!)":"fenced out"}`},
    {t:`store log: ${store.log.join(" · ")}`},
  ], pass, verdict:pass?"two nodes believed they were leader; the token made only one of them right":`log=${store.log.join(",")}`};
}
async function demoDLQ(){
  const dlq=[]; const processed=[]; const MAX=3;
  const queue=[{id:"m1"},{id:"poison"},{id:"m2"}].map(m=>({...m,attempts:0}));
  const handle=async(m)=>{ if(m.id==="poison") throw new Error("unparseable"); processed.push(m.id); };
  while(queue.length){
    const m=queue.shift();
    try{ await handle(m); }
    catch(e){
      if(++m.attempts>=MAX) dlq.push(m.id);          // park it — stop poisoning the stream
      else queue.push(m);                            // retry later, behind the others
    }
  }
  const pass=processed.join(",")==="m1,m2" && dlq.join(",")==="poison";
  return {lines:[
    {t:`m1 ✓ · poison ✗×${MAX} → dead-letter queue · m2 ✓`},
    {t:`processed: [${processed.join(", ")}] · DLQ: [${dlq.join(", ")}]`},
  ], pass, verdict:pass?"bounded retries + a parking lot — one bad message can't stall the stream":`processed=${processed} dlq=${dlq}`};
}
async function demoBackoff(){
  let calls=0; const flaky=async()=>{ if(++calls<3) throw new Error("503"); return "ok"; };
  const delays=[]; const wait=async(ms)=>{ delays.push(ms); };
  const r=await retryBackoff(flaky,{tries:5,base:8,wait});
  const plain=delays.slice();
  calls=0; delays.length=0;
  await retryBackoff(flaky,{tries:5,base:8,jitter:true,wait,random:()=>0.5});
  const pass=r==="ok" && plain.join(",")==="8,16" && delays.join(",")==="4,8";
  return {lines:[
    {t:`fails twice, succeeds on attempt 3`},
    {t:`exponential: waited ${plain.join("ms, ")}ms`},
    {t:`full jitter (r=0.5): waited ${delays.join("ms, ")}ms — every client picks a different moment`},
  ], pass, verdict:pass?"backoff spreads attempts over time; jitter spreads clients apart":`plain=${plain} jit=${delays}`};
}
async function demoCircuitBreaker(){
  let clock=0; const now=()=>clock;
  let hits=0; let healthy=false;
  const dep=async()=>{ hits++; if(!healthy) throw new Error("timeout"); return "data"; };
  const cb=new CircuitBreaker({threshold:3,cooldown:50,now});
  for(let i=0;i<3;i++) await cb.call(dep).catch(()=>{});
  const opened=cb.state;
  const hitsBefore=hits;
  clock=10; await cb.call(dep).catch(()=>{});        // inside cooldown — must NOT touch the dependency
  const fastFailed=hits===hitsBefore;
  clock=100; healthy=true;
  const probe=await cb.call(dep).catch(e=>"err");    // half-open probe succeeds
  const pass=opened==="open" && fastFailed && probe==="data" && cb.state==="closed";
  return {lines:[
    {t:`3 failures → breaker ${opened}`},
    {t:`call during cooldown: dependency touched? ${fastFailed?"no — failed fast":"yes (!)"}`},
    {t:`after cooldown: probe succeeds → ${cb.state}`},
  ], pass, verdict:pass?"open = stop hammering a dying dependency; half-open = one careful probe":`state=${cb.state} fastFail=${fastFailed}`};
}
async function demoHedge(){
  const t0=Date.now();
  const attempt=(which)=> which==="primary" ? sleep(80).then(()=>"slow-reply") : sleep(10).then(()=>"fast-reply");
  const r=await hedged(attempt,15);
  const ms=Date.now()-t0;
  const pass=r.by==="hedge" && ms<70;
  return {lines:[
    {t:`primary is having a bad day (80ms); hedge fires at 15ms`},
    {t:`winner: ${r.by} in ~${ms}ms (vs 80ms un-hedged)`},
  ], pass, verdict:pass?"the second bet clipped the tail — p99 is why hedging exists":`by=${r.by} ms=${ms}`};
}
async function demoTimeoutBudget(){
  let clock=0; const now=()=>clock;
  const deadline=makeDeadline(50,now);
  clock=35;                                          // service A burned 35ms of the budget
  const rem=deadline.remaining();
  const allow=Math.min(40,rem);                      // B's default timeout is 40 — but only 15 remain
  clock=55;
  const expired=deadline.expired();
  const pass=rem===15 && allow===15 && expired===true;
  return {lines:[
    {t:`edge gives the request a 50ms budget`},
    {t:`service A used 35ms → B is offered ${rem}ms, not its default 40ms`},
    {t:`t=55: budget spent — every hop can stop work the caller already gave up on`},
  ], pass, verdict:pass?"pass the REMAINING budget down, or inner calls outlive the caller's patience":`rem=${rem} allow=${allow}`};
}
async function demoBulkhead(){
  const slowPool=new Bulkhead(2,1);                  // 2 in flight + 1 queued for the slow dependency
  let inflight=0, peak=0;
  const slowDep=async()=>{ inflight++; peak=Math.max(peak,inflight); await sleep(25); inflight--; return "ok"; };
  const results=await Promise.allSettled([1,2,3,4,5].map(()=>slowPool.run(slowDep)));
  const okCount=results.filter(r=>r.status==="fulfilled").length;
  const rejected=results.filter(r=>r.status==="rejected").length;
  const fast=await (async()=>"instant")();           // the rest of the service is untouched
  const pass=peak===2 && okCount===3 && rejected===2 && fast==="instant";
  return {lines:[
    {t:`5 calls hit a slow dependency behind a bulkhead of 2 (+1 queued)`},
    {t:`peak in flight: ${peak} · served: ${okCount} · rejected instantly: ${rejected}`},
    {t:`fast path still answered: "${fast}"`},
  ], pass, verdict:pass?"the slow dependency drowned alone — it couldn't take the whole service down":`peak=${peak} ok=${okCount} rej=${rejected}`};
}
async function demoFanout(){
  const t0=Date.now();
  const replicas=[
    ()=>sleep(8).then(()=>"r1"),
    ()=>sleep(12).then(()=>"r2"),
    ()=>sleep(10).then(()=>{ throw new Error("replica down"); }),
    ()=>sleep(90).then(()=>"r4"),                    // the straggler
    ()=>sleep(14).then(()=>"r5"),
  ];
  const got=await firstN(replicas,3);
  const ms=Date.now()-t0;
  const pass=got.length===3 && ms<70;
  return {lines:[
    {t:`5 replicas queried, one down, one straggling at 90ms`},
    {t:`quorum of 3 assembled in ~${ms}ms — nobody waited for the straggler`},
  ], pass, verdict:pass?"resolve at the Nth success: the tail can't hold the answer hostage":`n=${got.length} ms=${ms}`};
}

/* ===========================================================
   CONTENT
   =========================================================== */
