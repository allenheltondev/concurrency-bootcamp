"use strict";
/* Distributed Systems Bootcamp — course-owned module: the unreliable-network
   simulator. This course's counterpart to the root course's workers/atomics
   race: instead of threads losing increments, clients retry payments through
   a lossy network and — without idempotency keys — the server double-charges.

   The generic engine (../js/app.js) knows nothing about it: the MODULES entry
   in js/content.js points here with { type:"sim", renderFn:"renderNetSimModule" }
   and the engine dispatches through globalThis. Loaded after content.js,
   before the engine — the engine helpers (el, main, conceptLinkRow) are
   shared globals that exist by the time this renders. */

let netsim={clients:3, loss:30, dedupe:false};
const MAX_ATTEMPTS=6;

/* One full run: every client keeps retrying its payment until an ack arrives
   (or it gives up). The network drops requests AND acks at `loss`%. With
   dedupe on, the server keeps a seen-set of idempotency keys and replays the
   recorded ack instead of applying again. */
async function runNetSim({clients,loss,dedupe},onEvent){
  const seen=new Set();
  let applied=0;
  const appliedIds=new Set();
  const drop=()=>rnd(100)<loss;
  for(let c=1;c<=clients;c++){
    const id="pay-"+c;
    let acked=false;
    for(let attempt=1;attempt<=MAX_ATTEMPTS && !acked;attempt++){
      await onEvent({c,t:`C${c} ${attempt>1?"retry":"send"} ${id}`});
      if(drop()){ await onEvent({c,t:`✗ request lost`,bad:true}); continue; }
      if(dedupe && seen.has(id)){
        await onEvent({c,t:`server: dup ${id} → replay ack`,good:true});
      }else{
        seen.add(id); applied++; appliedIds.add(id);
        await onEvent({c,t:`server: charge → ${applied}`});
      }
      if(drop()){ await onEvent({c,t:`✗ ack lost`,bad:true}); continue; }
      acked=true;
      await onEvent({c,t:`C${c} ✓ acked`,good:true});
    }
    if(!acked) await onEvent({c,t:`C${c} gave up — no ack after ${MAX_ATTEMPTS} tries`,bad:true});
  }
  const dup=applied-appliedIds.size;
  const missing=clients-appliedIds.size;
  return {applied,expected:clients,dup,missing};
}

function renderNetSimModule(mod){
  main.appendChild(el(`<div>
    <div class="eyebrow">${mod.eyebrow||"module"}</div>
    <h1>The unreliable network</h1>
    <p class="lead">This is the defining physics of distributed systems: a message can be <b style="color:var(--text)">lost, delayed, duplicated, or reordered</b> — and the sender can't tell which happened. Below, clients charge a payment through a lossy network and retry on silence. Watch what the retries do to the server's ledger.</p>
    <p class="sub">Run it with <b style="color:var(--text)">idempotency keys</b> off a few times — every lost <i>ack</i> becomes a duplicate charge, and differently many each run. Flip the toggle and the count comes out exact no matter what the network eats.</p>
  </div>`));
  if(mod.conceptLesson!=null){ const row=conceptLinkRow(mod.conceptLesson); if(row){ row.style.margin="0 0 16px"; main.appendChild(row); } }

  const card=el(`<div class="card"><h2>Payment retry storm</h2><div class="why">// each client retries until acked — the network drops loss% of everything</div></div>`);

  const ctrls=el(`<div class="ctrls"></div>`);
  const cEl=el(`<label class="ctrl">clients <input type="range" min="2" max="4" value="${netsim.clients}"> <b style="color:var(--text)" data-cv>${netsim.clients}</b></label>`);
  const lEl=el(`<label class="ctrl">loss % <input type="range" min="10" max="50" step="10" value="${netsim.loss}"> <b style="color:var(--text)" data-lv>${netsim.loss}</b></label>`);
  const dEl=el(`<div class="toggle ${netsim.dedupe?"on":""}"><div class="switch"></div> idempotency keys</div>`);
  cEl.querySelector("input").oninput=e=>{netsim.clients=+e.target.value;cEl.querySelector("[data-cv]").textContent=netsim.clients;};
  lEl.querySelector("input").oninput=e=>{netsim.loss=+e.target.value;lEl.querySelector("[data-lv]").textContent=netsim.loss;};
  dEl.onclick=()=>{netsim.dedupe=!netsim.dedupe;dEl.classList.toggle("on",netsim.dedupe);};
  ctrls.append(cEl,lEl,dEl);
  card.appendChild(ctrls);

  const runBtn=el(`<button class="btn go">▶ send the payments</button>`);
  const tape=el(`<div class="tape"></div>`);
  const result=el(`<div class="result" style="display:none"></div>`);
  const colors=["var(--accent)","var(--ordered)","var(--race)","#e0c25a"];

  runBtn.onclick=async()=>{
    runBtn.disabled=true; const old=runBtn.textContent; runBtn.textContent="sending…";
    tape.innerHTML=""; result.style.display="none";
    const out=await runNetSim({...netsim},async(ev)=>{
      const chip=el(`<span class="step">${esc(ev.t)}</span>`);
      const color=ev.bad?"var(--race)":ev.good?"var(--ordered)":colors[(ev.c-1)%colors.length];
      chip.style.borderColor=color; chip.style.color=color;
      tape.appendChild(chip);
      await sleep(90);
    });
    result.style.display="block";
    const exact=out.dup===0 && out.missing===0;
    result.className="result "+(exact?"exact":"lost");
    result.textContent=`charged ${out.applied} time(s) for ${out.expected} payment(s)`
      +(out.dup?`  ·  ${out.dup} duplicate charge${out.dup>1?"s":""}`:"")
      +(out.missing?`  ·  ${out.missing} never landed`:"")
      +(exact?"  ·  exact":"");
    runBtn.disabled=false; runBtn.textContent=old;
  };
  card.appendChild(el(`<div class="row"></div>`)).appendChild(runBtn);
  card.appendChild(tape);
  card.appendChild(result);
  main.appendChild(card);

  main.appendChild(el(`<div class="card">
    <div class="why">// the fix, in real server code</div>
    <pre class="code"><span class="cm">// naive — every delivery is a fresh charge</span>
app.post("/charge", (req) =&gt; {
  ledger.apply(req.amount);          <span class="cm">// a retry charges AGAIN</span>
  return { ok: true };
});

<span class="cm">// safe — the client sends a stable idempotency key;</span>
<span class="cm">// the server records it and replays the recorded reply</span>
app.post("/charge", (req) =&gt; {
  <span class="ok">const prior = processed.get(req.idempotencyKey);</span>
  <span class="ok">if (prior) return prior;             // duplicate → same answer</span>
  const reply = ledger.apply(req.amount);
  <span class="ok">processed.set(req.idempotencyKey, reply);</span>
  return reply;
});</pre>
    <p class="sub" style="margin-bottom:0">The client's timeout is <b style="color:var(--text)">ambiguity</b>, not failure — the charge may have landed even though the ack didn't. Retrying is the right move; the key is what makes "again" mean "the same one" instead of "one more". At-least-once delivery + an idempotent receiver = <b style="color:var(--text)">effectively once</b>.</p>
  </div>`));
}
