"use strict";
/* Concurrency Bootcamp — application: state, persistence, rendering, the
   write-it sandbox, and test mode. Loaded last, after content + packs. */
/* ===========================================================
   STATE + PERSISTENCE
   =========================================================== */
const TOTAL = DRILLS.primitives.length + DRILLS.bank.length + DRILLS.toolkit.length + DRILLS.durable.length + BUGHUNT.length + WRITE.length;
let state = { module:"learn", solved:{} };

/* one-at-a-time stepping: where we are inside each stepped module */
let learnIdx = 0;                                          // current lesson chapter
let modelIdx = 0;                                          // current quiz question
let bugIdx = 0;                                            // current spot-the-bug card
let writeIdx = 0;                                          // current write-it exercise
let test = { on:false, qs:[], idx:0, score:0, answered:false, build:null };  // scored test mode
let drillIdx = { primitives:0, bank:0, toolkit:0, durable:0 };  // current drill per module
let quizDone = {};                                         // qi -> answered correctly (in-memory)

const STORAGE_KEY="cbootcamp:solved";
const POSITION_KEY="cbootcamp:position";   // where the user left off (lessons + skills)
function loadProgress(){
  // skills pieces: which drills are solved
  try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) state.solved=JSON.parse(raw); }
  catch(e){ /* private mode / blocked storage -> stay in-memory */ }
  // lessons + skills progress: resume where the user left off
  try{
    const raw=localStorage.getItem(POSITION_KEY);
    if(raw){
      const p=JSON.parse(raw);
      if(typeof p.module==="string" && MODULES.some(m=>m.id===p.module)) state.module=p.module;
      if(Number.isInteger(p.learnIdx)) learnIdx=p.learnIdx;
      if(Number.isInteger(p.modelIdx)) modelIdx=p.modelIdx;
      if(Number.isInteger(p.bugIdx)) bugIdx=p.bugIdx;
      if(Number.isInteger(p.writeIdx)) writeIdx=p.writeIdx;
      if(p.drillIdx && typeof p.drillIdx==="object") Object.assign(drillIdx, p.drillIdx);
      if(p.quizDone && typeof p.quizDone==="object") quizDone=p.quizDone;
    }
  }catch(e){ /* blocked storage -> stay in-memory */ }
  renderProgress();
}
function saveProgress(){
  renderProgress();
  try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(state.solved)); }catch(e){}
}
// persist the user's place across lessons + skills so they resume on return
function savePosition(){
  try{ localStorage.setItem(POSITION_KEY,JSON.stringify({
    module: state.module, learnIdx, modelIdx, bugIdx, writeIdx, drillIdx, quizDone
  })); }catch(e){}
}
// wipe everything: solved drills, quiz answers, and where the user left off
function resetProgress(){
  if(!confirm("Reset all progress? This clears solved drills, quiz answers, and your place in every module.")) return;
  try{ localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(POSITION_KEY); }catch(e){}
  state.solved={}; quizDone={};
  learnIdx=0; modelIdx=0; bugIdx=0; writeIdx=0;
  drillIdx={ primitives:0, bank:0, toolkit:0, durable:0 };
  test={ on:false, qs:[], idx:0, score:0, answered:false, build:null };
  for(const k in writeMem) delete writeMem[k];
  state.module="learn";
  renderProgress(); render(); window.scrollTo({top:0});
}
function renderProgress(){
  const n=Object.keys(state.solved).length;
  document.getElementById("pn").textContent=n;
  document.getElementById("pt").textContent=TOTAL;
  document.getElementById("progbar").style.width=(100*n/TOTAL)+"%";
}

/* ===========================================================
   RENDER
   =========================================================== */
const main=document.getElementById("main");
const nav=document.getElementById("nav");

function renderNav(){
  nav.innerHTML="";
  MODULES.forEach(m=>{
    const b=document.createElement("button");
    b.className="chip"; b.textContent=m.label; b.setAttribute("role","tab");
    b.setAttribute("aria-selected", state.module===m.id ? "true":"false");
    b.onclick=()=>{ state.module=m.id; render(); window.scrollTo({top:0}); };
    nav.appendChild(b);
  });
}

function el(html){ const d=document.createElement("div"); d.innerHTML=html.trim(); return d.firstElementChild; }

function render(){
  savePosition();
  renderNav();
  main.innerHTML="";
  const m=MODULES.find(x=>x.id===state.module);
  if(m.type==="learn") renderLearn();
  else if(m.type==="lesson") renderModel();
  else if(m.type==="drills") renderDrills(state.module);
  else if(m.type==="sim") renderSim();
  else if(m.type==="cards") renderCards();
  else if(m.type==="bugs") renderBugHunt();
  else if(m.type==="write") renderWrite();
  else if(m.type==="sheet") renderSheet(m);
  else if(m.type==="test") renderTest();
}

/* ---- generic static-page module (reference sheets, cheat sheets) ----
   A pack registers one with MODULES.push({id,label,type:"sheet",eyebrow,title,lead,html}). */
function renderSheet(m){
  main.appendChild(el(`<div>
    ${m.eyebrow?`<div class="eyebrow">${m.eyebrow}</div>`:""}
    <h1>${m.title||m.label}</h1>
    ${m.lead?`<p class="lead">${m.lead}</p>`:""}
  </div>`));
  const card=el(`<div class="card lesson">${m.html}</div>`);
  main.appendChild(card);
  const anim=card.querySelector(".anim");
  if(anim){
    const play=()=>{ anim.classList.remove("playing"); void anim.offsetWidth; anim.classList.add("playing"); };
    const btn=card.querySelector("[data-play]");
    if(btn) btn.onclick=play;
    play();
  }
}

