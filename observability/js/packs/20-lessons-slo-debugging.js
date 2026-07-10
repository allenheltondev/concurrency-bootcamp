"use strict";
/* Observability Bootcamp — content pack: the SLOs & alerting arc (lessons
   20-24), the debugging-production arc (lessons 25-28), and verifying
   observability (lesson 29). Loaded after pack 10, before the engine —
   appends LESSONS in place (indices 19-28; see the LESSON PLAN in
   js/content.js). Cross-links already registered in content.js. */
(function () {

  LESSONS.push(
  { eb:"lesson 20 · slos", title:"SLI, SLO, error budget", html:`
    <p class="big">"Is the service reliable?" is an argument. "Did 99.9% of checkout requests succeed in under 400ms this month?" is a measurement. That's the whole SLI/SLO move: <b class="hl">define reliability as a user-visible ratio, then promise a number</b> — and treat the distance to the promise as a budget you're allowed to spend.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the three-layer definition &middot; checkout, 30 days</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">SLI</div><div class="lstep seq" style="--i:0">the indicator, as a ratio of <b>good events over total events</b>: requests with status &lt; 500 AND latency &le; 400ms &divide; all requests</div>
        <div class="lanehead seq" style="--i:1">SLO</div><div class="lstep seq" style="--i:1">the target: SLI &ge; <b>99.9%</b> over a rolling 30 days — a promise about users, not about CPUs</div>
        <div class="lanehead seq" style="--i:2">budget</div><div class="lstep good seq pop" style="--i:2">1 − SLO = <b>0.1% may fail</b>: ~43.2 minutes of total failure, or 0.1% of requests forever — yours to spend</div>
      </div>
      <div class="dnote seq" style="--i:3">The budget is the political technology: reliability stops being "always more" and becomes <b style="color:var(--ordered)">a currency</b> — budget healthy? ship the risky migration. Budget torched? freeze features and harden. Both sides pre-agreed to the number, so the argument is already over.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two design rules keep SLOs honest. <b class="hl">Measure at the user's edge</b> — an SLI computed inside the service can't see the load balancer 502s or the DNS failures users experience; the closer to the user, the truer the ratio. And <b class="hl">make the good-event predicate computable from telemetry you already emit</b>: the latency threshold in the SLI is why lesson 07 told you to put a histogram boundary exactly at 400ms — compliance becomes a bucket sum instead of an interpolated guess.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the SLI as a query</div>
      <pre class="code"><span class="cm">// good events / total events, straight from RED telemetry:</span>
sum(rate(http_requests_total{route="/checkout",code!~"5.."}[30d]))
  and latency: sum(rate(http_duration_bucket{<span class="ok">le="400"</span>}[30d]))
/ sum(rate(http_requests_total{route="/checkout"}[30d]))
<span class="cm">// budget remaining = 1 - SLO  minus  1 - SLI(so far)</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> every alerting lesson after this one is arithmetic on the budget — burn rate is just "budget spent per unit time." And in design reviews, "what's the SLI?" is the adult version of "is it up?": it forces the room to say which failures count, measured from where, over what window.</p>` },

  { eb:"lesson 21 · slos", title:"Burn rate: the math of paging", html:`
    <p class="big">"Page when error rate &gt; 1%" wakes you for one bad minute and sleeps through a week-long leak. The fix is to alert on the budget's <b class="hl">spending velocity</b>: <b class="hl">burn rate = observed error rate &divide; budget rate</b>. Burn 1 spends the 30-day budget in exactly 30 days; burn 14.4 torches it in 50 hours.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">where 14.4 and 6 come from &middot; SLO 99.9%, 30-day window</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">page fast</div><div class="lstep seq" style="--i:0">"2% of the month's budget gone in 1 hour" &rarr; burn = 2% &times; (720h/1h) = <b>14.4</b> &middot; windows: <b>1h AND 5m</b></div>
        <div class="lanehead seq" style="--i:1">page slow</div><div class="lstep seq" style="--i:1">"5% gone in 6 hours" &rarr; burn = 5% &times; (720/6) = <b>6</b> &middot; windows: <b>6h AND 30m</b></div>
        <div class="lanehead seq" style="--i:2">ticket</div><div class="lstep seq" style="--i:2">"10% gone in 3 days" &rarr; burn = 10% &times; (720/72) = <b>1</b> &middot; windows: 3d AND 6h — morning work, not 3am work</div>
        <div class="lanehead seq" style="--i:3">why AND</div><div class="lstep good seq pop" style="--i:3">long window proves it's <b>real</b>; short window proves it's <b>still happening</b> — blips never confirm, recoveries reset fast</div>
      </div>
      <div class="dnote seq" style="--i:4">Severity sets the speed automatically: at 100% failure the 1h window crosses 1.44% after just <b style="color:var(--ordered)">~52 seconds</b> of outage — total failure pages within a minute, a 2× slow leak takes hours, and both are correct.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Read the trade the three rules encode: the fast pair catches fires with minutes of budget lost; the slow pair catches leaks a static threshold can never see (0.8% errors is invisible to "&gt; 1%" while burning 8× budget); the ticket pair catches erosion. The numbers aren't sacred — they're the SRE-workbook defaults for "2%/5%/10% of budget is how much I'm willing to lose before a human knows" — but the <i>structure</i> (multi-window, multi-burn-rate, AND) is what makes pages mean something.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the whole pager policy</div>
      <pre class="code">function evaluateBurn(w, slo) {        <span class="cm">// w = windowed error rates</span>
  const b = (r) =&gt; r / (1 - slo);      <span class="cm">// burn = rate / budget-rate</span>
  <span class="ok">if (b(w.h1) &gt; 14.4 &amp;&amp; b(w.m5) &gt; 14.4) return "page";</span>
  if (b(w.h6) &gt; 6    &amp;&amp; b(w.m30) &gt; 6)  return "page";
  if (b(w.d3) &gt; 1    &amp;&amp; b(w.h6) &gt; 1)   return "ticket";
  return null;
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this is the highest-leverage alerting design in the industry and a canonical interview question ("how would you alert on an SLO?"). Being able to derive 14.4 on a whiteboard — 2% of budget, times 720 hours over 1 hour — is the difference between citing a blog post and owning the math.</p>` },

  { eb:"lesson 22 · slos", title:"Symptom alerts page; cause alerts explain", html:`
    <p class="big">Every alert watches one of two things: <b class="hl">user pain</b> (errors, latency against the SLO) or <b class="hl">system state</b> (CPU, cache hit ratio, queue depth, disk). The single most effective pager reform in existence: <b class="hl">page only on symptoms; demote causes to dashboards and tickets.</b></p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the 2×2 that decides the pager</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">symptom, real</div><div class="lstep good seq" style="--i:0">SLO burning &rarr; page — users are hurting <b>whatever the cause turns out to be</b> &#10003;</div>
        <div class="lanehead seq" style="--i:1">cause, no pain</div><div class="lstep bad seq" style="--i:1">db CPU 92% at peak, users fine &rarr; a page here trains on-call that <b>pages are usually nothing</b> &#10007;</div>
        <div class="lanehead seq" style="--i:2">cause, real pain</div><div class="lstep seq" style="--i:2">cache died AND users hurt &rarr; the symptom page already fired; the cause panel is your <b>second click</b>, not your pager</div>
        <div class="lanehead seq" style="--i:3">novel cause</div><div class="lstep good seq pop" style="--i:3">something you never predicted breaks users &rarr; symptom page STILL fires — <b>symptoms cover the unknown-unknowns</b>; cause alerts only cover the causes you pre-imagined</div>
      </div>
      <div class="dnote seq" style="--i:4">That last row is the deep reason: the symptom set is <b style="color:var(--ordered)">complete</b> (any user-visible failure trips it) while every cause list is finite. You cannot enumerate your way to coverage; you can measure user pain once.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Causes don't disappear — they get demoted to the places causes belong: <b class="hl">dashboards</b> ordered by the dependency chain (the second click after a symptom page), and <b class="hl">tickets</b> for slow-moving states like "disk 80% full, exhausted in 9 days" — real work, on business hours. The interview-grade nuance: a few cause conditions genuinely predict imminent, hard-to-reverse pain (disk full, cert expiry, quota exhaustion) and earn early pages — as deadlines, not as states: "will be full in 4 hours" pages; "is 85%" never does.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the routing, as policy</div>
      <pre class="code"><span class="cm">// PAGE  — symptoms, always on:</span>
<span class="ok">slo_burn{service="checkout"}       // errors + latency vs the promise</span>
<span class="cm">// TICKET — causes with deadlines:</span>
disk_full_eta_hours &lt; 48
cert_expiry_days &lt; 14
<span class="cm">// DASHBOARD — causes as diagnosis, ordered by dependency:</span>
db_p99, cache_hit_ratio, queue_depth, pod_restarts</pre>
    </div>
    <p><b class="hl">Why it matters:</b> teams that page on causes run pagers with 60–90% noise, and noise is trained into people as permission to ignore. The symptom/cause split is how you get to the only pager worth carrying: one where <i>every</i> page means a human must act now.</p>` },

  { eb:"lesson 23 · slos", title:"Alert fatigue is a system failure", html:`
    <p class="big">When an on-call misses the real page in a pile of noise, the postmortem is tempted to write "human error." It never is. An alert that humans have learned to ignore is a <b class="hl">system emitting a signal calibrated to be ignored</b> — and it got that way through reviewable, fixable engineering decisions.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the decay curve of a noisy pager</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">week 1</div><div class="lstep seq" style="--i:0">12 pages, 2 actionable &rarr; on-call investigates all 12, sleeps badly, trusts the pager</div>
        <div class="lanehead seq" style="--i:1">week 6</div><div class="lstep bad seq" style="--i:1">the muscle memory: ack, glance, snooze — <b>the human is now a filter</b> running on vibes</div>
        <div class="lanehead seq" style="--i:2">week 12</div><div class="lstep bad seq pop" style="--i:2">the real one arrives dressed like the noise &rarr; ack, snooze, <b>40 minutes of outage</b> &#10007;</div>
        <div class="lanehead seq" style="--i:3">the fix</div><div class="lstep good seq" style="--i:3">treat every page as a review item: <b>action taken?</b> keep &middot; <b>no action?</b> the alert is wrong — retune, demote to ticket, or delete</div>
      </div>
      <div class="dnote seq" style="--i:4">The metric that keeps you honest: <b style="color:var(--ordered)">actionability rate</b> — pages that led to a human doing something &divide; all pages. Below ~70%, your pager is training people to ignore it; the review loop (weekly, ten minutes) is the maintenance the system needs.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The mechanics of de-noising are all things you've already met: symptom-based paging (lesson 22) removes the cause-alert chaff; multi-window burn rates (lesson 21) remove the blips; deduplication and grouping collapse the twelve sympathetic alerts of one incident into one page; and <b class="hl">every page carries a link to the playbook and the dashboard</b> — a page that requires archaeology to act on is half-noise even when it's right. Deleting an alert that never produces action isn't lowering the bar. It <i>is</i> the bar.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the weekly review, as a query</div>
      <pre class="code"><span class="cm">-- every page from last week, joined to what happened next:</span>
SELECT alert_name,
       count(*)                        AS pages,
       avg(action_taken)               AS actionability,
       avg(minutes_to_resolve)         AS mttr
FROM   pages GROUP BY alert_name
<span class="ok">ORDER  BY actionability ASC;   -- the top rows are your homework</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> pager health is retention, incident response speed, and the difference between an alert system and an alarm that cried wolf. Saying "alert fatigue is a system failure — here's the actionability review that fixes it" in an interview signals you've operated things, not just built them.</p>` },

  { eb:"lesson 24 · slos", title:"The release is the prime suspect", html:`
    <p class="big">Ask any long-tenured on-call where outages come from and you'll get the same base rate: <b class="hl">the majority follow a change we made</b> — a deploy, a config push, a feature flag, a migration. That makes change correlation the cheapest diagnostic in the discipline, and the change log your first dashboard.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the two-line investigation</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">signal</div><div class="lstep seq" style="--i:0">error rate: 0.3% … 0.3% … <b>step to 4.0% at 14:03</b></div>
        <div class="lanehead seq" style="--i:1">overlay</div><div class="lstep seq" style="--i:1">deploy markers on the same panel: db config @13:31 &middot; <b>api v142 @14:02</b> &middot; web v9 @14:16</div>
        <div class="lanehead seq" style="--i:2">rule</div><div class="lstep good seq pop" style="--i:2">latest change <b>at or before</b> the step, within a plausibility window &rarr; api v142. Roll it back. Investigate after.</div>
        <div class="lanehead seq" style="--i:3">trap</div><div class="lstep bad seq" style="--i:3">"nearest change in either direction" blames web v9 — the deploy that happened <b>13 minutes after</b> the errors began… possibly the attempted fix &#10007;</div>
      </div>
      <div class="dnote seq" style="--i:4">Causes precede effects — the arrow of time is not optional. And <b style="color:var(--ordered)">rollback beats diagnosis</b> during impact: you can understand the bug at 10am tomorrow; users are failing now.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>This only works if changes are <b class="hl">visible in the telemetry</b> — which is an instrumentation decision, made in advance (axiom one): deploy markers emitted by CI onto every dashboard, a <code>version</code> label on metrics and a field on every wide event (so the 3am GROUP BY can say "errors are 40× on v142 pods"), and flags/config pushes recorded in the same stream — config changes are deploys that skipped the pipeline, and they cause outages at the same rate. The refinement that removes the guesswork entirely: <b class="hl">canary analysis</b> — route 5% of traffic to the new version and compare RED metrics between versions <i>before</i> the blast radius is 100%.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the correlation rule</div>
      <pre class="code">function suspectChange(stepAt, changes, windowMin) {
  const prior = changes.filter(c =&gt;
    <span class="ok">c.t &lt;= stepAt</span> &amp;&amp; stepAt - c.t &lt;= windowMin);
  if (!prior.length) return null;        <span class="cm">// honesty beats a scapegoat</span>
  return prior.reduce((a, b) =&gt; b.t &gt; a.t ? b : a);  <span class="cm">// latest prior</span>
}</pre>
    </div>
    <p><b class="hl">Why it matters:</b> "what changed?" resolves more incidents than any profiler, and it's pure preparation: markers, version labels, a queryable change log. The triage loop in the next lesson has this as its second question — right after "who's affected?" and long before any theory about why.</p>` },

  { eb:"lesson 25 · debugging", title:"The triage loop", html:`
    <p class="big">Under adrenaline, smart people jump to theories. The discipline that beats brilliance at 3am is a fixed question order: <b class="hl">impact &rarr; when &rarr; where &rarr; why.</b> Each answer prunes the next question's search space; skipping ahead is how you spend forty minutes debugging the wrong outage.</p>
    <div class="diagram anim" style="--step:.8s">
      <div class="dlabel">the loop &middot; each stage names its signal</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">1 · impact</div><div class="lstep seq" style="--i:0"><b>Who, how much?</b> All users or one segment / shard / region / tier? Total or degraded? &rarr; metrics, sliced. Decides severity, comms, who to wake</div>
        <div class="lanehead seq" style="--i:1">2 · when</div><div class="lstep seq" style="--i:1"><b>Since when — and what changed then?</b> Step vs ramp; correlate with deploys, flags, config &rarr; the change log. Often ends the incident (rollback)</div>
        <div class="lanehead seq" style="--i:2">3 · where</div><div class="lstep seq" style="--i:2"><b>Which hop?</b> Trace the failing/slow requests to the responsible service &rarr; waterfalls, critical path, RED per dependency</div>
        <div class="lanehead seq" style="--i:3">4 · why</div><div class="lstep good seq pop" style="--i:3"><b>What exactly?</b> The hop's logs, wide events, USE panels &rarr; the mechanism — pool exhausted, N+1, lock, quota</div>
      </div>
      <div class="dnote seq" style="--i:4">Notice the ladder from lesson 02 mapped onto time: <b style="color:var(--ordered)">metrics &rarr; change log &rarr; traces &rarr; logs</b>. And notice "why" is LAST — mitigation (rollback, shed load, fail over) usually happens at stage 2, before anyone knows the mechanism. That's correct: stop the bleeding, then do the surgery.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Stage 1 deserves its reputation as the step everyone skips. "All users or some?" is one GROUP BY against wide events — and its answer redirects everything: <i>one shard</i> means data or partitioning; <i>one region</i> means infrastructure; <i>one app version</i> means the release; <i>one big customer</i> means their traffic shape. The loop is also a loop: after mitigation, run it again — did impact actually drop? Incidents where "the fix" changed nothing because stage 1 was never re-checked are a postmortem genre of their own.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the loop as a checklist you can paste in a doc</div>
      <pre class="code">1. impact: slice err/latency by segment · severity · comms
2. when:   step or ramp? · overlay deploys/flags/config
           <span class="ok">-&gt; can we roll something back RIGHT NOW?</span>
3. where:  exemplar -&gt; waterfall -&gt; culprit hop (deepest error,
           else biggest self-time on the critical path)
4. why:    that hop's canonical events + USE panels -&gt; mechanism
5. verify: re-run 1. did impact actually fall?</pre>
    </div>
    <p><b class="hl">Why it matters:</b> this loop is the course's thesis made operational — every arc built one of its stages. It's also the answer to the interview classic "walk me through debugging a production incident": name the four questions in order, name the signal each uses, and you sound like someone who's done it, because that IS how it's done.</p>` },

  { eb:"lesson 26 · debugging", title:"Dashboard forensics: reading the shapes", html:`
    <p class="big">A time series is testimony. Before any theory, read the <b class="hl">shape</b>: a step says "something discrete changed," a ramp says "something is accumulating," a plateau says "something saturated," and a shape that repeats daily says "it's the traffic, not the code." Shapes prune hypotheses faster than any query.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the four shapes and what each testifies</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">step</div><div class="lstep seq" style="--i:0">▁▁▁▁█████ — a discrete event: deploy, flag, config, dependency failing over &rarr; <b>check the change log at the edge</b></div>
        <div class="lanehead seq" style="--i:1">ramp</div><div class="lstep seq" style="--i:1">▁▂▃▄▅▆▇█ — accumulation: leak, queue backlog, cache filling, retry snowball &rarr; <b>find what grows with it</b></div>
        <div class="lanehead seq" style="--i:2">ceiling</div><div class="lstep seq" style="--i:2">▁▃▅▇████ flat-top — a resource pinned at its max: pool, CPU, rate limit &rarr; <b>saturation; USE the dependency chain</b></div>
        <div class="lanehead seq" style="--i:3">diurnal</div><div class="lstep good seq pop" style="--i:3">▂▅█▅▂▂▅█ repeating with the sun — load-correlated, not incident-correlated &rarr; <b>capacity work, not a 3am page</b></div>
      </div>
      <div class="dnote seq" style="--i:4">The compound tells: latency ceiling + queue-depth ramp = <b style="color:var(--race)">saturation with a backlog</b> (recovery will LAG the fix while the queue drains — don't panic-revert the fix). Errors stepping while latency stays flat = logic, not load.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Two reading disciplines separate forensics from vibes. <b class="hl">Respect the window</b>: a 5m-rate panel smooths any burst shorter than five minutes and a 1h panel hides everything — before declaring "no spike," check what the panel can even see (lesson 05's compression, again). And <b class="hl">beware the y-axis</b>: auto-scaling turns a 0.1%→0.4% wiggle into a cliff; percentiles quantized by bucket edges (lesson 08) produce fake "steps" when the distribution slides within a bucket. The graph is an argument made by a renderer — audit it like one.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the questions, per shape</div>
      <pre class="code">step:    what changed at the edge? (deploys, flags, config, upstream)
ramp:    what else ramps in lockstep? (queue depth, memory, conns)
ceiling: which resource's max equals the plateau's value?
diurnal: does it track traffic? overlay rps — if yes, capacity
<span class="ok">always:  can this panel even SEE the thing I'm ruling out?</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> stage-2 triage ("when / what changed") is mostly this skill. Engineers who read shapes mitigate in minutes because the shape names the category before any log is opened; engineers who don't, query randomly until the shape was obvious in hindsight.</p>` },

  { eb:"lesson 27 · debugging", title:"Correlated failure: one host, one zone, one dependency, one deploy", html:`
    <p class="big">Big systems rarely fail uniformly — they fail <b class="hl">along a correlation</b>: everything sharing a host, a zone, a dependency, or a binary version breaks together while its siblings stay healthy. Each correlation has a recognizable signature, and naming the signature IS the localization.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">four blast radii &middot; four signatures</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">one host</div><div class="lstep seq" style="--i:0">error rate &asymp; 1/N of traffic &middot; fleet p99 up while p50 flat &middot; <b>per-host breakdown shows one outlier</b> &rarr; drain it, autopsy later</div>
        <div class="lanehead seq" style="--i:1">one zone</div><div class="lstep seq" style="--i:1">every service in the zone degrades <b>at once</b>, cross-service — apps don't conspire; <b>infrastructure does</b> &rarr; fail out of the zone</div>
        <div class="lanehead seq" style="--i:2">one dependency</div><div class="lstep seq" style="--i:2">every CALLER of the db/cache/payment API sickens together; non-callers healthy &middot; waterfalls all stall at the <b>same hop</b> &rarr; that team's incident, your mitigation</div>
        <div class="lanehead seq" style="--i:3">one deploy</div><div class="lstep good seq pop" style="--i:3">failures track <b>version</b>, not host/zone: GROUP BY version &rarr; 40× errors on v142 pods, timing matches the rollout &rarr; roll back</div>
      </div>
      <div class="dnote seq" style="--i:4">The prerequisite is axiom one wearing its infrastructure hat: these signatures are only visible if <b style="color:var(--ordered)">host, zone, dependency, and version are dimensions on your telemetry</b>. The GROUP BY can't find a column you never emitted.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The general algorithm, once the dimensions exist, is the confession query from lesson 04: take the failing events, <b class="hl">group by every dimension, and look where failure concentrates</b> — 100% of errors in 3% of hosts is a host problem; failures spread evenly across hosts but pinned to one dependency hop is that dependency; concentration in a version is the deploy. And know the impostor: a <b class="hl">retry storm</b> makes ONE sick dependency look like total system failure, with the tell that traffic is <i>up</i> during the incident — the failure is being amplified by your own clients (which is why the incident simulator deals it as a hand).</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the concentration query</div>
      <pre class="code">SELECT host, zone, version, dependency_hop,
       count(*) AS failures
FROM   request_events WHERE status &gt;= 500
GROUP  BY 1, 2, 3, 4
ORDER  BY failures DESC LIMIT 20;
<span class="ok">-- failure concentrated in one value of one column = the blast radius</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> "is it a host, a zone, a dependency, or the release?" is stage 1 and 3 of triage collapsed into one question — and it's answerable in under a minute by teams that emitted the dimensions. The senior habit: every new failure domain you build (a shard, a cell, a flag) gets a telemetry dimension the same day.</p>` },

  { eb:"lesson 28 · debugging", title:"The postmortem question: what telemetry was missing?", html:`
    <p class="big">Every incident runs on the telemetry that existed before it started — that's axiom one. So every incident is also an <b class="hl">audit</b>: which triage questions could we not answer, and what would have answered them? A postmortem that only explains the bug fixed one failure. One that fixes the <b class="hl">telemetry gaps</b> upgraded every future incident.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the debrief &middot; walk the loop, log the friction</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">impact</div><div class="lstep bad seq" style="--i:0">"we couldn't say if it was all users or one shard" &rarr; missing: <b>shard dimension on request events</b></div>
        <div class="lanehead seq" style="--i:1">when</div><div class="lstep bad seq" style="--i:1">"the config push wasn't on any dashboard" &rarr; missing: <b>config changes in the deploy-marker stream</b></div>
        <div class="lanehead seq" style="--i:2">where</div><div class="lstep bad seq" style="--i:2">"the trace ended at the queue" &rarr; missing: <b>context propagation through the worker</b></div>
        <div class="lanehead seq" style="--i:3">why</div><div class="lstep bad seq" style="--i:3">"the pool logged WARN 9,400 times, invisibly" &rarr; missing: <b>saturation metric + alert</b></div>
        <div class="lanehead seq" style="--i:4">output</div><div class="lstep good seq pop" style="--i:4">each row becomes a small, shippable action item — <b>instrument before you forget</b>; the memory of where it hurt fades in about a week</div>
      </div>
      <div class="dnote seq" style="--i:5">Grade the incident on two clocks: <b style="color:var(--ordered)">time-to-detect</b> (did a symptom alert fire, or did a customer tell you?) and <b style="color:var(--ordered)">time-to-localize</b> (how long from page to naming the hop?). Both are telemetry properties, and both are improvable line by line.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>Better: run the audit <b class="hl">before</b> the incident. Take the triage loop's questions, walk your telemetry inventory, and list what's unanswerable today — that's the coverage-gap drill in this course's problem bank, and it turns "we should improve observability" (never scheduled) into "these six questions are blind" (a sprint's worth of small items). The same logic makes blameless culture practical: "the human should have noticed" is not an action item; "the signal the human needed didn't exist — here's the ticket" is.</p>
    <div class="impl">
      <div class="dlabel">reference implementation &middot; the coverage audit</div>
      <pre class="code">function coverageGaps(inventory, questions) {
  const have = new Set(inventory);
  return questions.filter(q =&gt;
    <span class="ok">!q.needs.every(n =&gt; have.has(n))</span>);   <span class="cm">// ALL needs, or blind</span>
}
<span class="cm">// questions = the triage script; inventory = what's emitted today</span>
<span class="cm">// output = the instrumentation backlog, written while it's cheap</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> observability compounds — each incident's gaps, fixed, make the next incident shorter. Teams that treat instrumentation as a postmortem deliverable get measurably faster at incidents every quarter; teams that don't relearn the same blindness annually, at 3am, with interest.</p>` },

  { eb:"lesson 29 · verification", title:"Testing your telemetry, and game days", html:`
    <p class="big">Instrumentation is code that only runs for real during a disaster — the worst possible moment to discover it's broken. So treat it like code: <b class="hl">assert in CI that a request emits exactly the telemetry you believe it does</b>, and rehearse the humans with game days before production runs the drill for you.</p>
    <div class="diagram anim" style="--step:.75s">
      <div class="dlabel">the telemetry test &middot; in-memory exporters, real assertions</div>
      <div class="lanes">
        <div class="lanehead seq" style="--i:0">arrange</div><div class="lstep seq" style="--i:0">boot the service with in-memory exporters (OTel ships them) — no collector, no network, deterministic</div>
        <div class="lanehead seq" style="--i:1">act</div><div class="lstep seq" style="--i:1">drive one request through the real middleware stack — including one that <b>throws</b></div>
        <div class="lanehead seq" style="--i:2">assert</div><div class="lstep good seq" style="--i:2">spans: edge&rarr;api&rarr;db, one trace id, statuses right &middot; metrics: counter +1 with the right labels, duration in a bucket &middot; <b>one</b> canonical line, error captured</div>
        <div class="lanehead seq" style="--i:3">catches</div><div class="lstep good seq pop" style="--i:3">the refactor that dropped the span wrapper &middot; the label rename that breaks every dashboard &middot; the exception path that skips the emit — <b>before</b> they're 3am surprises</div>
      </div>
      <div class="dnote seq" style="--i:4">Assert on <b style="color:var(--ordered)">shape, not incidentals</b>: span parentage, metric names + label KEYS, event field presence. Asserting exact durations or ids makes the suite flaky; asserting structure makes dashboards refactor-proof — label keys are your dashboards' API.</div>
    </div>
    <div class="row"><button class="playbtn" data-play>&#9654; replay</button></div>
    <p>The human half is the <b class="hl">game day</b>: inject a fault on purpose — kill a dependency in staging, add 300ms to the db, roll a deliberately bad canary — and run the real triage loop with the real dashboards and the real on-call. You're testing four claims at once: the symptom alert fires (time-to-detect), the dashboards localize it (time-to-localize), the playbook's mitigation works, and the newest on-call can do all three without the person who built it. Every failure of the drill is a free postmortem — same findings, zero users harmed. This course's incident simulator is the couch version; the muscle transfers.</p>
    <div class="impl">
      <div class="dlabel">reference &middot; the CI assertion, sketched</div>
      <pre class="code">const { spans, metrics, events } = await withTestExporters(() =&gt;
  app.handle(request("/checkout")));
assert(spans.map(s =&gt; s.name).includes("db.query"));
assert(new Set(spans.map(s =&gt; s.traceId)).size === 1);  <span class="cm">// one story</span>
assert(metric(metrics, "http_requests_total",
       { route: "/checkout", code: "200" }) === 1);
<span class="ok">assert(events.length === 1 &amp;&amp; events[0].duration_ms &gt;= 0);</span> <span class="cm">// canonical</span></pre>
    </div>
    <p><b class="hl">Why it matters:</b> this closes the course's loop. Axiom one said production can only be debugged through telemetry emitted in advance — which makes telemetry a load-bearing production feature, and untested load-bearing code is a gamble. Test the signals, drill the humans, and the 3am test stops being a test of luck.</p>` }
  );

})();
