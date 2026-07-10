"use strict";
/* Agent Memory Bootcamp — course-owned module: the evolving-profile simulator.
   This course's counterpart to the other courses' live demos: two weeks of
   episodes stream in — repetitions, a contradiction, and (slider) noise — and
   you watch what the NEXT session inherits. With consolidation OFF, memory is
   an append-only log packed newest-first into a small budget: noise spends the
   seats, early facts fall off the back, and contradictions ship unresolved.
   Flip consolidation ON and every episode folds into one living profile that
   stays current, compact, and immune to the noise.

   The generic engine (../js/app.js) knows nothing about it: the MODULES entry
   in js/content.js points here with { type:"sim", renderFn:"renderMemSimModule" }
   and the engine dispatches through globalThis. Loaded after content.js,
   before the engine — the engine helpers (el, main, esc, conceptLinkRow) are
   shared globals that exist by the time this renders. */

let memsim={consolidate:false, budget:32, noise:2};

/* the fortnight: repetition, drift, and one real contradiction */
const MEMSIM_EPISODES=[
  {day:1,  text:"orders a coffee before standup",             facts:{drink:"coffee"}},
  {day:2,  text:"thanks, sounds good!",                        facts:null},
  {day:3,  text:"coffee again, as usual",                      facts:{drink:"coffee"}},
  {day:4,  text:"lives in Austin near the office",             facts:{city:"Austin"}},
  {day:6,  text:"ok cool",                                     facts:null},
  {day:8,  text:"booked a window seat, always prefers it",     facts:{seat:"window"}},
  {day:10, text:"moved to Denver last month",                  facts:{city:"Denver"}},
  {day:13, text:"switched to tea, cutting caffeine",           facts:{drink:"tea"}},
  {day:14, text:"window seat again for the return flight",     facts:{seat:"window"}},
];
const MEMSIM_NOISE=["haha nice","ok thanks!","sounds great","hello again!","cool cool","have a good one"];
const MEMSIM_TRUTH={drink:"tea", city:"Denver", seat:"window"};

function memsimEpisodes(noise){
  const eps=MEMSIM_EPISODES.slice();
  for(let i=0;i<noise;i++) eps.push({day:15+i,text:MEMSIM_NOISE[i%MEMSIM_NOISE.length],facts:null});
  return eps;
}

/* one full run: stream the episodes, then assemble the next session's memory */
async function runMemSim({consolidate,budget,noise},onEvent){
  const eps=memsimEpisodes(noise);
  const profile=new Map();                       // key -> {value, strength}
  const log=[];
  for(const ep of eps){
    if(!consolidate){
      log.push(ep);
      await onEvent({t:`d${ep.day} log: "${ep.text}"`,noise:!ep.facts});
      continue;
    }
    if(!ep.facts){ await onEvent({t:`d${ep.day} skip (noise): "${ep.text}"`,noise:true}); continue; }
    for(const [k,v] of Object.entries(ep.facts)){
      const cur=profile.get(k);
      if(!cur){ profile.set(k,{value:v,strength:1}); await onEvent({t:`d${ep.day} learned ${k}=${v}`,good:true}); }
      else if(cur.value===v){ cur.strength++; await onEvent({t:`d${ep.day} reinforced ${k}=${v} ×${cur.strength}`,good:true}); }
      else{ await onEvent({t:`d${ep.day} revised ${k}: ${cur.value} → ${v}`,revise:true}); cur.value=v; cur.strength=1; }
    }
  }
  // assemble what the NEXT session inherits
  if(consolidate){
    const lines=[...profile.entries()].map(([k,v])=>`${k}: ${v.value} (×${v.strength})`);
    const tokens=lines.reduce((n,l)=>n+approxTokens(l),0);
    const facts={}; for(const [k,v] of profile) facts[k]=v.value;
    return {mode:"profile",lines,tokens,facts};
  }
  const lines=[]; let tokens=0; const facts={}; let noiseTokens=0;
  for(let i=log.length-1;i>=0;i--){              // newest-first until the budget is spent
    const line=`d${log[i].day}: ${log[i].text}`;
    const t=approxTokens(line);
    if(tokens+t>budget) break;
    lines.unshift(line); tokens+=t;
    if(!log[i].facts) noiseTokens+=t;
    else for(const [k,v] of Object.entries(log[i].facts)) if(!(k in facts)) facts[k]=v;  // newest included wins
  }
  return {mode:"log",lines,tokens,facts,noiseTokens};
}

function memsimVerdict(out){
  const parts=[]; let current=0;
  for(const [k,truth] of Object.entries(MEMSIM_TRUTH)){
    if(!(k in out.facts)) parts.push(`${k}: missing ✗`);
    else if(out.facts[k]!==truth) parts.push(`${k}: ${out.facts[k]} (stale) ✗`);
    else { parts.push(`${k}: ${out.facts[k]} ✓`); current++; }
  }
  return {parts,current,total:Object.keys(MEMSIM_TRUTH).length};
}

