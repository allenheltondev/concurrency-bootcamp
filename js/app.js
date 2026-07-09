"use strict";
/* Course engine — state, persistence, rendering, the write-it sandbox, and
   test mode. Loaded last, after content + packs. COURSE-AGNOSTIC: everything
   course-specific comes from the shared globals a course's content.js defines
   (COURSE config, MODULES with per-module metadata, LESSONS, QUIZ, DRILLS,
   CARDS, BUGHUNT, WRITE, DRILL_LESSON, LESSON_PRACTICE) plus optional custom
   module renderers dispatched via MODULES[].renderFn. The full authoring
   contract lives in docs/COURSE_PATTERN.md. */
/* ===========================================================
   STATE + PERSISTENCE
   =========================================================== */
const CFG = (typeof COURSE !== "undefined" && COURSE) || {};
const KEY_PREFIX = CFG.storagePrefix || "cbootcamp";
const TOTAL = Object.values(DRILLS).reduce((n, l) => n + l.length, 0) + BUGHUNT.length + WRITE.length;
let state = { module:MODULES[0].id, solved:{} };

/* one-at-a-time stepping: where we are inside each stepped module */
let learnIdx = 0;                                          // current lesson chapter
let modelIdx = 0;                                          // current quiz question
let bugIdx = 0;                                            // current spot-the-bug card
let writeIdx = 0;                                          // current write-it exercise
// scored test mode. mode: "normal" | "review" | "sim". deadline/expired only for sim.
let test = { on:false, mode:"normal", qs:[], idx:0, score:0, answered:false, build:null, deadline:0, expired:false, cleared:0 };
let drillIdx = Object.fromEntries(Object.keys(DRILLS).map(k=>[k,0]));  // current drill per module
let quizDone = {};                                         // qi -> answered correctly (in-memory)
let simTimer = null;                                       // the ONE interview-sim countdown interval (cleared before re-arm)
let examBuildRunning = false;                              // a scored build-round sandbox is mid-run — don't rip it out on expiry

const STORAGE_KEY=KEY_PREFIX+":solved";
const POSITION_KEY=KEY_PREFIX+":position";   // where the user left off (lessons + skills)
const MISS_KEY=KEY_PREFIX+":misses";         // persisted snapshots of missed questions + failed builds, for review mode

/* ---- miss store: dedupe by stable key, cap 50, evict oldest, defensive like every storage helper ---- */
function loadMisses(){
  try{ const raw=localStorage.getItem(MISS_KEY); if(raw){ const a=JSON.parse(raw); if(Array.isArray(a)) return a; } }catch(e){}
  return [];
}
function saveMisses(a){ try{ localStorage.setItem(MISS_KEY,JSON.stringify(a)); }catch(e){} }
function recordMiss(entry){
  if(!entry||!entry.key) return;
  try{
    const a=loadMisses().filter(m=>m&&m.key!==entry.key);  // dedupe: drop any prior with this key
    a.push(entry);                                         // most-recent lands at the end
    while(a.length>50) a.shift();                          // cap 50, evict oldest
    saveMisses(a);
  }catch(e){}
}
function removeMiss(key){
  try{ const a=loadMisses(); const b=a.filter(m=>m&&m.key!==key);
    if(b.length!==a.length){ saveMisses(b); return true; } }catch(e){}
  return false;
}
function missCount(){ return loadMisses().length; }
function mcMisses(){ return loadMisses().filter(m=>m&&!m.buildId); }
function buildMisses(){ return loadMisses().filter(m=>m&&m.buildId); }
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
  if(!confirm("Reset all progress? This clears solved drills, quiz answers, missed questions, and your place in every module.")) return;
  try{ localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(POSITION_KEY); localStorage.removeItem(MISS_KEY); }catch(e){}
  state.solved={}; quizDone={};
  learnIdx=0; modelIdx=0; bugIdx=0; writeIdx=0;
  drillIdx=Object.fromEntries(Object.keys(DRILLS).map(k=>[k,0]));
  clearSimTimer();
  test={ on:false, mode:"normal", qs:[], idx:0, score:0, answered:false, build:null, deadline:0, expired:false, cleared:0 };
  for(const k in writeMem) delete writeMem[k];
  state.module=MODULES[0].id;
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
  clearSimTimer();          // the app fully rebuilds #main below — never let a countdown interval outlive its DOM
  savePosition();
  renderNav();
  main.innerHTML="";
  const m=MODULES.find(x=>x.id===state.module);
  if(m.type==="learn") renderLearn();
  else if(m.type==="lesson") renderModel(m);
  else if(m.type==="drills") renderDrills(m);
  else if(m.type==="cards") renderCards();
  else if(m.type==="bugs") renderBugHunt(m);
  else if(m.type==="write") renderWrite(m);
  else if(m.type==="sheet") renderSheet(m);
  else if(m.type==="test") renderTest(m);
  // course-provided module (e.g. a simulator): { type:"sim"|"custom", renderFn:"fnName" }
  else if(m.renderFn && typeof globalThis[m.renderFn]==="function") globalThis[m.renderFn](m);
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

