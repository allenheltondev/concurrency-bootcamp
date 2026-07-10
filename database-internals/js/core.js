/* Database Internals Bootcamp — core: tiny helpers, reference implementations,
   and the demo runners that power every "run reference" button. Loaded first.

   Everything here is a real storage-engine or transaction mechanism simulated
   in-process: "the disk" is an array with an fsync boundary, "a page" is an
   object, "a transaction id" is an integer, "replication" is a log with a
   replay position. The physics are the point — a crash erases everything that
   wasn't fsynced, snapshots hide concurrent commits, lock queues really queue —
   deterministic enough that every demo's invariant check always holds. */
"use strict";

/* ---------- tiny helpers available to demos ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const rnd = (n) => Math.floor(Math.random()*n);

/* ===========================================================
   REFERENCE IMPLEMENTATIONS  (these power the Run buttons)
   =========================================================== */

/* ---- the disk that can fail between any two writes ---- */
class SimDisk{
  constructor(){ this.durable=[]; this.buffered=[]; }
  append(rec){ this.buffered.push(rec); }                      // sits in the OS write cache
  fsync(){ this.durable.push(...this.buffered); this.buffered=[]; }
  crash(){ this.buffered=[]; return this.durable.slice(); }    // power loss: unsynced bytes vanish
}

/* ---- the write-ahead log: append + fsync BEFORE ack; data pages later ---- */
class WALStore{
  constructor(){ this.disk=new SimDisk(); this.pages=new Map(); this.acked=[]; }
  commit(txid, writes){                                        // writes = [{key,val}]
    for(const w of writes) this.disk.append({txid,key:w.key,val:w.val});
    this.disk.append({txid,commit:true});
    this.disk.fsync();                                         // THE durability point
    this.acked.push(txid);                                     // ack only after fsync
    for(const w of writes) this.pages.set(w.key,w.val);        // data pages: whenever
  }
}
// recovery: replay the log; a tx with no commit record never happened
function walRecover(records){
  const committed=new Set(records.filter(r=>r.commit).map(r=>r.txid));
  const state=new Map();
  for(const r of records)
    if(!r.commit && committed.has(r.txid)) state.set(r.key,r.val);
  return state;
}
// checkpointed recovery: start from the snapshot, replay only the tail
function recoverFromCheckpoint(checkpoint, tail){
  const state=new Map(checkpoint||[]);
  const committed=new Set(tail.filter(r=>r.commit).map(r=>r.txid));
  for(const r of tail)
    if(!r.commit && committed.has(r.txid)) state.set(r.key,r.val);
  return state;
}

/* ---- B-tree leaf: sorted insert; a full leaf splits ---- */
function leafInsert(leaf, key, order){                         // returns null or {sep, right}
  let i=leaf.keys.findIndex(k=>k>key);
  if(i===-1) leaf.keys.push(key); else leaf.keys.splice(i,0,key);
  if(leaf.keys.length<=order) return null;
  const mid=Math.ceil(leaf.keys.length/2);
  const right={keys:leaf.keys.slice(mid)};
  leaf.keys=leaf.keys.slice(0,mid);
  return {sep:right.keys[0], right};                           // separator routes k >= sep right
}

/* ---- LSM: memtable -> immutable SSTables; reads probe newest-first ---- */
const TOMBSTONE="__tombstone__";
class LSM{
  constructor(flushAt=3){ this.flushAt=flushAt; this.memtable=new Map(); this.sstables=[]; }
  put(k,v){ this.memtable.set(k,v); if(this.memtable.size>=this.flushAt) this.flush(); }
  del(k){ this.put(k,TOMBSTONE); }
  flush(){ if(this.memtable.size===0) return; this.sstables.unshift(new Map(this.memtable)); this.memtable.clear(); }
  get(k){
    if(this.memtable.has(k)) return this.memtable.get(k)===TOMBSTONE?undefined:this.memtable.get(k);
    for(const t of this.sstables)                              // index 0 = newest; first hit wins
      if(t.has(k)) return t.get(k)===TOMBSTONE?undefined:t.get(k);
    return undefined;
  }
}

