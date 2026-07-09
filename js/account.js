"use strict";
/* Account layer — optional Cognito sign-in + cloud progress sync.
   Loaded LAST on every course page (after the engine), and shared by all
   courses like js/app.js is.

   DORMANT BY DEFAULT: it activates only if /auth-config.json exists — the
   deploy pipeline publishes that file once the backend is enabled — so local
   dev, file://, and a backend-less deploy all keep today's exact experience.
   Signed-out users keep it forever: accounts are strictly additive.

   Design (docs/BACKEND_PLAN.md phase 6):
   - localStorage stays the source of truth and write-through cache; this
     layer only mirrors it to PUT /api/me/courses/{id}, debounced.
   - The server owns versioning: a 409 hands back the current doc, we merge
     (union solved, keep local position, union misses capped at 50) and
     retry. First sign-in migrates existing local progress the same way.
   - Badges/XP/streaks arrive in the PUT response — surfaced as toasts and
     in the account menu. The engine never knows any of this exists; it just
     dispatches course:progress-changed / course:progress-reset events. */

const CloudAccount = (() => {
  const AUTH_KEY = "rsc:auth";          // tokens are origin-wide: one sign-in covers every course
  const PKCE_KEY = "rsc:auth:pkce";     // sessionStorage, only during the redirect round-trip
  const CONFIG_URL = "/auth-config.json";
  const PREFIX = (typeof COURSE !== "undefined" && COURSE && COURSE.storagePrefix) || "cbootcamp";
  const COURSE_ID = (typeof COURSE !== "undefined" && COURSE && COURSE.id) || null;
  const SYNC_KEY = PREFIX + ":sync";    // { version } — the doc version we last saw
  const MAX_MISSES = 50;                // the app's own cap
  const PUSH_DEBOUNCE_MS = 2500;

  let config = null;                    // { clientId, domain, apiBase }
  let pushTimer = null;
  let pushing = false;
  let dirty = false;
  let stopped = false;                  // course unknown to the catalog -> stop pushing this session
  let lastPushedBody = null;

  /* ---------- storage helpers (defensive, like the engine's) ---------- */
  const readJson = (key) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
  const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };
  const drop = (key) => { try { localStorage.removeItem(key); } catch (e) {} };
  const nowSec = () => Math.floor(Date.now() / 1000);

  /* ---------- the progress document (same shape the backend stores) ---------- */
  const localDetail = () => ({
    solved: readJson(PREFIX + ":solved") || {},
    position: readJson(PREFIX + ":position") || {},
    misses: readJson(PREFIX + ":misses") || []
  });
  const isEmptyDetail = (d) =>
    !Object.keys(d.solved).length && !Object.keys(d.position).length && !d.misses.length;

  /* Merge rule (sign-in pull AND 409 recovery): solved is a union — a solve
     on any device counts; position prefers this device (the user is HERE)
     unless it has none; misses union by key, newest (local) wins, capped. */
  const mergeDetail = (mine, theirs) => {
    const all = [...(theirs.misses || []), ...(mine.misses || [])];
    const seen = new Set(); const misses = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const m = all[i]; const k = m && m.key;
      if (!k || seen.has(k)) continue;
      seen.add(k); misses.unshift(m);
    }
    return {
      solved: { ...(theirs.solved || {}), ...(mine.solved || {}) },
      position: Object.keys(mine.position || {}).length ? mine.position : (theirs.position || {}),
      misses: misses.slice(-MAX_MISSES)
    };
  };

  /* Write a merged doc back into localStorage and the live engine state.
     Solved feeds the progress bar immediately; position only lands in
     storage — yanking the user's place mid-session would be hostile, so it
     applies on next visit. */
  const applyDetail = (detail) => {
    writeJson(PREFIX + ":solved", detail.solved);
    writeJson(PREFIX + ":position", detail.position);
    writeJson(PREFIX + ":misses", detail.misses);
    try {
      if (typeof state !== "undefined" && state && state.solved &&
          Object.keys(detail.solved).length !== Object.keys(state.solved).length) {
        state.solved = detail.solved;
        renderProgress(); render();
      }
    } catch (e) { /* engine not on this page — storage is still updated */ }
  };

  /* ---------- auth: OAuth2 code + PKCE against the Hosted UI ---------- */
  const authBase = () => `https://${config.domain}`;
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

  const tokens = () => readJson(AUTH_KEY);
  const isSignedIn = () => !!tokens();
  const claims = () => {
    try { return JSON.parse(atob(tokens().idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return {}; }
  };
  const saveTokenResponse = (t) => {
    const prev = tokens() || {};
    writeJson(AUTH_KEY, {
      idToken: t.id_token,
      refreshToken: t.refresh_token || prev.refreshToken,
      expiresAt: nowSec() + (t.expires_in || 3600)
    });
  };

  async function signIn() {
    const verifier = randomString();
    const state = randomString().slice(0, 16);
    try { sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo: location.pathname + location.hash })); } catch (e) { return; }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      scope: "openid email profile",
      redirect_uri: location.origin,        // must match the app client's registered callback exactly
      state,
      code_challenge: b64url(new Uint8Array(digest)),
      code_challenge_method: "S256"
    });
    location.assign(`${authBase()}/oauth2/authorize?${params}`);
  }

  /* Callback half of the redirect: runs on boot when ?code= is present. */
  async function completeSignIn() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) return false;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || "null"); sessionStorage.removeItem(PKCE_KEY); } catch (e) {}
    history.replaceState(null, "", location.pathname); // never leave ?code in the URL
    if (!saved || (params.get("state") || "") !== saved.state) return false;
    const res = await fetch(`${authBase()}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        code,
        redirect_uri: location.origin,
        code_verifier: saved.verifier
      })
    });
    if (!res.ok) return false;
    saveTokenResponse(await res.json());
    // sign-in always lands on the origin root; hop back to the course it started from
    if (saved.returnTo && saved.returnTo !== location.pathname + location.hash) { location.replace(saved.returnTo); return true; }
    return true;
  }

  /* Valid id token, refreshing behind the scenes when it's near expiry. */
  async function freshIdToken() {
    const a = tokens();
    if (!a) return null;
    if (a.expiresAt - 60 > nowSec()) return a.idToken;
    if (!a.refreshToken) { drop(AUTH_KEY); refreshUi(); return null; }
    try {
      const res = await fetch(`${authBase()}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, refresh_token: a.refreshToken })
      });
      if (!res.ok) { drop(AUTH_KEY); refreshUi(); return null; }
      saveTokenResponse(await res.json());
      return tokens().idToken;
    } catch (e) { return null; }        // offline: keep tokens, just skip this sync
  }

  function signOut() {
    drop(AUTH_KEY); drop(SYNC_KEY);
    lastPushedBody = null;
    // clear the Hosted UI session cookie too, or the next "sign in" silently
    // signs straight back in — confusing as a sign-out
    location.assign(`${authBase()}/logout?` + new URLSearchParams({ client_id: config.clientId, logout_uri: location.origin }));
  }

  /* ---------- API ---------- */
  async function api(method, path, body) {
    const token = await freshIdToken();
    if (!token) return null;
    return fetch(config.apiBase + path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body && { "content-type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  /* ---------- sync ---------- */
  const flushSoon = (ms = PUSH_DEBOUNCE_MS) => { clearTimeout(pushTimer); pushTimer = setTimeout(push, ms); };

  async function push() {
    if (!config || !COURSE_ID || stopped || !isSignedIn()) return;
    if (pushing) { dirty = true; return; }
    const detail = localDetail();
    if (isEmptyDetail(detail)) return;            // never create an empty cloud doc
    const body = JSON.stringify(detail);
    if (body === lastPushedBody) return;
    pushing = true; dirty = false;
    try {
      const meta = readJson(SYNC_KEY) || {};
      const res = await api("PUT", `/me/courses/${COURSE_ID}`, { version: meta.version || 0, detail });
      if (!res) return;
      if (res.ok) {
        const out = await res.json();
        writeJson(SYNC_KEY, { version: out.version });
        lastPushedBody = body;
        (out.newBadges || []).forEach((b) => toast(`${b.icon || "🏅"} badge earned — ${b.name}`));
        refreshUi(out.stats);
      } else if (res.status === 409) {
        // another device wrote first: adopt, merge, re-push
        const { current } = await res.json();
        applyDetail(mergeDetail(localDetail(), (current && current.detail) || {}));
        writeJson(SYNC_KEY, { version: (current && current.version) || 0 });
        dirty = true;
      } else if (res.status === 404) {
        stopped = true;                           // course not in the catalog (e.g. preview build)
      } else {
        dirty = true;                             // 5xx etc. — retry on next change/online
      }
    } catch (e) { dirty = true; }                 // offline — retry later
    finally {
      pushing = false;
      if (dirty) flushSoon();
    }
  }

  /* Sign-in-time reconciliation: cloud copy wins nothing, loses nothing —
     merge both ways, then push if we now hold anything the cloud lacks.
     A 404 means first sign-in on this course: plain migration push. */
  async function pullAndMerge() {
    if (!COURSE_ID) return;
    let res = null;
    try { res = await api("GET", `/me/courses/${COURSE_ID}`); } catch (e) { return; }
    if (!res) return;
    if (res.status === 404) { flushSoon(500); return; }
    if (!res.ok) return;
    const doc = await res.json();
    const merged = mergeDetail(localDetail(), doc.detail || {});
    applyDetail(merged);
    writeJson(SYNC_KEY, { version: doc.version });
    if (JSON.stringify(merged) !== JSON.stringify(doc.detail)) flushSoon(500);
    else lastPushedBody = JSON.stringify(merged);
  }

  /* ---------- UI: account chip, menu, toasts (all injected) ---------- */
  const STYLE = `
  .acctbtn{border:1px solid var(--line,#333);background:transparent;color:var(--muted,#aaa);
    font:inherit;font-size:.72rem;padding:.25rem .6rem;border-radius:999px;cursor:pointer;white-space:nowrap}
  .acctbtn:hover,.acctbtn:active{background:rgba(142,134,240,.12)}
  .acctmenu{position:absolute;top:calc(100% + .4rem);right:0;z-index:60;min-width:200px;
    background:var(--panel,#17171c);border:1px solid var(--line,#333);border-radius:12px;
    padding:.7rem .8rem;box-shadow:0 8px 30px rgba(0,0,0,.45);font-size:.78rem;color:var(--muted,#aaa)}
  .acctmenu[hidden]{display:none}
  .acctmenu .who{color:var(--text,#eee);font-weight:600;margin-bottom:.35rem;overflow:hidden;text-overflow:ellipsis}
  .acctmenu .stats{display:flex;gap:.8rem;margin:.35rem 0 .6rem}
  .acctmenu .stats b{color:var(--text,#eee)}
  .accttoasts{position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);z-index:70;
    display:flex;flex-direction:column;gap:.4rem;align-items:center;pointer-events:none}
  .accttoast{background:var(--panel,#17171c);border:1px solid var(--line,#333);border-radius:999px;
    color:var(--text,#eee);font-size:.78rem;padding:.45rem .9rem;box-shadow:0 8px 30px rgba(0,0,0,.45);
    animation:accttoast-in .25s ease-out}
  @keyframes accttoast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`;

  let btn = null, menu = null, toasts = null;

  function toast(text) {
    if (!toasts) return;
    const el = document.createElement("div");
    el.className = "accttoast";
    el.textContent = text;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function refreshUi(stats) {
    if (!btn) return;
    if (isSignedIn()) {
      const email = claims().email || "";
      btn.textContent = "◉ " + (email.split("@")[0] || "account").slice(0, 14);
      btn.setAttribute("aria-label", "account menu");
    } else {
      btn.textContent = "sign in";
      btn.setAttribute("aria-label", "sign in to sync progress");
      if (menu) menu.hidden = true;
    }
    if (stats && menu && !menu.hidden) fillMenu(stats);
  }

  function fillMenu(stats) {
    const who = claims().email || "signed in";
    menu.innerHTML = "";
    const w = document.createElement("div"); w.className = "who"; w.textContent = who;
    const s = document.createElement("div"); s.className = "stats";
    s.innerHTML = stats
      ? `<span><b>${stats.xp}</b> xp</span><span><b>${stats.currentStreak}</b>d streak</span>`
      : "syncing…";
    const out = document.createElement("button");
    out.className = "acctbtn"; out.type = "button"; out.textContent = "sign out";
    out.addEventListener("click", signOut);
    menu.append(w, s, out);
  }

  async function openMenu() {
    menu.hidden = false;
    fillMenu(null);
    try {
      const res = await api("GET", "/me");
      if (res && res.ok && !menu.hidden) fillMenu(await res.json());
    } catch (e) {}
  }

  function injectUi() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    toasts = document.createElement("div");
    toasts.className = "accttoasts";
    document.body.appendChild(toasts);

    const bar = document.querySelector(".hbar");
    if (!bar) return;
    const holder = document.createElement("div");
    holder.style.position = "relative";
    btn = document.createElement("button");
    btn.className = "acctbtn"; btn.id = "acctbtn"; btn.type = "button";
    menu = document.createElement("div");
    menu.className = "acctmenu"; menu.hidden = true;
    btn.addEventListener("click", () => {
      if (!isSignedIn()) { signIn(); return; }
      menu.hidden ? openMenu() : (menu.hidden = true);
    });
    document.addEventListener("click", (e) => { if (menu && !holder.contains(e.target)) menu.hidden = true; });
    holder.append(btn, menu);
    bar.appendChild(holder);
  }

  /* ---------- boot ---------- */
  async function boot() {
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!res.ok) return;                                  // backend not enabled -> stay dormant
      config = await res.json();
    } catch (e) { return; }                                 // offline/file:// -> dormant
    if (!config || !config.clientId || !config.domain) return;
    config.domain = String(config.domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    config.apiBase = config.apiBase || "/api";

    injectUi();
    try { await completeSignIn(); } catch (e) {}
    refreshUi();

    window.addEventListener("course:progress-changed", () => { if (isSignedIn()) flushSoon(); });
    window.addEventListener("course:progress-reset", async () => {
      if (!isSignedIn() || !COURSE_ID) return;
      try { await api("DELETE", `/me/courses/${COURSE_ID}`); } catch (e) {}
      drop(SYNC_KEY); lastPushedBody = null;
    });
    window.addEventListener("online", () => { if (dirty) flushSoon(500); });

    if (isSignedIn()) pullAndMerge();
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", boot)
      : boot();
  }

  // exported for tests (tools/validate-account.mjs) and manual debugging
  return { mergeDetail, localDetail, isEmptyDetail, signIn, signOut, boot };
})();