/* ---- one-at-a-time stepper control (prev · n/total · next) ---- */
function stepperRow(idx, total, go){
  const row=el(`<div class="row" style="justify-content:space-between;align-items:center;margin-top:14px"></div>`);
  const prev=el(`<button class="btn">‹ prev</button>`);
  const pos=el(`<span class="ctrl">${idx+1} / ${total}</span>`);
  const next=el(`<button class="btn go">next ›</button>`);
  if(idx===0) prev.disabled=true;
  if(idx===total-1) next.disabled=true;
  prev.onclick=()=>go(idx-1);
  next.onclick=()=>go(idx+1);
  row.append(prev,pos,next);
  return row;
}

const MODULE_LABEL = Object.fromEntries(MODULES.map(m=>[m.id,m.label]));
function drillIndexOf(mod,id){ const list=DRILLS[mod]; if(!list) return 0; const i=list.findIndex(d=>d.id===id); return i<0?0:i; }
function drillTitle(mod,id){ const list=DRILLS[mod]; const d=list&&list.find(x=>x.id===id); return d?d.title:""; }
function goLesson(i){ state.module="learn"; learnIdx=Math.max(0,Math.min(i,LESSONS.length-1)); render(); window.scrollTo({top:0}); }
function goModule(mod,drill){ state.module=mod; if(drill && DRILLS[mod]) drillIdx[mod]=drillIndexOf(mod,drill); render(); window.scrollTo({top:0}); }
function crossLink(html,onclick){ const b=el(`<button class="xlink">${html}</button>`); b.onclick=onclick; return b; }
// a "go practice the concept you just learned" link for a lesson
function practiceLinkRow(lessonIdx){
  const prac=LESSON_PRACTICE[lessonIdx]; if(!prac) return null;
  const label=prac.drill ? `${MODULE_LABEL[prac.mod]} · ${drillTitle(prac.mod,prac.drill)}` : MODULE_LABEL[prac.mod];
  const row=el(`<div class="xlinkrow"></div>`);
  row.appendChild(crossLink(`<span class="dot">▶</span> Check yourself: <b>${esc(label)}</b> <small>— a different question</small>`, ()=>goModule(prac.mod, prac.drill)));
  return row;
}
// a "back to the concept this skill tests" link for a drill/quiz/sim
function conceptLinkRow(lessonIdx){
  const l=LESSONS[lessonIdx]; if(!l) return null;
  const row=el(`<div class="xlinkrow" style="margin:0 0 12px"></div>`);
  row.appendChild(crossLink(`<span class="dot">●</span> Concept: <b>${esc(l.eb)}</b> <small>${esc(l.title)}</small>`, ()=>goLesson(lessonIdx)));
  return row;
}

function renderLearn(){
  learnIdx=Math.max(0,Math.min(learnIdx,LESSONS.length-1));
  const ch=LESSONS[learnIdx];
  main.appendChild(el(`<div><div class="eyebrow">${ch.eb}</div><h1>${ch.title}</h1></div>`));
  const card=el(`<div class="card lesson">${ch.html}</div>`);
  main.appendChild(card);
  const prac=practiceLinkRow(learnIdx); if(prac) main.appendChild(prac);
  main.appendChild(stepperRow(learnIdx, LESSONS.length, (i)=>{ learnIdx=i; render(); window.scrollTo({top:0}); }));

  // animate the diagram: replay restarts the staggered reveal; auto-play on view
  const anim=card.querySelector(".anim");
  if(anim){
    const play=()=>{ anim.classList.remove("playing"); void anim.offsetWidth; anim.classList.add("playing"); };
    const btn=card.querySelector("[data-play]");
    if(btn) btn.onclick=play;
    play();
  }
}

/* ---- model: one quiz question at a time ---- */
function buildQuizCard(q, qi){
  const done=!!quizDone[qi];
  const card=el(`<div class="card"><div class="why">// predict the console output</div><pre class="code">${esc(q.code)}</pre></div>`);
  q.options.forEach((opt,oi)=>{
    if(done){
      card.appendChild(el(`<button class="qopt ${oi===q.answer?"correct":""}" disabled>${esc(opt)}</button>`));
      return;
    }
    const b=el(`<button class="qopt">${esc(opt)}</button>`);
    b.onclick=()=>{
      if(card.dataset.done) return;
      if(oi===q.answer){
        b.classList.add("correct"); card.dataset.done="1"; quizDone[qi]=true; savePosition();
        card.appendChild(el(`<div class="why-line">${esc(q.whys[oi])}</div>`));
      } else {
        if(b.dataset.tried) return;            // explain once, then let them try again
        b.dataset.tried="1"; b.classList.add("wrong");
        b.appendChild(el(`<div class="why-line" style="margin-top:6px">${esc(q.whys[oi])}</div>`));
      }
    };
    card.appendChild(b);
  });
  if(done) card.appendChild(el(`<div class="why-line">${esc(q.whys[q.answer])}</div>`));
  return card;
}

function renderModel(){
  main.appendChild(el(`<div>
    <div class="eyebrow">module 00</div>
    <h1>The model</h1>
    <p class="lead">One thread. One stack. A synchronous block runs start to finish before anything else gets a turn — that's why there's no torn read until you add real threads. Async work waits in two queues: <b style="color:var(--text)">microtasks</b> (promise callbacks) drain completely after each task; <b style="color:var(--text)">macrotasks</b> (setTimeout, I/O) get one per loop.</p>
    <p class="sub">Predict each output before you tap. One at a time — answer, read why, then step on.</p>
  </div>`));
  { const row=conceptLinkRow(1); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }

  modelIdx=Math.max(0,Math.min(modelIdx,QUIZ.length-1));
  main.appendChild(buildQuizCard(QUIZ[modelIdx], modelIdx));
  main.appendChild(stepperRow(modelIdx, QUIZ.length, (i)=>{ modelIdx=i; render(); window.scrollTo({top:0}); }));
}