/* ---- bloom filter: "definitely not here" with zero I/O ---- */
function bloomHash(key, seed){
  let h=2166136261^seed;
  for(let i=0;i<key.length;i++){ h^=key.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
class BloomFilter{
  constructor(m=64,k=3){ this.m=m; this.k=k; this.bits=new Array(m).fill(0); }
  add(key){ for(let i=0;i<this.k;i++) this.bits[bloomHash(key,i)%this.m]=1; }
  mightContain(key){                                           // ALL k bits — or it isn't there
    for(let i=0;i<this.k;i++) if(!this.bits[bloomHash(key,i)%this.m]) return false;
    return true;
  }
}

/* ---- MVCC visibility: the snapshot decides, not read time ----
   snapshot = { xmax: first xid NOT yet assigned at snapshot time,
                inProgress: Set of xids running at snapshot time }
   status   = Map xid -> "committed" | "aborted" | "in-progress"           */
function xidVisible(xid, snap, status){
  return xid!=null
      && status.get(xid)==="committed"
      && xid < snap.xmax                                       // started before my snapshot
      && !snap.inProgress.has(xid);                            // and wasn't still running
}
function versionVisible(v, snap, status){
  if(!xidVisible(v.xmin, snap, status)) return false;          // creator must be visibly committed
  if(v.xmax==null) return true;                                // never deleted
  return !xidVisible(v.xmax, snap, status);                    // deleter invisible -> still alive
}
function readVisible(versions, snap, status){                  // newest visible version wins
  for(let i=versions.length-1;i>=0;i--)
    if(versionVisible(versions[i],snap,status)) return versions[i].value;
  return undefined;
}

/* ---- row locks: FIFO queue with direct hand-off ---- */
class LockManager{
  constructor(){ this.locks=new Map(); }                       // row -> {holder, queue:[{tx,d}]}
  acquire(tx,row){
    const l=this.locks.get(row);
    if(!l){ this.locks.set(row,{holder:tx,queue:[]}); return Promise.resolve(); }
    if(l.holder===tx) return Promise.resolve();
    const d=deferred(); l.queue.push({tx,d}); return d.promise;
  }
  release(tx,row){
    const l=this.locks.get(row);
    if(!l||l.holder!==tx) return;
    const next=l.queue.shift();
    if(next){ l.holder=next.tx; next.d.resolve(); }            // hand-off: never observably free
    else this.locks.delete(row);
  }
  holderOf(row){ const l=this.locks.get(row); return l?l.holder:null; }
  queueOf(row){ const l=this.locks.get(row); return l?l.queue.map(w=>w.tx):[]; }
}

/* ---- deadlock detection: find a cycle in the wait-for graph ---- */
function findCycle(waitFor){                                   // Map tx -> tx it waits for
  for(const start of waitFor.keys()){
    const seen=new Set([start]); const path=[start];
    let cur=waitFor.get(start);
    while(cur!=null){
      path.push(cur);
      if(cur===start) return path;                             // closed the loop
      if(seen.has(cur)) break;                                 // merged into another chain
      seen.add(cur);
      cur=waitFor.get(cur);
    }
  }
  return null;
}

/* ---- optimistic concurrency: version-column compare-and-set ---- */
class VersionedTable{
  constructor(){ this.rows=new Map(); }
  insert(id,value){ this.rows.set(id,{value,version:1}); }
  get(id){ const r=this.rows.get(id); return r?{value:r.value,version:r.version}:null; }
  casUpdate(id, expectedVersion, value){                       // UPDATE … WHERE version = $2
    const r=this.rows.get(id);
    if(!r||r.version!==expectedVersion) return 0;              // 0 rows matched — you lost the race
    r.value=value; r.version++;
    return 1;
  }
}
async function withCasRetry(table,id,fn,max=5){
  for(let a=1;a<=max;a++){
    const row=table.get(id);                                   // fresh read EVERY attempt
    if(table.casUpdate(id,row.version,fn(row.value))===1) return a;
  }
  throw new Error("cas: contention exhausted retries");
}

/* ---- a tiny two-account ledger under three isolation levels ----
   Committed state + snapshot copies; first-updater-wins conflict check at
   snapshot/serializable; a simplified SSI check (mutual rw-antidependency)
   at serializable. The sim module drives this same model interactively.  */
function makeLedger(init){ return { rows:new Map(Object.entries(init).map(([k,v])=>[k,{value:v,version:1}])), committed:[] }; }
function ledgerBegin(db, level){
  const snap=new Map(); for(const [k,r] of db.rows) snap.set(k,{value:r.value,version:r.version});
  // startCommits: how much committed history predates this tx — SSI only
  // considers transactions that OVERLAP in time, never the settled past
  return { level, snap, reads:new Set(), writes:new Map(), status:"active", startCommits:db.committed.length };
}
function ledgerRead(db, tx, key){
  if(tx.writes.has(key)) return tx.writes.get(key);            // your own write
  tx.reads.add(key);
  if(tx.level==="read committed") return db.rows.get(key).value;   // fresh per statement
  return tx.snap.get(key).value;                               // snapshot: the stable past
}
function ledgerWrite(tx, key, value){ tx.writes.set(key,value); }
function ledgerCommit(db, tx){
  if(tx.level!=="read committed"){
    for(const key of tx.writes.keys())
      if(db.rows.get(key).version!==tx.snap.get(key).version){ // someone committed under you
        tx.status="aborted";
        return {ok:false,code:"40001",reason:"could not serialize access due to concurrent update on "+key};
      }
  }
  if(tx.level==="serializable"){
    for(const other of db.committed.slice(tx.startCommits)){   // simplified SSI: mutual rw-antidependency, concurrent txs only
      const iReadTheirWrite=[...tx.reads].some(k=>other.writes.has(k));
      const theyReadMyWrite=[...other.reads].some(k=>tx.writes.has(k));
      if(iReadTheirWrite&&theyReadMyWrite){
        tx.status="aborted";
        return {ok:false,code:"40001",reason:"could not serialize access due to read/write dependencies"};
      }
    }
  }
  for(const [k,v] of tx.writes){ const r=db.rows.get(k); r.value=v; r.version++; }
  tx.status="committed";
  db.committed.push({reads:tx.reads,writes:tx.writes});
  return {ok:true};
}

/* ---- connection pool: FIFO waiters, hand-off on release ---- */
class Pool{
  constructor(size){ this.idle=Array.from({length:size},(_,i)=>"conn"+(i+1)); this.waiters=[]; this.peakWaiting=0; }
  acquire(){
    if(this.idle.length) return Promise.resolve(this.idle.pop());
    const d=deferred(); this.waiters.push(d);
    this.peakWaiting=Math.max(this.peakWaiting,this.waiters.length);
    return d.promise;
  }
  release(conn){
    const w=this.waiters.shift();
    if(w) w.resolve(conn);                                     // hand-off — never touches idle
    else this.idle.push(conn);
  }
}

/* ---- async replication: a primary log and a lagging replica ---- */
class ReplicaPair{
  constructor(){ this.lsn=0; this.log=[]; this.primary=new Map(); this.replica=new Map(); this.replayed=0; }
  write(key,val){ this.lsn++; this.log.push({lsn:this.lsn,key,val}); this.primary.set(key,val); return this.lsn; }
  replay(n=1){ for(let i=0;i<n&&this.replayed<this.log.length;i++){ const r=this.log[this.replayed++]; this.replica.set(r.key,r.val); } }
  replicaLsn(){ return this.replayed? this.log[this.replayed-1].lsn : 0; }
  readReplica(key){ return this.replica.get(key); }
  readPrimary(key){ return this.primary.get(key); }
}
// route the read: replica only if it has replayed past what this session wrote
function readYourWrites(pair, sessionLsn, key){
  if(pair.replicaLsn()>=sessionLsn) return {from:"replica",value:pair.readReplica(key)};
  return {from:"primary",value:pair.readPrimary(key)};
}

/* ===========================================================
   DEMOS  -> return {lines:[{t}], pass:boolean, verdict}
   =========================================================== */
async function demoWalWrite(){
  const s=new WALStore();
  s.commit("t1",[{key:"acct:alice",val:40}]);
  s.commit("t2",[{key:"acct:bob",val:205}]);
  s.disk.append({txid:"t3",key:"acct:carol",val:99});          // buffered, never fsynced, never acked
  const survivors=s.disk.crash();                              // power loss before any page flush
  const state=walRecover(survivors);
  const pass=s.acked.length===2
    && state.get("acct:alice")===40 && state.get("acct:bob")===205
    && !state.has("acct:carol");
  return {lines:[
    {t:`t1, t2 commit: append + commit record → fsync → ack (pages still dirty in RAM)`},
    {t:`t3's record sits in the write cache — no fsync, no ack. CRASH.`},
    {t:`replay the durable log → alice=40, bob=205 rebuilt; t3 never happened`},
  ], pass, verdict:pass?"every acked commit survived the crash — durability is the fsynced log, not the data pages":`state=${JSON.stringify([...state])}`};
}
async function demoCrashReplay(){
  const checkpoint=new Map([["acct:alice",100],["acct:bob",100]]);
  const tail=[
    {txid:"t7",key:"acct:alice",val:40},
    {txid:"t7",key:"acct:bob",val:160},
    {txid:"t7",commit:true},
    {txid:"t8",key:"acct:alice",val:0},                        // crash mid-transaction: no commit record
  ];
  const state=recoverFromCheckpoint(checkpoint,tail);
  const total=state.get("acct:alice")+state.get("acct:bob");
  const pass=state.get("acct:alice")===40 && state.get("acct:bob")===160 && total===200;
  return {lines:[
    {t:`recovery starts at the checkpoint snapshot (alice=100, bob=100), not the beginning of time`},
    {t:`t7 has a commit record → both sides of its transfer replay (40 / 160)`},
    {t:`t8 wrote alice=0 then crashed — no commit record → discarded whole`},
  ], pass, verdict:pass?"atomicity out of a log: committed transactions replay entirely, half-finished ones vanish entirely — the invariant (sum 200) held":`alice=${state.get("acct:alice")} bob=${state.get("acct:bob")}`};
}
async function demoBtreeSplit(){
  const leaf={keys:[10,20,30,40]};
  const r=leafInsert(leaf,25,4);                               // order 4: fifth key forces a split
  const sorted=(a)=>a.every((k,i)=>i===0||a[i-1]<k);
  const all=[...leaf.keys,...(r?r.right.keys:[])].sort((a,b)=>a-b).join(",");
  const pass=r!==null && sorted(leaf.keys) && sorted(r.right.keys)
    && r.sep===r.right.keys[0] && leaf.keys.every(k=>k<r.sep)
    && all==="10,20,25,30,40";
  return {lines:[
    {t:`leaf [10,20,30,40] at order 4 — insert 25 → over capacity`},
    {t:`split: left keeps [${leaf.keys}], right takes [${r.right.keys}], separator ${r.sep} goes up to the parent`},
    {t:`parent now routes k ≥ ${r.sep} right — every key still findable, both halves sorted`},
  ], pass, verdict:pass?"the split lost nothing and the separator is the right leaf's first key — the parent can route every future search":`sep=${r&&r.sep}`};
}
async function demoLsmRead(){
  const db=new LSM(2);
  db.put("user:7","v1"); db.put("x","x1");                     // flush #1 (oldest sstable)
  db.put("user:7","v2"); db.put("y","y1");                     // flush #2
  db.put("user:9","fresh");                                    // still in the memtable
  db.del("x");                                                 // tombstone (memtable)
  const pass=db.get("user:7")==="v2" && db.get("y")==="y1"
    && db.get("user:9")==="fresh" && db.get("x")===undefined
    && db.sstables.length===3 && db.sstables[2].get("user:7")==="v1";
  return {lines:[
    {t:`user:7 written twice across flushes — 3 SSTables now hold ${db.sstables.length>2?"v1 in the oldest":""}, v2 above it`},
    {t:`get(user:7) probes memtable → newest table first → returns v2; v1 is shadowed, never read`},
    {t:`get(x) meets a tombstone → gone, even though the old value still sits in an older table`},
  ], pass, verdict:pass?"newest-first with first-hit-wins: overwrites shadow, tombstones delete, and the stale versions wait for compaction":`u7=${db.get("user:7")} x=${db.get("x")}`};
}
async function demoBloom(){
  const f=new BloomFilter(128,3);
  const present=Array.from({length:20},(_,i)=>"user:"+i);
  for(const k of present) f.add(k);
  const falseNeg=present.filter(k=>!f.mightContain(k)).length;
  const absent=Array.from({length:200},(_,i)=>"ghost:"+i);
  const falsePos=absent.filter(k=>f.mightContain(k)).length;
  const pass=falseNeg===0 && falsePos<absent.length/2;
  return {lines:[
    {t:`20 keys added · every one answers "maybe here" — false negatives: ${falseNeg}`},
    {t:`200 absent keys probed · ${falsePos} false positives (${(100*falsePos/absent.length).toFixed(1)}% — wasted probes, not wrong answers)`},
    {t:`the contract: "no" is a guarantee, "maybe" is a hint — so a read can skip an SSTable on "no" with zero risk`},
  ], pass, verdict:pass?"zero false negatives — the filter may cost you a wasted probe, it can never cost you a lost row":`falseNeg=${falseNeg} falsePos=${falsePos}`};
}
async function demoMvccVis(){
  const status=new Map([[5,"committed"],[7,"committed"],[9,"in-progress"]]);
  const versions=[
    {value:100, xmin:5, xmax:7},                               // created by 5, updated away by 7
    {value:70,  xmin:7, xmax:null},                            // current committed version
    {value:0,   xmin:9, xmax:null},                            // uncommitted write by 9
  ];
  const snapBefore7={xmax:10, inProgress:new Set([7,9])};      // taken while 7 was still running
  const snapAfter7 ={xmax:10, inProgress:new Set([9])};        // taken after 7 committed
  const a=readVisible(versions,snapBefore7,status);
  const b=readVisible(versions,snapAfter7,status);
  const pass=a===100 && b===70;
  return {lines:[
    {t:`row versions: 100 (xmin 5, xmax 7) → 70 (xmin 7) → 0 (xmin 9, uncommitted)`},
    {t:`snapshot taken while tx7 ran: 7 is invisible → its delete doesn't count → reads 100`},
    {t:`snapshot taken after tx7 committed: reads 70 · nobody EVER reads tx9's uncommitted 0`},
  ], pass, verdict:pass?"two readers, two consistent pasts, zero blocking — the snapshot decides visibility, not the clock on the wall":`a=${a} b=${b}`};
}
async function demoRowLock(){
  const lm=new LockManager();
  const order=[];
  await lm.acquire("t1","row:42");
  const p2=lm.acquire("t2","row:42").then(()=>order.push("t2"));
  const p3=lm.acquire("t3","row:42").then(()=>order.push("t3"));
  await sleep(0);
  const queuedBefore=lm.queueOf("row:42").join(",");
  lm.release("t1","row:42");
  await p2; await sleep(0);
  const t3StillWaiting=lm.queueOf("row:42").length===1 && lm.holderOf("row:42")==="t2";
  lm.release("t2","row:42");
  await p3;
  const pass=queuedBefore==="t2,t3" && t3StillWaiting && order.join(",")==="t2,t3" && lm.holderOf("row:42")==="t3";
  return {lines:[
    {t:`t1 holds row 42 · t2 then t3 arrive → queue [${queuedBefore}] — nobody spins, they park`},
    {t:`t1 releases → the lock is HANDED to t2 (never observably free); t3 keeps waiting`},
    {t:`grants land strictly FIFO: ${order.join(" → ")}`},
  ], pass, verdict:pass?"UPDATE blocks UPDATE and the queue is fair — exactly what your 'stuck query' is doing while a long transaction holds its row":`order=${order}`};
}
async function demoWaitFor(){
  const cycle=findCycle(new Map([["t1","t2"],["t2","t3"],["t3","t1"]]));
  const chain=findCycle(new Map([["t4","t5"],["t5","t6"]]));
  const merged=findCycle(new Map([["t9","t1"],["t1","t2"],["t2","t1"]]));
  const pass=Array.isArray(cycle) && cycle.includes("t1") && cycle.includes("t2") && cycle.includes("t3")
    && chain===null && Array.isArray(merged);
  return {lines:[
    {t:`t1→t2→t3→t1: cycle detected [${cycle&&cycle.join("→")}] — one victim gets 40P01, the others proceed`},
    {t:`t4→t5→t6: a plain wait chain — long, but it drains; no abort`},
    {t:`a tail feeding into a loop still terminates: detector found [${merged&&merged.join("→")}]`},
  ], pass, verdict:pass?"a deadlock is a cycle in who-waits-for-whom — detection means walking the graph, the cure is aborting one edge and retrying it":`cycle=${cycle}`};
}
async function demoVersionCas(){
  const table=new VersionedTable();
  table.insert("sku:9",{stock:10});
  // two request handlers read the same version...
  const readA=table.get("sku:9"), readB=table.get("sku:9");
  const winA=table.casUpdate("sku:9",readA.version,{stock:readA.value.stock-3});   // 1 row
  const loseB=table.casUpdate("sku:9",readB.version,{stock:readB.value.stock-2});  // 0 rows — version moved
  // ...the loser retries the WHOLE read-compute-write
  const attempts=await withCasRetry(table,"sku:9",v=>({stock:v.stock-2}));
  const final=table.get("sku:9");
  const pass=winA===1 && loseB===0 && attempts===1 && final.value.stock===5 && final.version===3;
  return {lines:[
    {t:`both handlers read {stock:10, version:${readA.version}} — no locks taken, nobody waits`},
    {t:`A's CAS matches version 1 → 1 row · B's CAS still says version 1 → 0 rows, loudly lost`},
    {t:`B re-reads {stock:7, version:2}, retries → stock ${final.value.stock}, version ${final.version} — both decrements landed`},
  ], pass, verdict:pass?"the version column turns a silent lost update into a countable 0-row result — and the retry loop turns that into correctness":`winA=${winA} loseB=${loseB} stock=${final&&final.value.stock}`};
}
async function demoLostUpdate(){
  // naive: both app servers read 100, compute, and write back their own answer
  const naive={balance:100};
  const readA=naive.balance, readB=naive.balance;
  naive.balance=readA-60;                                      // A writes 40
  naive.balance=readB-30;                                      // B overwrites with 70 — A's debit is gone
  // atomic: balance = balance - x re-evaluates against the CURRENT row under the row lock
  const atomic={balance:100};
  atomic.balance=atomic.balance-60;
  atomic.balance=atomic.balance-30;
  const pass=naive.balance===70 && atomic.balance===10;
  return {lines:[
    {t:`two withdrawals, -60 and -30, both read balance 100`},
    {t:`app-computed writes: SET balance = 40, then SET balance = 70 → the -60 debit vanished`},
    {t:`SET balance = balance - $1: the second UPDATE waits for the row lock, re-reads 40, writes 10`},
  ], pass, verdict:pass?"read committed never re-runs YOUR arithmetic — push the computation into the UPDATE (or lock, or CAS) and both debits land":`naive=${naive.balance} atomic=${atomic.balance}`};
}
async function demoWriteSkew(){
  // invariant: checking + savings >= 0 (one account may overdraw if the total covers it)
  function run(level){
    const db=makeLedger({checking:60,savings:60});
    const t1=ledgerBegin(db,level), t2=ledgerBegin(db,level);
    const total1=ledgerRead(db,t1,"checking")+ledgerRead(db,t1,"savings");
    const total2=ledgerRead(db,t2,"checking")+ledgerRead(db,t2,"savings");
    if(total1>=100) ledgerWrite(t1,"checking",ledgerRead(db,t1,"checking")-100);
    if(total2>=100) ledgerWrite(t2,"savings",ledgerRead(db,t2,"savings")-100);
    const r1=ledgerCommit(db,t1);
    let r2=ledgerCommit(db,t2), retried=false;
    if(!r2.ok){                                                // retry re-runs the WHOLE tx, reads included
      retried=true;
      const t2b=ledgerBegin(db,level);
      const total=ledgerRead(db,t2b,"checking")+ledgerRead(db,t2b,"savings");
      if(total>=100){ ledgerWrite(t2b,"savings",ledgerRead(db,t2b,"savings")-100); r2=ledgerCommit(db,t2b); }
      else r2={ok:false,refused:true};
    }
    return {total:db.rows.get("checking").value+db.rows.get("savings").value, r1, r2, retried};
  }
  const snap=run("repeatable read");
  const ser=run("serializable");
  const pass=snap.total===-80 && snap.r1.ok && snap.r2.ok
    && ser.total===20 && ser.retried && ser.r2.refused===true;
  return {lines:[
    {t:`both txs read total 120 ≥ 100, then debit DIFFERENT rows — disjoint writes, overlapping reads`},
    {t:`snapshot isolation: no row was co-written → both commit → total ${snap.total}. The invariant is gone and no error fired.`},
    {t:`serializable: the rw-dependency cycle aborts one tx (40001); the retry re-reads total 20 → refused → total ${ser.total}`},
  ], pass, verdict:pass?"write skew slips through snapshot isolation by design — serializable turns the silent corruption into a loud, retryable abort":`snap=${snap.total} ser=${ser.total}`};
}
async function demoPhantom(){
  // check-then-insert on a predicate: "no overlapping booking for room 4, 11:00-12:00".
  // Each tx carries a predicate READ set and its insert declares which predicates
  // it writes into — the same bookkeeping SSI's predicate locks do.
  function run(level){
    const committed=[{room:4,slot:"10-11",by:"seed"}];
    const overlaps=(b)=>b.room===4&&b.slot==="11-12";
    const mkTx=(id)=>({id, predReads:new Set(["room4/11-12"]), row:{room:4,slot:"11-12",by:id}, predWrites:new Set(["room4/11-12"])});
    const t1=mkTx("t1"), t2=mkTx("t2");
    const sees1=committed.some(overlaps), sees2=committed.some(overlaps);  // both snapshots: no clash
    const done=[];
    let r2={ok:true};
    if(!sees1){ committed.push(t1.row); done.push(t1); }       // t1 commits first — disjoint ROW, so
    if(!sees2){                                                // snapshot's update-conflict check is silent
      if(level==="serializable"){
        const other=done[0];                                   // SSI: I read a predicate the other wrote
        const rw=[...t2.predReads].some(p=>other.predWrites.has(p))
              && [...other.predReads].some(p=>t2.predWrites.has(p));
        if(rw){
          r2={ok:false,code:"40001"};
          const retrySees=committed.some(overlaps);            // fresh snapshot: t1's row is there now
          if(!retrySees) committed.push(t2.row);
        } else committed.push(t2.row);
      } else committed.push(t2.row);                           // read committed AND snapshot both sail
    }
    const double=committed.filter(overlaps).length>1;
    return {double, r2};
  }
  const snap=run("repeatable read");
  const ser=run("serializable");
  const pass=snap.double===true && snap.r2.ok===true && ser.double===false && ser.r2.code==="40001";
  return {lines:[
    {t:`t1 and t2 both run "SELECT … WHERE room=4 AND slot overlaps 11-12" → zero rows → both INSERT`},
    {t:`snapshot isolation: the inserts don't touch each other's rows → both commit → room double-booked`},
    {t:`serializable saw t1's read depend on t2's insert and vice versa → one aborts with 40001 (a UNIQUE/EXCLUDE constraint kills it too)`},
  ], pass, verdict:pass?"you can't lock rows that don't exist yet — guard predicates with a constraint or serializable, never with a SELECT that returned nothing":`snap=${snap.double} ser=${ser.double}`};
}
async function demoExpandContract(){
  // live writers run old code until step "deploy"; a NOT NULL column they don't know about breaks them
  function migrate(order){
    let dualWrite=false, constrained=false, backfilled=false, failedWrites=0, ok=true, reason="";
    const steps={
      "add nullable column": ()=>{},
      "deploy dual-write code": ()=>{ dualWrite=true; },
      "backfill in batches": ()=>{ backfilled=true; },
      "validate NOT NULL": ()=>{
        if(!backfilled||!dualWrite){ ok=false; reason="validation failed: existing NULLs / writers still inserting NULLs"; }
        else constrained=true;
      },
    };
    for(const s of order){
      // a live old-code INSERT lands between every step
      if(constrained&&!dualWrite) failedWrites++;
      steps[s]();
      if(!ok) break;
    }
    return {ok,failedWrites,reason,constrained};
  }
  const right=migrate(["add nullable column","deploy dual-write code","backfill in batches","validate NOT NULL"]);
  const wrong=migrate(["add nullable column","validate NOT NULL","deploy dual-write code","backfill in batches"]);
  const pass=right.ok&&right.failedWrites===0&&right.constrained && !wrong.ok;
  return {lines:[
    {t:`expand → deploy → backfill → constrain: every live write succeeds, validation passes (${right.failedWrites} failures)`},
    {t:`constrain before backfill/deploy: "${wrong.reason}"`},
    {t:`the order IS the migration: the schema must accept both the old code's writes and the new code's, at every instant`},
  ], pass, verdict:pass?"expand–contract in one line: make the new shape optional, move the code, move the data, only then make it mandatory":`right=${right.ok} wrong=${wrong.ok}`};
}
async function demoNPlusOne(){
  function makeDb(){ let queries=0; return {
    orders(){ queries++; return Array.from({length:20},(_,i)=>({id:i+1})); },
    itemsFor(orderId){ queries++; return [{orderId}]; },
    itemsForAll(ids){ queries++; return ids.map(orderId=>({orderId})); },
    count(){ return queries; },
  };}
  const a=makeDb();
  for(const o of a.orders()) a.itemsFor(o.id);                 // 1 + N
  const b=makeDb();
  const orders=b.orders(); b.itemsForAll(orders.map(o=>o.id)); // 1 + 1
  const naive=a.count(), batched=b.count();
  const pass=naive===21 && batched===2;
  return {lines:[
    {t:`20 orders, items per order: the loop issues ${naive} queries — 1 for the list + 20 children`},
    {t:`at 2 ms per round trip that's ~${naive*2} ms of pure latency; under load it's also ${naive-1} pool checkouts`},
    {t:`WHERE order_id = ANY($1): ${batched} queries, ~4 ms — same rows, one round trip for all children`},
  ], pass, verdict:pass?"the query count scales with the DATA in the naive shape and with the QUERY SHAPE in the batched one — make N+1 impossible, not just rare":`naive=${naive} batched=${batched}`};
}
async function demoPoolExhaust(){
  // holding the connection across a slow external call vs releasing around it
  async function scenario(holdAcrossSlowCall){
    const pool=new Pool(2);
    const slowApi=()=>sleep(6);
    const tasks=Array.from({length:6},()=>(async()=>{
      if(holdAcrossSlowCall){
        const c=await pool.acquire();
        await slowApi();                                       // conn hostage to someone else's latency
        pool.release(c);
      }else{
        await slowApi();                                       // slow work first, no conn held
        const c=await pool.acquire();
        pool.release(c);                                       // held for ~0ms — just the query
      }
    })());
    await Promise.all(tasks);
    return pool.peakWaiting;
  }
  const bad=await scenario(true);
  const good=await scenario(false);
  const pass=bad>=3 && good===0;
  return {lines:[
    {t:`pool of 2, six requests, each with a slow external call in the middle`},
    {t:`acquire-then-call-API: connections held hostage → queue peaks at ${bad} waiters`},
    {t:`call-API-then-acquire: held time ≈ query time → ${good} waiters, same pool, same load`},
  ], pass, verdict:pass?"pool demand = arrival rate × HELD time — you fix exhaustion by shrinking the hold, not by raising max_connections":`bad=${bad} good=${good}`};
}
async function demoReadYourWrites(){
  const pair=new ReplicaPair();
  pair.write("profile:ada","bio v1"); pair.replay(1);          // replica caught up
  const writeLsn=pair.write("profile:ada","bio v2");           // the user's save — replica hasn't replayed it
  const stale=pair.readReplica("profile:ada");
  const routed=readYourWrites(pair,writeLsn,"profile:ada");
  pair.replay(1);                                              // lag drains
  const later=readYourWrites(pair,writeLsn,"profile:ada");
  const pass=stale==="bio v1" && routed.from==="primary" && routed.value==="bio v2"
    && later.from==="replica" && later.value==="bio v2";
  return {lines:[
    {t:`user saves "bio v2" (commit LSN ${writeLsn}) · the replica has replayed only LSN ${writeLsn-1} → it still serves "bio v1"`},
    {t:`LSN-guarded routing: replica behind my write → read the PRIMARY → "bio v2"`},
    {t:`replay catches up → the same rule now happily serves the replica`},
  ], pass, verdict:pass?"the replica isn't wrong, it's earlier — compare its replay position to YOUR commit and route, don't guess with a sleep":`stale=${stale} routed=${routed.from}`};
}
