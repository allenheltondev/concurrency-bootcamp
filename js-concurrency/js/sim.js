"use strict";
/* Concurrency Bootcamp — course-owned module: the workers & atomics simulator.
   This is the js-concurrency course's custom module. The generic engine
   (js/app.js) knows nothing about it: the MODULES entry in js/content.js
   points here with { type:"sim", renderFn:"renderSimModule" } and the engine
   dispatches through globalThis. Loaded after content.js, before app.js —
   the engine helpers (el, main, conceptLinkRow) are shared globals that exist
   by the time this renders. */

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

function renderSimModule(mod){
  const real=REAL_RACE;
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow||"module"}</div>
    <h1>Workers &amp; Atomics</h1>
    <p class="lead">This is the one place JS has a real data race: multiple worker threads touching the same <b style="color:var(--text)">SharedArrayBuffer</b>. A plain <code style="font-family:var(--mono)">counter++</code> is three steps — read, add, write — and concurrent threads interleave those steps and clobber each other.</p>
    <p class="sub">${real
      ? `This page is <b style="color:var(--ordered)">cross-origin isolated</b>, so the run below spins up <b style="color:var(--text)">real Worker threads</b> over a genuine SharedArrayBuffer. With <b style="color:var(--text)">Atomic</b> off the count comes out wrong — and differently wrong each run. Flip it on and it&rsquo;s exact every time.`
      : `Real SharedArrayBuffer needs cross-origin isolation, which isn&rsquo;t available here, so the run below <b style="color:var(--text)">simulates</b> the interleaving step by step. The lost-update behavior is identical. Flip <b style="color:var(--text)">Atomic</b> off and run it a few times.`}</p>
  </div>`));
  if(mod.conceptLesson!=null){ const row=conceptLinkRow(mod.conceptLesson); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }

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