/* ---- drills (fill the blank) ---- */
function renderDrills(modId){
  const list=DRILLS[modId];
  const HEADERS = {
    primitives:{eb:"module 01", h:"Build the primitives", lead:"Each one is a queue of deferreds plus a rule for whose <code style='font-family:var(--mono)'>resolve()</code> you call next. Choose the correct line at each decision point, then run the reference to watch the invariant hold."},
    bank:{eb:"module 04", h:"Problem bank", lead:"Classic concurrency problems, built on the same primitives. State the invariant in your head before you choose."},
    toolkit:{eb:"module 05", h:"Interview kit", lead:"The async utilities interviewers actually ask you to write — <code style='font-family:var(--mono)'>debounce</code>, <code style='font-family:var(--mono)'>throttle</code>, <code style='font-family:var(--mono)'>Promise.all</code>, retry. Same drill: pick the line that holds the invariant, then run it."},
    durable:{eb:"module 06", h:"Durable execution", lead:"The concurrency model behind workflow engines like <b style='color:var(--text)'>Temporal</b>: code that's re-run from history must stay deterministic, race durable timers, and serialize concurrent signals. Same hazards as async JS — with replay raising the stakes."},
  };
  const header = HEADERS[modId];
  main.appendChild(el(`<div><div class="eyebrow">${header.eb}</div><h1>${header.h}</h1><p class="lead">${header.lead}</p></div>`));

  const idx=Math.max(0,Math.min(drillIdx[modId]||0, list.length-1));
  drillIdx[modId]=idx;
  main.appendChild(buildDrillCard(list[idx]));
  main.appendChild(stepperRow(idx, list.length, (i)=>{ drillIdx[modId]=i; render(); window.scrollTo({top:0}); }));
}

function buildDrillCard(d){
  const solved = !!state.solved[d.id];
  const card=el(`<div class="card">
    <h2>${d.title}</h2>
    <div class="why">// ${d.why}</div>
    <span class="done ${solved?"":"hidden"}" data-done>✓ solved</span>
    <pre class="code">${esc(d.pre)}</pre>
  </div>`);

  // backlink to the lesson this skill checks (the lesson teaches; this probes a different angle)
  const li=DRILL_LESSON[d.id];
  if(li!=null){ const row=conceptLinkRow(li); if(row) card.querySelector(".why").after(row); }

  // blank chooser
  const blank=el(`<div class="blank ${solved?"solved":""}"><div class="q">${esc(d.blank.q)}</div></div>`);
  if(solved){
    blank.appendChild(el(`<div class="opt correct">${esc(d.blank.options[d.blank.answer])}</div>`));
    blank.appendChild(el(`<div class="why-line">${esc(d.blank.whys[d.blank.answer])}</div>`));
  } else {
    d.blank.options.forEach((opt,oi)=>{
      const b=el(`<button class="opt">${esc(opt)}</button>`);
      b.onclick=()=>{
        if(blank.classList.contains("solved")) return;
        if(oi===d.blank.answer){
          b.classList.add("correct");
          blank.classList.add("solved");
          blank.querySelector(".q").classList.add("solved");
          blank.appendChild(el(`<div class="why-line">${esc(d.blank.whys[oi])}</div>`));
          card.querySelector("[data-done]").classList.remove("hidden");
          // disable others
          blank.querySelectorAll(".opt").forEach(x=>{ if(x!==b) x.style.display="none"; });
          state.solved[d.id]=true; saveProgress();
        } else {
          b.classList.add("wrong");
          b.appendChild(el(`<div class="why-line" style="margin-top:6px">${esc(d.blank.whys[oi])}</div>`));
        }
      };
      blank.appendChild(b);
    });
  }
  card.appendChild(blank);
  card.appendChild(el(`<pre class="code">${esc(d.post)}</pre>`));

  // run
  const runRow=el(`<div class="row"></div>`);
  const runBtn=el(`<button class="btn go">▶ run reference</button>`);
  const cons=el(`<div class="console" style="display:none"></div>`);
  runBtn.onclick=async()=>{
    runBtn.disabled=true; cons.style.display="block"; cons.textContent="running…";
    try{
      const r=await d.demo();
      cons.innerHTML=r.lines.map(l=>esc(l.t)).join("\n")
        +`\n<span class="${r.pass?"pass":"fail"}">${r.pass?"✓ PASS":"✗ FAIL"} — ${esc(r.verdict)}</span>`;
    }catch(e){ cons.innerHTML=`<span class="fail">error: ${esc(String(e))}</span>`; }
    runBtn.disabled=false;
  };
  runRow.appendChild(runBtn);
  card.appendChild(runRow);
  card.appendChild(cons);
  return card;
}

/* ---- spot the bug (pick the faulty line) ---- */
function renderBugHunt(){
  main.appendChild(el(`<div>
    <div class="eyebrow">module 07</div><h1>Spot the bug</h1>
    <p class="lead">A full concurrency class or function — the mutex, the semaphore, the bounded queue, the token bucket — with one scenario describing how it misbehaves and one subtle fault hiding in the implementation. Read the whole thing, tap the buggy line(s), then check.</p>
    <p class="sub">Reading real code and finding the fault is the actual job. One implementation at a time — read the scenario, scan the code, pick the line(s), then check.</p>
  </div>`));
  bugIdx=Math.max(0,Math.min(bugIdx,BUGHUNT.length-1));
  main.appendChild(buildBugCard(BUGHUNT[bugIdx]));
  main.appendChild(stepperRow(bugIdx, BUGHUNT.length, (i)=>{ bugIdx=i; render(); window.scrollTo({top:0}); }));
}