function renderMemSimModule(mod){
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow||"module"}</div>
    <h1>The evolving profile</h1>
    <p class="lead">Two weeks of episodes arrive — the same preference repeated, a move to a new city, one real reversal, and some chatter. The question that decides everything: what does the <b style="color:var(--text)">next session</b> inherit?</p>
    <p class="sub">Run it with consolidation <b style="color:var(--text)">off</b> a few times: the raw log packs newest-first into a small budget, noise spends the seats, and the early facts fall off the back. Flip <b style="color:var(--text)">consolidation on</b> and every episode folds into one living profile — reinforced, revised, current — no matter how much noise you add.</p>
  </div>`));
  if(mod.conceptLesson!=null){ const row=conceptLinkRow(mod.conceptLesson); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }

  const card=el(`<div class="card"><h2>Two weeks of episodes</h2><div class="why">// repetition strengthens · contradiction revises · noise should cost nothing</div></div>`);

  const ctrls=el(`<div class="ctrls"></div>`);
  const nEl=el(`<label class="ctrl">extra noise <input type="range" min="0" max="6" value="${memsim.noise}"> <b style="color:var(--text)" data-nv>${memsim.noise}</b></label>`);
  const bEl=el(`<label class="ctrl">log budget <input type="range" min="32" max="96" step="16" value="${memsim.budget}"> <b style="color:var(--text)" data-bv>${memsim.budget}</b> tok</label>`);
  const cEl=el(`<div class="toggle ${memsim.consolidate?"on":""}"><div class="switch"></div> consolidation</div>`);
  nEl.querySelector("input").oninput=e=>{memsim.noise=+e.target.value;nEl.querySelector("[data-nv]").textContent=memsim.noise;};
  bEl.querySelector("input").oninput=e=>{memsim.budget=+e.target.value;bEl.querySelector("[data-bv]").textContent=memsim.budget;};
  cEl.onclick=()=>{memsim.consolidate=!memsim.consolidate;cEl.classList.toggle("on",memsim.consolidate);};
  ctrls.append(nEl,bEl,cEl);
  card.appendChild(ctrls);

  const runBtn=el(`<button class="btn go">▶ live the two weeks</button>`);
  const tape=el(`<div class="tape"></div>`);
  const handoff=el(`<pre class="code" style="display:none"></pre>`);
  const result=el(`<div class="result" style="display:none"></div>`);

  runBtn.onclick=async()=>{
    runBtn.disabled=true; const old=runBtn.textContent; runBtn.textContent="living…";
    tape.innerHTML=""; result.style.display="none"; handoff.style.display="none";
    const out=await runMemSim({...memsim},async(ev)=>{
      const chip=el(`<span class="step">${esc(ev.t)}</span>`);
      const color=ev.revise?"var(--race)":ev.good?"var(--ordered)":ev.noise?"var(--faint)":"var(--accent)";
      chip.style.borderColor=color; chip.style.color=color;
      tape.appendChild(chip);
      await sleep(110);
    });
    handoff.style.display="block";
    handoff.textContent=(out.mode==="profile"?"// next session inherits the PROFILE\n":"// next session inherits the newest log slice that fits\n")
      +out.lines.join("\n");
    const v=memsimVerdict(out);
    const exact=v.current===v.total;
    result.style.display="block";
    result.className="result "+(exact?"exact":"lost");
    result.textContent=`${v.parts.join("  ·  ")}   —   ${v.current}/${v.total} current · ${out.tokens} tokens`
      +(out.mode==="log"&&out.noiseTokens?` · ${out.noiseTokens} spent on noise`:"")
      +(exact&&out.mode==="profile"?" · evolved, compact, current":"");
    runBtn.disabled=false; runBtn.textContent=old;
  };
  card.appendChild(el(`<div class="row"></div>`)).appendChild(runBtn);
  card.appendChild(tape);
  card.appendChild(handoff);
  card.appendChild(result);
  main.appendChild(card);

  main.appendChild(el(`<div class="card">
    <div class="why">// the loop that makes the profile evolve</div>
    <pre class="code"><span class="cm">// append-only — the log grows, the window can't:</span>
log.push(episode);              <span class="cm">// noise and gold, same shelf</span>
context = newestThatFits(log);  <span class="cm">// early facts fall off the back</span>

<span class="cm">// consolidation — every episode folds into the aggregate:</span>
for (const f of episode.facts) {
  const cur = profile.get(f.key);
  if (!cur)                <span class="ok">profile.set(f.key, learn(f));</span>
  else if (cur.value === f.value) <span class="ok">cur.strength++;</span>
  else { <span class="ok">cur.history.push(cur.value); cur.value = f.value;</span>
         <span class="ok">cur.strength = 1;</span> }   <span class="cm">// revised — humble again</span>
}</pre>
    <p class="sub" style="margin-bottom:0">The log remembers <b style="color:var(--text)">everything and answers nothing</b>; the profile answers instantly because consolidation already did the reading. Episodic memory stays as the audit trail — the aggregate is the living view derived from it, one episode at a time.</p>
  </div>`));
}