/* ---- one-at-a-time stepper control (prev · n/total · next) ----
   Pass `labels` (one name per item) to make the n/total indicator a
   clickable menu that jumps straight to any item by name. */
function stepperRow(idx, total, go, labels){
  const row=el(`<div class="row" style="justify-content:space-between;align-items:center;margin-top:14px"></div>`);
  const prev=el(`<button class="btn">‹ prev</button>`);
  const pos=(labels && labels.length===total) ? jumpIndicator(idx, total, go, labels)
                                              : el(`<span class="ctrl">${idx+1} / ${total}</span>`);
  const next=el(`<button class="btn go">next ›</button>`);
  if(idx===0) prev.disabled=true;
  if(idx===total-1) next.disabled=true;
  prev.onclick=()=>go(idx-1);
  next.onclick=()=>go(idx+1);
  row.append(prev,pos,next);
  return row;
}

/* the "4 / 26" indicator, upgraded to a jump-to-item menu */
function jumpIndicator(idx, total, go, labels){
  const wrap=el(`<div class="stepjump"></div>`);
  const btn=el(`<button class="ctrl posbtn" aria-haspopup="listbox" aria-expanded="false">${idx+1} / ${total} <span class="caret">▾</span></button>`);
  const menu=el(`<div class="stepmenu" role="listbox" hidden></div>`);
  const close=()=>{
    menu.hidden=true; btn.setAttribute("aria-expanded","false");
    document.removeEventListener("click",onDoc,true);
    document.removeEventListener("keydown",onKey,true);
  };
  const onDoc=(e)=>{ if(!wrap.contains(e.target)) close(); };
  const onKey=(e)=>{ if(e.key==="Escape") close(); };
  labels.forEach((label,i)=>{
    const item=el(`<button class="stepitem ${i===idx?"cur":""}" role="option" aria-selected="${i===idx}"><span class="num">${i+1}</span><span>${esc(label)}</span></button>`);
    item.onclick=()=>{ close(); if(i!==idx) go(i); };
    menu.appendChild(item);
  });
  btn.onclick=(e)=>{
    e.stopPropagation();
    if(menu.hidden){
      menu.hidden=false; btn.setAttribute("aria-expanded","true");
      const cur=menu.querySelector(".stepitem.cur"); if(cur) cur.scrollIntoView({block:"nearest"});
      document.addEventListener("click",onDoc,true);
      document.addEventListener("keydown",onKey,true);
    } else close();
  };
  wrap.append(btn,menu);
  return wrap;
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
  main.appendChild(stepperRow(learnIdx, LESSONS.length, (i)=>{ learnIdx=i; render(); window.scrollTo({top:0}); }, LESSONS.map(l=>l.title)));

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
const QUIZ_MODULE = MODULES.find(m=>m.type==="lesson");
function buildQuizCard(q, qi){
  const done=!!quizDone[qi];
  const note=(QUIZ_MODULE&&QUIZ_MODULE.cardNote)||"predict the output";
  const card=el(`<div class="card"><div class="why">// ${esc(note)}</div><pre class="code">${esc(q.code)}</pre></div>`);
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

/* the predict-output questions have no title — name each by its first line */
function quizLabel(q){
  const first=(q.code||"").split("\n").map(s=>s.trim()).find(Boolean)||"";
  return first.length>52 ? first.slice(0,51)+"…" : first;
}

function renderModel(m){
  main.appendChild(el(`<div>
    <div class="eyebrow">${m.eyebrow||""}</div>
    <h1>${m.title||m.label}</h1>
    ${m.lead?`<p class="lead">${m.lead}</p>`:""}
    ${m.sub?`<p class="sub">${m.sub}</p>`:""}
  </div>`));
  if(m.conceptLesson!=null){ const row=conceptLinkRow(m.conceptLesson); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }

  modelIdx=Math.max(0,Math.min(modelIdx,QUIZ.length-1));
  main.appendChild(buildQuizCard(QUIZ[modelIdx], modelIdx));
  main.appendChild(stepperRow(modelIdx, QUIZ.length, (i)=>{ modelIdx=i; render(); window.scrollTo({top:0}); }, QUIZ.map(quizLabel)));
}

/* ---- drills (fill the blank) — header copy comes from the MODULES entry ---- */
function renderDrills(m){
  const modId=m.id;
  const list=DRILLS[modId];
  main.appendChild(el(`<div><div class="eyebrow">${m.eyebrow||""}</div><h1>${m.title||m.label}</h1>${m.lead?`<p class="lead">${m.lead}</p>`:""}</div>`));

  const idx=Math.max(0,Math.min(drillIdx[modId]||0, list.length-1));
  drillIdx[modId]=idx;
  main.appendChild(buildDrillCard(list[idx]));
  main.appendChild(stepperRow(idx, list.length, (i)=>{ drillIdx[modId]=i; render(); window.scrollTo({top:0}); }, list.map(d=>d.title)));
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
function renderBugHunt(m){
  main.appendChild(el(`<div>
    <div class="eyebrow">${m.eyebrow||""}</div><h1>${m.title||m.label}</h1>
    ${m.lead?`<p class="lead">${m.lead}</p>`:""}
    ${m.sub?`<p class="sub">${m.sub}</p>`:""}
  </div>`));
  bugIdx=Math.max(0,Math.min(bugIdx,BUGHUNT.length-1));
  main.appendChild(buildBugCard(BUGHUNT[bugIdx]));
  main.appendChild(stepperRow(bugIdx, BUGHUNT.length, (i)=>{ bugIdx=i; render(); window.scrollTo({top:0}); }, BUGHUNT.map(b=>b.title)));
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

/* ---- flashcards ---- */
let cardIdx=0, cardFlipped=false;
function renderCards(){
  const m=MODULES.find(x=>x.id===state.module);   // flip/prev/next re-enter here directly
  main.innerHTML="";   // clear so we replace, not stack
  main.appendChild(el(`<div><div class="eyebrow">${m.eyebrow||""}</div><h1>${m.title||m.label}</h1>
    ${m.lead?`<p class="lead">${m.lead}</p>`:""}</div>`));
  if(m.conceptLesson!=null){ const row=conceptLinkRow(m.conceptLesson); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }
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
    if(exam) examBuildRunning=true;          // so a sim expiry lets this run finish before scoring
    cons.style.display="block"; cons.textContent="running your code in a sandbox…";
    const src=[w.pre, ...chosen.map(ii=>items[ii].code), w.post].join("\n");
    const r=await sandboxRun(src, w.test, w.pass);
    if(exam) examBuildRunning=false;
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

function renderWrite(m){
  main.appendChild(el(`<div>
    <div class="eyebrow">${m.eyebrow||""}</div><h1>${m.title||m.label}</h1>
    ${m.lead?`<p class="lead">${m.lead}</p>`:""}
    ${m.sub?`<p class="sub">${m.sub}</p>`:""}
  </div>`));
  writeIdx=Math.max(0,Math.min(writeIdx,WRITE.length-1));
  main.appendChild(buildWriteCard(WRITE[writeIdx]));
  main.appendChild(stepperRow(writeIdx, WRITE.length, (i)=>{ writeIdx=i; render(); window.scrollTo({top:0}); }, WRITE.map(w=>w.title)));
}

/* ---- test mode: randomized, shuffled options, scored, no hints until you answer ---- */
function testPool(){
  const out=[];
  Object.keys(DRILLS).forEach(mod=>DRILLS[mod].forEach(d=>out.push(
    {title:d.title, context:d.pre, question:d.blank.q, options:d.blank.options, answer:d.blank.answer, whys:d.blank.whys})));
  const qTitle=(QUIZ_MODULE&&QUIZ_MODULE.poolTitle)||"Predict the output";
  const qQuestion=(QUIZ_MODULE&&QUIZ_MODULE.poolQuestion)||"What is the outcome?";
  QUIZ.forEach(q=>out.push(
    {title:qTitle, context:q.code, question:qQuestion, options:q.options, answer:q.answer, whys:q.whys}));
  return out;
}
function shuffle(a){ const x=a.slice(); for(let i=x.length-1;i>0;i--){ const j=rnd(i+1); [x[i],x[j]]=[x[j],x[i]]; } return x; }
function shuffleOptions(q){
  const order=shuffle(q.options.map((_,i)=>i));
  return { ...q, options:order.map(i=>q.options[i]), whys:q.whys?order.map(i=>q.whys[i]):null, answer:order.indexOf(q.answer) };
}
// a stable snapshot of a missed MC question, for the review store
function mcSnapshot(q){
  return { title:q.title, context:q.context, question:q.question,
           options:q.options, answer:q.answer, whys:q.whys||null,
           key:q.title+"|"+q.question };
}
function startTest(n){
  let pool=shuffle(testPool());
  if(n!=="all") pool=pool.slice(0,n);
  // every test ends with a build round: one write-it exercise, first run counts
  test={ on:true, mode:"normal", qs:pool.map(shuffleOptions), idx:0, score:0, answered:false,
         build:{ ex:WRITE[rnd(WRITE.length)], done:false, pass:false }, deadline:0, expired:false, cleared:0 };
  render(); window.scrollTo({top:0});
}
const SIM_MC=12, SIM_MS=25*60*1000;                        // interview sim: 12 questions + build, 25 minutes
function startSim(){
  const pool=shuffle(testPool()).slice(0,SIM_MC);           // dynamic pool: never more than exists
  test={ on:true, mode:"sim", qs:pool.map(shuffleOptions), idx:0, score:0, answered:false,
         build:{ ex:WRITE[rnd(WRITE.length)], done:false, pass:false },
         deadline:Date.now()+SIM_MS, expired:false, cleared:0 };
  render(); window.scrollTo({top:0});
}
// review only the questions/build the user has missed. correct clears; wrong keeps. no NEW snapshots recorded here.
function startReview(){
  const qs=mcMisses().map(m=>shuffleOptions({
    title:m.title, context:m.context, question:m.question,
    options:m.options, answer:m.answer, whys:m.whys||null, key:m.key }));
  let build=null;
  const bm=buildMisses();
  if(bm.length){ const ex=WRITE.find(w=>w.id===bm[0].buildId); if(ex) build={ ex, done:false, pass:false }; }
  test={ on:true, mode:"review", qs, idx:0, score:0, answered:false, build, deadline:0, expired:false, cleared:0 };
  render(); window.scrollTo({top:0});
}

/* ---- interview-sim countdown: exactly one interval, cleaned up on every render/module switch ---- */
function clearSimTimer(){ if(simTimer){ clearInterval(simTimer); simTimer=null; } }
function fmtClock(ms){
  ms=Math.max(0,ms); const s=Math.round(ms/1000);
  return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
}
function simClockHtml(){
  return test.mode==="sim" ? ` · <span class="clock" data-clock>${fmtClock(test.deadline-Date.now())}</span>` : "";
}
function armSimClock(){
  clearSimTimer();
  if(!test.on || test.mode!=="sim" || test.expired) return;   // no clock once time's already handled
  const tick=()=>{
    const rem=test.deadline-Date.now();
    const clock=main.querySelector("[data-clock]");
    if(clock){ clock.textContent=fmtClock(rem); clock.classList.toggle("low", rem<=5*60*1000); }
    if(rem<=0) expireSim();
  };
  tick();
  simTimer=setInterval(tick,1000);
}
// time's up: unanswered MC count wrong, an unrun build counts failed. don't interrupt a running sandbox.
function expireSim(){
  if(!test.on || test.mode!=="sim" || test.expired) return;
  if(test.idx<test.qs.length){                 // still in multiple choice — abandon the rest
    test.expired=true; clearSimTimer(); render(); window.scrollTo({top:0}); return;
  }
  if(test.build && !test.build.done){          // build round, not yet scored
    if(examBuildRunning){ test.expired=true; return; }  // a run is in flight: let it finish, its onScored will finalize
    test.build.done=true; test.build.pass=false;
  }
  test.expired=true; clearSimTimer(); render(); window.scrollTo({top:0});
}
function renderTest(m){
  if(!test.on){
    const total=testPool().length, misses=missCount();
    const lead=(m&&m.lead)||`No hints. First answer counts, and the options are shuffled — so you can't lean on "it's usually the first one." Random questions, then a <b style="color:var(--text)">build round</b> to finish: assemble one implementation from its line bank and run it — the first run is the one that counts.`;
    main.appendChild(el(`<div>
      <div class="eyebrow">${(m&&m.eyebrow)||"test yourself"}</div><h1>${(m&&m.title)||"Test mode"}</h1>
      <p class="lead">${lead}</p>
      ${m&&m.sub?`<p class="sub">${m.sub}</p>`:""}
    </div>`));
    // three tiers, single column, one thumb
    const col=el(`<div class="row" style="flex-direction:column;align-items:stretch"></div>`);
    const tiers=[
      ["quick test · 10 + build", ()=>startTest(10)],
      ["full test · "+total+" + build", ()=>startTest("all")],
      ["interview sim · 25 min", ()=>startSim()],
    ];
    tiers.forEach(([label,fn])=>{ const b=el(`<button class="btn go">${label}</button>`); b.onclick=fn; col.appendChild(b); });
    main.appendChild(col);
    if(misses){
      const rev=el(`<div class="row" style="margin-top:12px"></div>`);
      const b=el(`<button class="btn review">↻ review ${misses} miss${misses===1?"":"es"}</button>`);
      b.onclick=()=>startReview(); rev.appendChild(b);
      main.appendChild(rev);
    }
    return;
  }
  // score screen when MC + build are exhausted, or when the sim clock expired
  const buildPending = test.build && !test.build.done && !test.expired;
  if((test.idx>=test.qs.length && !buildPending) || (test.expired && !buildPending)){
    return renderTestScore();
  }
  if(test.idx>=test.qs.length){
    // build round: multiple choice is done — now write one, first run counts
    const isReview=test.mode==="review";
    main.appendChild(el(`<div class="eyebrow">build round · ${test.score} correct so far${simClockHtml()}</div>`));
    main.appendChild(el(`<div><h1>Now write one</h1><p class="lead">${isReview?"A build you missed. ":"Multiple choice is over. "}Assemble this implementation from its line bank, then run it — <b style="color:var(--text)">your first run is the one that counts</b>, pass or fail.</p></div>`));
    const card=buildWriteCard(test.build.ex,{ exam:true, onScored:(pass)=>{
      test.build.done=true; test.build.pass=pass;
      if(pass) test.score++;
      const bkey="build|"+test.build.ex.id;
      if(test.mode==="review"){ if(pass && removeMiss(bkey)) test.cleared++; }   // pass clears it; fail keeps it
      else if(!pass) recordMiss({ buildId:test.build.ex.id, key:bkey });          // normal/sim: a failed build is reviewable
      if(test.mode==="sim" && test.expired){ clearSimTimer(); render(); window.scrollTo({top:0}); return; }  // finished after expiry
      const nrow=el(`<div class="row"></div>`);
      const nb=el(`<button class="btn go">see score ›</button>`);
      nb.onclick=()=>{ render(); window.scrollTo({top:0}); };
      nrow.appendChild(nb); card.appendChild(nrow);
    }});
    main.appendChild(card);
    armSimClock();
    return;
  }
  const q=test.qs[test.idx];
  main.appendChild(el(`<div class="eyebrow">question ${test.idx+1} / ${test.qs.length} · ${test.score} correct${simClockHtml()}</div>`));
  const card=el(`<div class="card"><h2>${esc(q.title)}</h2><pre class="code">${esc(q.context)}</pre></div>`);
  const blank=el(`<div class="blank"><div class="q">${esc(q.question)}</div></div>`);
  q.options.forEach((opt,oi)=>{
    const b=el(`<button class="opt">${esc(opt)}</button>`);
    b.onclick=()=>{
      if(test.answered) return;
      test.answered=true;
      const correct=oi===q.answer;
      if(correct){
        test.score++;
        if(test.mode==="review" && q.key && removeMiss(q.key)) test.cleared++;   // got it right this time — off the list
      } else if(test.mode!=="review"){
        recordMiss(mcSnapshot(q));                                               // review never ADDS; other modes do
      }                                                                          // review + wrong: keep it, no double-add
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
  armSimClock();
}

function renderTestScore(){
  const nq=test.qs.length, n=nq+(test.build?1:0), s=test.score, pct=n?Math.round(100*s/n):0;
  const msg = pct>=90?"Sharp — you're ready." : pct>=70?"Solid. Patch the misses and you're close." : "Worth another pass through the drills.";
  const mc = s-(test.build&&test.build.pass?1:0);
  const buildLine = test.build
    ? `<p class="sub">${mc} / ${nq} multiple choice · build round (${esc(test.build.ex.title.replace(/ — write it$/,""))}): ${test.build.pass?'<span style="color:var(--ordered)">✓ passed</span>':'<span style="color:var(--race)">✗ failed</span>'}</p>`
    : `<p class="sub">${mc} / ${nq} multiple choice</p>`;
  let eyebrow="result", extra="";
  if(test.mode==="sim"){
    eyebrow="interview sim result";
    if(test.expired) extra=`<p class="sub" style="color:var(--race)">time expired — unanswered questions counted wrong</p>`;
  } else if(test.mode==="review"){
    eyebrow="review result";
    extra=`<p class="sub">${test.cleared} cleared, ${missCount()} still on the list</p>`;
  }
  main.appendChild(el(`<div><div class="eyebrow">${eyebrow}</div><h1>${s} / ${n} <span class="sub" style="font-size:17px">· ${pct}%</span></h1><p class="lead">${msg}</p>${buildLine}${extra}</div>`));
  const row=el(`<div class="row"></div>`);
  const again=el(`<button class="btn go">▶ back to test menu</button>`); again.onclick=()=>{ test.on=false; render(); window.scrollTo({top:0}); };
  row.appendChild(again); main.appendChild(row);
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

// header brand = home: back to the first module (lessons), same path as its nav chip
document.getElementById("homebtn").onclick=()=>{ state.module=MODULES[0].id; render(); window.scrollTo({top:0}); };

/* ---- offline support: install + work with no network ---- */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}

/* ---- PWA install: Chrome buries its install affordance in the ⋮ menu, so
   surface our own button whenever the browser says the app is installable ---- */
let installPrompt=null;
const installBtn=document.getElementById("installbtn");
window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();               // suppress the mini-infobar; we own the UI
  installPrompt=e; installBtn.hidden=false;
});
installBtn.onclick=async()=>{
  if(!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(()=>{});
  installPrompt=null; installBtn.hidden=true;  // a prompt object is single-use either way
};
window.addEventListener("appinstalled",()=>{ installPrompt=null; installBtn.hidden=true; });