function buildBugCard(b){
  const solved=!!state.solved[b.id];
  const bugSet=new Set(b.bug);
  const card=el(`<div class="card ${solved?"solved":""}">
    <h2>${esc(b.title)}</h2>
    <div class="why">// ${esc(b.why)}</div>
    <span class="done ${solved?"":"hidden"}" data-done>✓ solved</span>
    <div class="scen">${esc(b.scenario)}</div>
  </div>`);
  if(b.lesson!=null){ const row=conceptLinkRow(b.lesson); if(row) card.querySelector(".why").after(row); }

  const wrap=el(`<div class="bughunt"></div>`);
  const feedback=el(`<div class="why-line" style="display:none"></div>`);
  const lineEls=[];
  b.lines.forEach((src,i)=>{
    const blank=src.trim()==="";   // spacer line — numbered for alignment, not selectable
    const tag=blank?"div":"button";
    const row=el(`<${tag} class="codeline${blank?" blankline":""}"${blank?"":' type="button"'}><span class="ln">${i+1}</span><span class="src"></span></${tag}>`);
    row.querySelector(".src").textContent=blank?" ":src;   // exact text, indentation preserved
    lineEls.push(row);
    if(solved){
      if(bugSet.has(i)) row.classList.add("buggy");
      if(!blank) row.disabled=true;
    } else if(!blank){
      row.onclick=()=>{
        if(wrap.dataset.done) return;
        lineEls.forEach(r=>r.classList.remove("miss"));   // clear stale feedback marks
        feedback.style.display="none";
        row.classList.toggle("sel");
      };
    }
    wrap.appendChild(row);
  });
  card.appendChild(wrap);
  card.appendChild(feedback);

  if(solved){
    feedback.style.display="block";
    feedback.textContent=b.explain;
    return card;
  }

  const finish=(win)=>{
    wrap.dataset.done="1";
    lineEls.forEach((r,i)=>{ r.disabled=true; r.classList.remove("sel","miss"); if(bugSet.has(i)) r.classList.add("buggy"); });
    feedback.style.display="block"; feedback.textContent=b.explain;
    if(win){ card.classList.add("solved"); card.querySelector("[data-done]").classList.remove("hidden"); state.solved[b.id]=true; saveProgress(); }
  };

  const row=el(`<div class="row"></div>`);
  const check=el(`<button class="btn go">check</button>`);
  const reveal=el(`<button class="btn">reveal answer</button>`);
  check.onclick=()=>{
    const sel=lineEls.map((r,i)=>r.classList.contains("sel")?i:-1).filter(i=>i>=0);
    if(!sel.length){ feedback.style.display="block"; feedback.textContent="Tap the line(s) you think are wrong, then check."; return; }
    const exact = sel.length===bugSet.size && sel.every(i=>bugSet.has(i));
    if(exact){ finish(true); return; }
    // wrong: drop the clean lines they picked (mark them), keep any real bugs selected, don't reveal the rest
    let found=0, wrong=0;
    lineEls.forEach((r,i)=>{
      if(r.classList.contains("sel")){
        if(bugSet.has(i)) found++;
        else { r.classList.remove("sel"); r.classList.add("miss"); wrong++; }
      }
    });
    const need=bugSet.size;
    feedback.style.display="block";
    feedback.textContent = `Not quite — ${need} line${need>1?"s are":" is"} buggy. `
      + (wrong?`${wrong} of your picks ${wrong>1?"aren't":"isn't"} the problem (marked). `:"")
      + (found?`${found} correct so far. `:"")
      + "Adjust and check again.";
    wrap.classList.add("shake"); setTimeout(()=>wrap.classList.remove("shake"),320);
  };
  reveal.onclick=()=>finish(false);
  row.append(check,reveal);
  card.appendChild(row);
  return card;
}

/* ---- workers & atomics simulator ---- */
let sim={threads:3,iters:3,atomic:false};
const ITER_SCALE=1_000_000;                 // each "increment" notch = 1,000,000 real ops
// Real SharedArrayBuffer + shared-memory Atomics only exist on a cross-origin-isolated page.
const REAL_RACE=(typeof SharedArrayBuffer!=="undefined") && (self.crossOriginIsolated===true);
const fmt=(n)=>n.toLocaleString("en-US");

// The genuine race: N Worker threads incrementing one shared Int32 over a SharedArrayBuffer.
// Every worker parks on Atomics.wait until the gate opens, so they collide head-on.
function runRealRace({threads,iters,atomic}){
  return new Promise((resolve,reject)=>{
    let view;
    try{
      const sab=new SharedArrayBuffer(8);   // [0] = counter, [1] = start gate
      view=new Int32Array(sab);
      const workers=[]; let ready=0, done=0;
      const cleanup=()=>workers.forEach(w=>w.terminate());
      for(let i=0;i<threads;i++){
        const w=new Worker("worker.js");
        w.onerror=(err)=>{ cleanup(); reject(err.message||"worker failed to load"); };
        w.onmessage=(e)=>{
          if(e.data.ready){
            if(++ready===threads){ Atomics.store(view,1,1); Atomics.notify(view,1); }  // open the gate for all at once
          }else if(e.data.done){
            if(++done===threads){
              cleanup();
              resolve({mem:Atomics.load(view,0),expected:threads*iters,threads,iters,atomic});
            }
          }
        };
        w.postMessage({buffer:sab,iters,atomic});
        workers.push(w);
      }
    }catch(err){ reject(err.message||String(err)); }
  });
}

function renderSim(){
  const real=REAL_RACE;
  main.appendChild(el(`<div>
    <div class="eyebrow">module 02</div>
    <h1>Workers &amp; Atomics</h1>
    <p class="lead">This is the one place JS has a real data race: multiple worker threads touching the same <b style="color:var(--text)">SharedArrayBuffer</b>. A plain <code style="font-family:var(--mono)">counter++</code> is three steps — read, add, write — and concurrent threads interleave those steps and clobber each other.</p>
    <p class="sub">${real
      ? `This page is <b style="color:var(--ordered)">cross-origin isolated</b>, so the run below spins up <b style="color:var(--text)">real Worker threads</b> over a genuine SharedArrayBuffer. With <b style="color:var(--text)">Atomic</b> off the count comes out wrong — and differently wrong each run. Flip it on and it&rsquo;s exact every time.`
      : `Real SharedArrayBuffer needs cross-origin isolation, which isn&rsquo;t available here, so the run below <b style="color:var(--text)">simulates</b> the interleaving step by step. The lost-update behavior is identical. Flip <b style="color:var(--text)">Atomic</b> off and run it a few times.`}</p>
  </div>`));
  { const row=conceptLinkRow(9); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }

  const card=el(`<div class="card"><h2>${real?"Live data race":"Interleaving simulator"}</h2><div class="why">// each thread increments a shared counter</div></div>`);

  // isolation status badge
  const badge=el(`<div class="result ${real?"exact":""}" style="display:flex;align-items:center;gap:8px;margin:0 0 4px">
    ${real
      ? `<b style="color:var(--ordered)">● real threads</b> <span class="sub" style="font-size:12px">crossOriginIsolated = true · SharedArrayBuffer live</span>`
      : `<b style="color:var(--race)">● simulated</b> <span class="sub" style="font-size:12px">crossOriginIsolated = false · stepwise model</span>`}
  </div>`);
  if(!real) badge.style.borderColor="var(--line)";
  card.appendChild(badge);

  const ctrls=el(`<div class="ctrls"></div>`);
  const tEl=el(`<label class="ctrl">threads <input type="range" min="2" max="4" value="${sim.threads}"> <b style="color:var(--text)" data-tv>${sim.threads}</b></label>`);
  const iEl=el(`<label class="ctrl">${real?"×&nbsp;million inc":"×&nbsp;increments"} <input type="range" min="2" max="4" value="${sim.iters}"> <b style="color:var(--text)" data-iv>${sim.iters}</b></label>`);
  const aEl=el(`<div class="toggle ${sim.atomic?"on":""}"><div class="switch"></div> Atomic</div>`);
  tEl.querySelector("input").oninput=e=>{sim.threads=+e.target.value;tEl.querySelector("[data-tv]").textContent=sim.threads;};
  iEl.querySelector("input").oninput=e=>{sim.iters=+e.target.value;iEl.querySelector("[data-iv]").textContent=sim.iters;};
  aEl.onclick=()=>{sim.atomic=!sim.atomic;aEl.classList.toggle("on",sim.atomic);};
  ctrls.append(tEl,iEl,aEl);
  card.appendChild(ctrls);

  const runBtn=el(`<button class="btn go">▶ ${real?"run real threads":"run interleaving"}</button>`);
  const tape=el(`<div class="tape"></div>`);
  const result=el(`<div class="result" style="display:none"></div>`);
  const colors=["var(--accent)","var(--ordered)","var(--race)","#e0c25a"];

  const showResult=(mem,expected,extra)=>{
    result.style.display="block";
    const lost=expected-mem;
    result.className="result "+(lost===0?"exact":"lost");
    const head = lost===0
      ? `counter = ${fmt(mem)}  ·  expected ${fmt(expected)}  ·  exact`
      : `counter = ${fmt(mem)}  ·  expected ${fmt(expected)}  ·  ${fmt(lost)} update${lost>1?"s":""} lost`;
    result.textContent = extra ? head+"  ·  "+extra : head;
  };

  if(real){
    runBtn.onclick=async()=>{
      runBtn.disabled=true; const old=runBtn.textContent; runBtn.textContent="running…";
      tape.innerHTML="";
      const iters=sim.iters*ITER_SCALE;
      try{
        const out=await runRealRace({threads:sim.threads,iters,atomic:sim.atomic});
        showResult(out.mem,out.expected,`${out.threads} workers × ${fmt(iters)} · ${out.atomic?"Atomics.add":"view[0]=view[0]+1"}`);
      }catch(err){
        result.style.display="block"; result.className="result lost";
        result.textContent="worker error: "+err;
      }
      runBtn.disabled=false; runBtn.textContent=old;
    };
  }else{
    runBtn.onclick=()=>{
      const out=simulate(sim);
      tape.innerHTML="";
      out.tape.forEach(s=>{
        const label = s.op==="add" ? `T${s.t} add→${s.mem}`
          : s.op==="read" ? `T${s.t} read ${s.val}` : `T${s.t} write ${s.val}`;
        const chip=el(`<span class="step">${label}</span>`);
        chip.style.borderColor=colors[s.t]; chip.style.color=colors[s.t];
        tape.appendChild(chip);
      });
      showResult(out.mem,out.expected);
    };
  }
  card.appendChild(el(`<div class="row"></div>`)).appendChild(runBtn);
  card.appendChild(tape);
  card.appendChild(result);
  main.appendChild(card);

  main.appendChild(el(`<div class="card">
    <div class="why">// the fix, in real worker code</div>
    <pre class="code"><span class="cm">// racy — read, add, write can interleave</span>
counter[0] = counter[0] + 1;

<span class="cm">// safe — one indivisible operation</span>
<span class="ok">Atomics.add(counter, 0, 1);</span>

<span class="cm">// Atomics.wait / Atomics.notify build a real
// blocking lock across threads — the worker-world mutex.</span></pre>
    <p class="sub" style="margin-bottom:0">${real
      ? `This is exactly what runs above: <code style="font-family:var(--mono)">worker.js</code> increments a shared <code style="font-family:var(--mono)">Int32Array</code>, parked on <code style="font-family:var(--mono)">Atomics.wait</code> until every worker is ready so they collide head-on.`
      : `In the browser, real SharedArrayBuffer needs cross-origin isolation headers (<code style="font-family:var(--mono)">COOP</code> + <code style="font-family:var(--mono)">COEP</code>). On a host that sets them, this exact module runs genuine threads via <code style="font-family:var(--mono)">worker.js</code> instead of simulating.`}</p>
  </div>`));
}

function simulate({threads,iters,atomic}){
  const expected=threads*iters;
  if(atomic){
    const tape=[]; let mem=0;
    const seq=[]; for(let t=0;t<threads;t++) for(let k=0;k<iters;k++) seq.push(t);
    // shuffle
    for(let i=seq.length-1;i>0;i--){const j=rnd(i+1);[seq[i],seq[j]]=[seq[j],seq[i]];}
    seq.forEach(t=>{mem+=1;tape.push({t,op:"add",mem});});
    return {mem,tape,expected};
  }
  // non-atomic: each increment = read then write, with a private register
  let mem=0; const reg=new Array(threads).fill(0);
  const phase=new Array(threads).fill("read"); const remaining=new Array(threads).fill(iters);
  const tape=[]; let steps=threads*iters*2;
  while(steps>0){
    const active=[]; for(let i=0;i<threads;i++) if(remaining[i]>0) active.push(i);
    const t=active[rnd(active.length)];
    if(phase[t]==="read"){ reg[t]=mem; tape.push({t,op:"read",val:mem}); phase[t]="write"; }
    else { mem=reg[t]+1; tape.push({t,op:"write",val:mem}); phase[t]="read"; remaining[t]--; }
    steps--;
  }
  return {mem,tape,expected};
}

/* ---- flashcards ---- */
let cardIdx=0, cardFlipped=false;
function renderCards(){
  main.innerHTML="";   // flip/prev/next call this directly — clear so we replace, not stack
  main.appendChild(el(`<div><div class="eyebrow">module 03</div><h1>Trade-offs</h1>
    <p class="lead">No code here — just the judgment calls that separate using concurrency from understanding it. Tap to flip, then advance. Rehearse until they're reflexive.</p></div>`));
  { const row=conceptLinkRow(22); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }
  const [front,back]=CARDS[cardIdx];
  const fc=el(`<div class="flash ${cardFlipped?"back":""}">
    <div class="face">${cardFlipped?"the answer":"prompt "+(cardIdx+1)+" / "+CARDS.length}</div>
    <div class="body">${esc(cardFlipped?back:front)}</div>
  </div>`);
  fc.onclick=()=>{ cardFlipped=!cardFlipped; renderCards(); };
  main.appendChild(fc);
  const row=el(`<div class="row"></div>`);
  const prev=el(`<button class="btn">‹ prev</button>`);
  const next=el(`<button class="btn go">next ›</button>`);
  prev.onclick=()=>{ cardIdx=(cardIdx-1+CARDS.length)%CARDS.length; cardFlipped=false; renderCards(); };
  next.onclick=()=>{ cardIdx=(cardIdx+1)%CARDS.length; cardFlipped=false; renderCards(); };
  row.append(prev,next);
  main.appendChild(row);
}

/* ---- write it: assemble the implementation from a shuffled line bank ---- */
/* The assembled code runs for real, inside a throwaway Web Worker so a
   deadlock or infinite loop can't freeze the page — the worker is simply
   terminated after 3s. log/assert/sleep/deferred mirror the demo runners. */
function sandboxRun(src, testSrc, passMsg){
  const prog = `"use strict";
const __lines=[];
const log=(t)=>__lines.push(String(t));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }
const assert=(c,m)=>{ if(!c) throw new Error(m); };
(async()=>{
  try{
${src}
${testSrc}
    postMessage({lines:__lines,pass:true,verdict:${JSON.stringify(passMsg)}});
  }catch(e){
    postMessage({lines:__lines,pass:false,verdict:String((e&&e.message)||e)});
  }
})();`;
  return new Promise((resolve)=>{
    let url=null, w=null, timer=null, settled=false;
    const finish=(r)=>{ if(settled) return; settled=true; clearTimeout(timer); if(w) w.terminate(); if(url) URL.revokeObjectURL(url); resolve(r); };
    try{
      url=URL.createObjectURL(new Blob([prog],{type:"text/javascript"}));
      w=new Worker(url);
    }catch(e){ return finish({lines:[],pass:false,verdict:"couldn't start the sandbox: "+String(e)}); }
    timer=setTimeout(()=>finish({lines:[],pass:false,verdict:"timed out after 3s — a deadlock, an unreleased lock, or an infinite loop is the usual suspect"}),3000);
    w.onmessage=(e)=>finish(e.data);
    w.onerror=(e)=>{ e.preventDefault(); finish({lines:[],pass:false,verdict:"didn't parse/run: "+(e.message||"syntax error")+" — check the structure (method boundaries, braces)"}); };
  });
}

/* in-memory build state per exercise, so stepping prev/next (or hopping to a
   lesson and back) doesn't throw away a half-assembled body. Cleared on reset. */
const writeMem = {};

function buildWriteCard(w, opts={}){
  const exam=!!opts.exam;                  // test-mode build round: first run counts
  const card=el(`<div class="card">
    <h2>${esc(w.title)}</h2>
    <div class="why">// ${esc(w.why)}</div>
    <span class="done ${!exam&&state.solved[w.id]?"":"hidden"}" data-done>✓ solved</span>
    <p class="scen">${esc(w.spec)}</p>
  </div>`);
  if(!exam && w.lesson!=null){ const row=conceptLinkRow(w.lesson); if(row) card.querySelector(".why").after(row); }

  card.appendChild(el(`<pre class="code" style="margin:12px 0 4px">${esc(w.pre)}</pre>`));
  const built=el(`<div class="built"></div>`);
  card.appendChild(built);
  card.appendChild(el(`<pre class="code" style="margin:4px 0 2px">${esc(w.post)}</pre>`));

  const bankLabel=el(`<div class="banklabel">line bank — tap to add · ${w.distractors.length} traps hiding in here</div>`);
  const bankBox=el(`<div class="bankbox"></div>`);
  card.append(bankLabel, bankBox);

  const runRow=el(`<div class="row"></div>`);
  const runBtn=el(`<button class="btn go">▶ run tests</button>`);
  const clearBtn=el(`<button class="btn">↺ clear</button>`);
  runRow.append(runBtn, clearBtn);
  card.appendChild(runRow);
  const cons=el(`<div class="console" style="display:none"></div>`);
  const notes=el(`<div></div>`);
  card.append(cons, notes);

  // chips are indices into `items` (reference lines, then traps) so duplicate
  // lines stay distinct and an in-progress build can be restored from memory
  const items = w.lines.map((code)=>({code, why:null}))
    .concat(w.distractors.map((d)=>({code:d.code, why:d.why})));
  const fresh=()=>({ seq:shuffle(items.map((_,i)=>i)), chosen:[], fails:0 });
  const mem = exam ? fresh() : (writeMem[w.id] = writeMem[w.id] || fresh());
  let done = !exam && !!state.solved[w.id];
  let scored = false;                      // exam mode: score exactly once
  // revisiting a solved exercise shows the reference body, still runnable
  let chosen = done ? items.map((_,i)=>i).filter(i=>!items[i].why) : mem.chosen;

  function paint(){
    if(done && !exam) card.querySelector(".scen").style.borderColor="var(--ordered)";
    built.innerHTML="";
    if(!chosen.length) built.appendChild(el(`<div class="ghost">tap lines from the bank below to build the body — tap a built line to take it back out</div>`));
    chosen.forEach((ii,ci)=>{
      const b=el(`<button class="wline ${done?"locked":""}"><span class="ln">${ci+1}</span><span class="src">${esc(items[ii].code)}</span></button>`);
      if(!done) b.onclick=()=>{ chosen.splice(ci,1); paint(); };
      built.appendChild(b);
    });
    bankBox.innerHTML="";
    mem.seq.filter(ii=>!chosen.includes(ii)).forEach(ii=>{
      const b=el(`<button class="bankline">${esc(items[ii].code)}</button>`);
      b.onclick=()=>{ chosen.push(ii); paint(); };
      bankBox.appendChild(b);
    });
    bankLabel.style.display = bankBox.style.display = done ? "none" : "";
    clearBtn.style.display = done ? "none" : "";
    // solved drills stay re-runnable; a scored exam run is final
    runBtn.disabled = done ? exam : chosen.length===0;
  }

  // any trap lines sitting in the build explain themselves, like every wrong tap in the app
  const trapNotes=()=>{
    chosen.filter(ii=>items[ii].why).forEach(ii=>{
      notes.appendChild(el(`<div class="why-line" style="border-color:var(--race)"><b style="color:var(--race)">trap — ${esc(items[ii].code.trim())}</b><br>${esc(items[ii].why)}</div>`));
    });
  };

  runBtn.onclick=async()=>{
    runBtn.disabled=true; notes.innerHTML="";
    cons.style.display="block"; cons.textContent="running your code in a sandbox…";
    const src=[w.pre, ...chosen.map(ii=>items[ii].code), w.post].join("\n");
    const r=await sandboxRun(src, w.test, w.pass);
    cons.innerHTML=r.lines.map(l=>esc(l)).join("\n")+(r.lines.length?"\n":"")
      +`<span class="${r.pass?"pass":"fail"}">${r.pass?"✓ PASS":"✗ FAIL"} — ${esc(r.verdict)}</span>`;
    if(exam){
      done=true;                           // first run counts, pass or fail
      if(r.pass) notes.appendChild(el(`<div class="why-line">${esc(w.takeaway)}</div>`));
      else trapNotes();
      if(!scored){ scored=true; if(opts.onScored) opts.onScored(r.pass); }
    } else if(r.pass){
      done=true;
      card.querySelector("[data-done]").classList.remove("hidden");
      notes.appendChild(el(`<div class="why-line">${esc(w.takeaway)}</div>`));
      if(!state.solved[w.id]){ state.solved[w.id]=true; saveProgress(); }
    } else {
      mem.fails++;
      trapNotes();
      if(mem.fails>=2 && w.hint) notes.appendChild(el(`<div class="why-line"><b>hint:</b> ${esc(w.hint)}</div>`));
    }
    paint();
  };
  clearBtn.onclick=()=>{ if(done) return; chosen.length=0; mem.fails=0; cons.style.display="none"; notes.innerHTML=""; paint(); };

  paint();
  return card;
}

function renderWrite(){
  main.appendChild(el(`<div>
    <div class="eyebrow">module 08</div><h1>Write it</h1>
    <p class="lead">No options to lean on. You get a spec, a scaffold, and a shuffled pile of lines — some belong, some are traps. Tap lines into place to write the implementation, then <b style="color:var(--text)">run the tests</b>: your assembled code actually executes against real assertions, so any arrangement that behaves correctly passes.</p>
    <p class="sub">This is the whiteboard round, phone-sized. Say the invariant out loud, build to it, and let the tests argue back. Deadlocks just time out — the sandbox can't freeze the page.</p>
  </div>`));
  writeIdx=Math.max(0,Math.min(writeIdx,WRITE.length-1));
  main.appendChild(buildWriteCard(WRITE[writeIdx]));
  main.appendChild(stepperRow(writeIdx, WRITE.length, (i)=>{ writeIdx=i; render(); window.scrollTo({top:0}); }));
}

/* ---- test mode: randomized, shuffled options, scored, no hints until you answer ---- */
function testPool(){
  const out=[];
  Object.keys(DRILLS).forEach(mod=>DRILLS[mod].forEach(d=>out.push(
    {title:d.title, context:d.pre, question:d.blank.q, options:d.blank.options, answer:d.blank.answer, whys:d.blank.whys})));
  QUIZ.forEach(q=>out.push(
    {title:"Predict the output", context:q.code, question:"What does this print, in order?", options:q.options, answer:q.answer, whys:q.whys}));
  return out;
}
function shuffle(a){ const x=a.slice(); for(let i=x.length-1;i>0;i--){ const j=rnd(i+1); [x[i],x[j]]=[x[j],x[i]]; } return x; }
function shuffleOptions(q){
  const order=shuffle(q.options.map((_,i)=>i));
  return { ...q, options:order.map(i=>q.options[i]), whys:q.whys?order.map(i=>q.whys[i]):null, answer:order.indexOf(q.answer) };
}
function startTest(n){
  let pool=shuffle(testPool());
  if(n!=="all") pool=pool.slice(0,n);
  // every test ends with a build round: one write-it exercise, first run counts
  test={ on:true, qs:pool.map(shuffleOptions), idx:0, score:0, answered:false,
         build:{ ex:WRITE[rnd(WRITE.length)], done:false, pass:false } };
  render(); window.scrollTo({top:0});
}
function renderTest(){
  if(!test.on){
    main.appendChild(el(`<div>
      <div class="eyebrow">test yourself</div><h1>Test mode</h1>
      <p class="lead">No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.</p>
      <p class="sub">Prep tip: once you can pass these cold, rebuild each pattern in a blank file while talking it through out loud — that's the skill the interview actually grades.</p>
    </div>`));
    const row=el(`<div class="row"></div>`);
    [["10 + build",10],["20 + build",20],["all "+testPool().length+" + build","all"]].forEach(([label,n])=>{
      const b=el(`<button class="btn go">${label}</button>`); b.onclick=()=>startTest(n); row.appendChild(b);
    });
    main.appendChild(row);
    return;
  }
  if(test.idx>=test.qs.length){
    // build round: multiple choice is done — now write one, first run counts
    if(test.build && !test.build.done){
      main.appendChild(el(`<div class="eyebrow">build round · ${test.score} correct so far</div>`));
      main.appendChild(el(`<div><h1>Now write one</h1><p class="lead">Multiple choice is over. Assemble this implementation from its line bank, then run it — <b style="color:var(--text)">your first run is the one that counts</b>, pass or fail.</p></div>`));
      const card=buildWriteCard(test.build.ex,{ exam:true, onScored:(pass)=>{
        test.build.done=true; test.build.pass=pass;
        if(pass) test.score++;
        const nrow=el(`<div class="row"></div>`);
        const nb=el(`<button class="btn go">see score ›</button>`);
        nb.onclick=()=>{ render(); window.scrollTo({top:0}); };
        nrow.appendChild(nb); card.appendChild(nrow);
      }});
      main.appendChild(card);
      return;
    }
    const n=test.qs.length+(test.build?1:0), s=test.score, pct=Math.round(100*s/n);
    const msg = pct>=90?"Sharp — you're ready." : pct>=70?"Solid. Patch the misses and you're close." : "Worth another pass through the drills.";
    const mc = s-(test.build&&test.build.pass?1:0);
    const buildLine = test.build
      ? `<p class="sub">${mc} / ${test.qs.length} multiple choice · build round (${esc(test.build.ex.title.replace(/ — write it$/,""))}): ${test.build.pass?'<span style="color:var(--ordered)">✓ passed</span>':'<span style="color:var(--race)">✗ failed</span>'}</p>`
      : "";
    main.appendChild(el(`<div><div class="eyebrow">result</div><h1>${s} / ${n} <span class="sub" style="font-size:17px">· ${pct}%</span></h1><p class="lead">${msg}</p>${buildLine}</div>`));
    const row=el(`<div class="row"></div>`);
    const again=el(`<button class="btn go">▶ retake</button>`); again.onclick=()=>{ test.on=false; render(); window.scrollTo({top:0}); };
    row.appendChild(again); main.appendChild(row);
    return;
  }
  const q=test.qs[test.idx];
  main.appendChild(el(`<div class="eyebrow">question ${test.idx+1} / ${test.qs.length} · ${test.score} correct</div>`));
  const card=el(`<div class="card"><h2>${esc(q.title)}</h2><pre class="code">${esc(q.context)}</pre></div>`);
  const blank=el(`<div class="blank"><div class="q">${esc(q.question)}</div></div>`);
  q.options.forEach((opt,oi)=>{
    const b=el(`<button class="opt">${esc(opt)}</button>`);
    b.onclick=()=>{
      if(test.answered) return;
      test.answered=true;
      const correct=oi===q.answer;
      if(correct) test.score++;
      blank.querySelectorAll(".opt").forEach((x,xi)=>{
        if(xi===q.answer) x.classList.add("correct");
        if(xi===oi && !correct) x.classList.add("wrong");
        x.style.pointerEvents="none";
      });
      if(q.whys) blank.appendChild(el(`<div class="why-line">${esc(q.whys[q.answer])}</div>`));
      const nrow=el(`<div class="row"></div>`);
      const nb=el(`<button class="btn go">${test.idx+1<test.qs.length?"next ›":(test.build&&!test.build.done?"build round ›":"see score ›")}</button>`);
      nb.onclick=()=>{ test.idx++; test.answered=false; render(); window.scrollTo({top:0}); };
      nrow.appendChild(nb); card.appendChild(nrow);
    };
    blank.appendChild(b);
  });
  card.appendChild(blank);
  main.appendChild(card);
}

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---- distribute answer positions ----
   The authored data lists the correct choice first for readability. Permute each
   question once per load (options + parallel whys, tracking the answer) so no
   module leans on "it's usually the first one" — the same guard test mode applies. */
function permuteChoices(q){
  const order=shuffle(q.options.map((_,i)=>i));
  q.options=order.map(i=>q.options[i]);
  if(q.whys) q.whys=order.map(i=>q.whys[i]);
  q.answer=order.indexOf(q.answer);
}
Object.keys(DRILLS).forEach(mod=>DRILLS[mod].forEach(d=>permuteChoices(d.blank)));
QUIZ.forEach(permuteChoices);

/* ---- go ---- */
loadProgress();
render();
document.getElementById("resetbtn").onclick=resetProgress;

/* ---- offline support: install + work with no network ---- */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}
