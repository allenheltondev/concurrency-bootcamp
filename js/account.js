"use strict";
/* Account layer — optional sign-in + cloud progress sync.
   Loaded LAST on every course page (after the engine), and shared by all
   courses like js/app.js is.

   DORMANT BY DEFAULT: it activates only if /auth-config.json exists — the
   deploy pipeline publishes that file once the backend is enabled — so local
   dev, file://, and a backend-less deploy all keep today's exact experience.
   Signed-out users keep it forever: accounts are strictly additive.

   AUTH: fully custom, in-app screens (sign in, sign up, verify email, forgot
   password, new-password challenge) that call the Cognito user pool API
   directly (USER_PASSWORD_AUTH over TLS) — no Hosted UI, no redirects, no
   dependencies. The visual language mirrors the Ready, Set, Cloud newsletter
   dashboard's auth forms (surface card, primary-600 buttons, ring focus,
   error-50 alert boxes; light + dark via prefers-color-scheme). The shared
   pool requires given_name/family_name at sign-up, uses email as username,
   confirms via 6-digit emailed code, and wants min-8 passwords with upper +
   lower + digit.

   SYNC (docs/BACKEND_PLAN.md phase 6):
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
  const CONFIG_URL = "/auth-config.json";
  const PREFIX = (typeof COURSE !== "undefined" && COURSE && COURSE.storagePrefix) || "cbootcamp";
  const COURSE_ID = (typeof COURSE !== "undefined" && COURSE && COURSE.id) || null;
  const SYNC_KEY = PREFIX + ":sync";    // { version } — the doc version we last saw
  const MAX_MISSES = 50;                // the app's own cap
  const PUSH_DEBOUNCE_MS = 2500;
  const RESEND_COOLDOWN_S = 60;

  let config = null;                    // { clientId, region, apiBase }
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

  /* ---------- Cognito user pool API (no SDK, no Hosted UI) ---------- */
  const ERROR_COPY = {
    NotAuthorizedException: "Incorrect email or password.",
    UserNotFoundException: "Incorrect email or password.",
    UsernameExistsException: "An account with this email already exists.",
    InvalidPasswordException: "That password doesn't meet the requirements below.",
    CodeMismatchException: "That code isn't right — check it and try again.",
    ExpiredCodeException: "That code has expired — request a new one.",
    LimitExceededException: "Too many attempts — wait a few minutes and try again.",
    TooManyRequestsException: "Too many attempts — wait a moment and try again.",
    UserNotConfirmedException: "This account hasn't verified its email yet."
  };
  const errorMessage = (body) => {
    const type = String(body.__type || "").split("#").pop().replace(/:.*$/, "");
    return ERROR_COPY[type] || body.message || "Something went wrong — please try again.";
  };

  async function idp(action, payload) {
    const res = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `AWSCognitoIdentityProviderService.${action}`
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(errorMessage(body));
      err.code = String(body.__type || "").split("#").pop();
      throw err;
    }
    return body;
  }

  const tokens = () => readJson(AUTH_KEY);
  const isSignedIn = () => !!tokens();
  const claims = () => {
    try { return JSON.parse(atob(tokens().idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return {}; }
  };
  const saveAuthResult = (r) => {
    const prev = tokens() || {};
    writeJson(AUTH_KEY, {
      idToken: r.IdToken,
      refreshToken: r.RefreshToken || prev.refreshToken,
      expiresAt: nowSec() + (r.ExpiresIn || 3600)
    });
  };

  /* Valid id token, refreshing behind the scenes when it's near expiry. */
  async function freshIdToken() {
    const a = tokens();
    if (!a) return null;
    if (a.expiresAt - 60 > nowSec()) return a.idToken;
    if (!a.refreshToken) { drop(AUTH_KEY); refreshUi(); return null; }
    try {
      const out = await idp("InitiateAuth", {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: config.clientId,
        AuthParameters: { REFRESH_TOKEN: a.refreshToken }
      });
      saveAuthResult(out.AuthenticationResult);
      return tokens().idToken;
    } catch (e) {
      if (e.code) { drop(AUTH_KEY); refreshUi(); } // revoked/expired session; network errors keep tokens
      return null;
    }
  }

  async function signOut() {
    const a = tokens();
    drop(AUTH_KEY); drop(SYNC_KEY);
    lastPushedBody = null;
    refreshUi();
    if (a && a.refreshToken) {
      try { await idp("RevokeToken", { ClientId: config.clientId, Token: a.refreshToken }); } catch (e) {}
    }
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

  /* ==========================================================
     UI — account chip, menu, toasts, and the auth modal.
     Styling mirrors the RSC newsletter dashboard auth forms:
     tokens as CSS variables, light default + dark via
     prefers-color-scheme, surface card, primary-600 buttons.
     ========================================================== */
  const STYLE = `
  .rsc-auth-scope{
    --rsc-bg:248 250 252; --rsc-surface:255 255 255; --rsc-fg:15 23 42;
    --rsc-muted-fg:71 85 105; --rsc-border:226 232 240; --rsc-ring:53 103 245;
    --rsc-primary-500:53 103 245; --rsc-primary-600:31 79 214; --rsc-primary-700:26 65 173;
    --rsc-error-50:255 241 242; --rsc-error-200:254 205 211; --rsc-error-300:253 164 175; --rsc-error-600:225 29 72;
  }
  @media (prefers-color-scheme: dark){ .rsc-auth-scope{
    --rsc-bg:2 6 23; --rsc-surface:15 23 42; --rsc-fg:226 232 240;
    --rsc-muted-fg:148 163 184; --rsc-border:51 65 85; --rsc-ring:90 139 255;
    --rsc-primary-500:90 139 255; --rsc-primary-600:90 139 255; --rsc-primary-700:120 160 255;
    --rsc-error-50:59 20 30; --rsc-error-200:100 30 45; --rsc-error-300:159 42 67; --rsc-error-600:253 164 175;
  }}
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
    animation:rscfadein .25s ease-out}
  .rsc-overlay{position:fixed;inset:0;z-index:80;background:rgba(2,6,23,.55);
    display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:3rem 1rem;
    font-family:'Inter',system-ui,sans-serif}
  .rsc-overlay[hidden]{display:none}
  .rsc-card{background:rgb(var(--rsc-surface));color:rgb(var(--rsc-fg));width:100%;max-width:28rem;
    border-radius:.5rem;padding:1.5rem 2rem;position:relative;
    box-shadow:0 10px 40px -10px rgba(0,0,0,.25),0 20px 25px -5px rgba(0,0,0,.1);
    animation:rscslideup .25s ease-out}
  .rsc-close{position:absolute;top:.6rem;right:.75rem;border:0;background:none;cursor:pointer;
    color:rgb(var(--rsc-muted-fg));font-size:1.25rem;line-height:1;padding:.25rem}
  .rsc-head{text-align:center;margin-bottom:1.5rem}
  .rsc-head h2{font-size:1.5rem;font-weight:700;color:rgb(var(--rsc-fg));margin:0}
  .rsc-head p{color:rgb(var(--rsc-muted-fg));margin:.5rem 0 0;font-size:.9rem}
  .rsc-head p b{color:rgb(var(--rsc-fg));font-weight:500}
  .rsc-form{display:flex;flex-direction:column;gap:1rem}
  .rsc-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  .rsc-field label{display:block;font-size:.875rem;font-weight:500;color:rgb(var(--rsc-muted-fg));margin-bottom:.25rem}
  .rsc-input-wrap{position:relative}
  .rsc-input{width:100%;box-sizing:border-box;padding:.5rem .75rem;font:inherit;font-size:.9rem;
    color:rgb(var(--rsc-fg));background:rgb(var(--rsc-surface));
    border:1px solid rgb(var(--rsc-border));border-radius:.375rem;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .rsc-input:focus{outline:none;border-color:rgb(var(--rsc-primary-500));
    box-shadow:0 0 0 2px rgb(var(--rsc-ring) / .55)}
  .rsc-input.rsc-invalid{border-color:rgb(var(--rsc-error-300))}
  .rsc-input.rsc-code{text-align:center;font-size:1.125rem;letter-spacing:.35em}
  .rsc-eye{position:absolute;inset:0 0 0 auto;padding:0 .75rem;display:flex;align-items:center;
    border:0;background:none;cursor:pointer;color:rgb(var(--rsc-muted-fg))}
  .rsc-field-err{margin:.25rem 0 0;font-size:.875rem;color:rgb(var(--rsc-error-600))}
  .rsc-alert{background:rgb(var(--rsc-error-50));border:1px solid rgb(var(--rsc-error-200));
    border-radius:.375rem;padding:.75rem}
  .rsc-alert p{margin:0;font-size:.875rem;color:rgb(var(--rsc-error-600))}
  .rsc-submit{width:100%;display:flex;justify-content:center;align-items:center;gap:.5rem;
    padding:.5rem 1rem;border:1px solid transparent;border-radius:.375rem;cursor:pointer;
    font:inherit;font-size:.875rem;font-weight:500;color:#fff;background:rgb(var(--rsc-primary-600));
    box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .rsc-submit:hover{background:rgb(var(--rsc-primary-700))}
  .rsc-submit:focus{outline:none;box-shadow:0 0 0 2px rgb(var(--rsc-surface)),0 0 0 4px rgb(var(--rsc-ring))}
  .rsc-submit:disabled{opacity:.5;cursor:not-allowed}
  @media (prefers-color-scheme: dark){ .rsc-submit{color:#0B1220} }
  .rsc-spin{width:1.1rem;height:1.1rem;border-radius:999px;border:2px solid currentColor;
    border-right-color:transparent;animation:rscspin .7s linear infinite}
  .rsc-link{border:0;background:none;padding:0;cursor:pointer;font:inherit;font-size:.875rem;
    font-weight:500;color:rgb(var(--rsc-primary-600))}
  .rsc-link:hover{color:rgb(var(--rsc-primary-700))}
  .rsc-link:disabled{opacity:.5;cursor:default}
  .rsc-link.rsc-muted{color:rgb(var(--rsc-muted-fg));font-weight:400}
  .rsc-links{display:flex;justify-content:space-between;align-items:center}
  .rsc-foot{margin-top:1.25rem;text-align:center;font-size:.875rem;color:rgb(var(--rsc-muted-fg))}
  .rsc-reqs{margin-top:1rem;font-size:.75rem;color:rgb(var(--rsc-muted-fg))}
  .rsc-reqs ul{margin:.25rem 0 0;padding-left:1.1rem}
  @keyframes rscfadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes rscslideup{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes rscspin{to{transform:rotate(360deg)}}`;

  let btn = null, menu = null, toasts = null, overlay = null, card = null;
  let pendingEmail = "";     // carried between sign-up -> confirm, sign-in -> challenge/forgot
  let pendingPassword = "";  // memory only: lets confirm auto-sign-in; never persisted
  let challengeSession = ""; // NEW_PASSWORD_REQUIRED session token
  let resendTimer = null;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(text) {
    if (!toasts) return;
    const el = document.createElement("div");
    el.className = "accttoast";
    el.textContent = text;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  /* ---------- the auth modal ---------- */
  const FIELD = (id, label, type, opts = {}) => `
    <div class="rsc-field">
      <label for="${id}">${label}</label>
      <div class="rsc-input-wrap">
        <input class="rsc-input${opts.code ? " rsc-code" : ""}" id="${id}" name="${id}" type="${type}"
          ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ""}
          ${opts.placeholder ? `placeholder="${opts.placeholder}"` : ""}
          ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ""}
          ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""} />
        ${type === "password" ? `<button type="button" class="rsc-eye" data-eye="${id}" aria-label="show password">👁</button>` : ""}
      </div>
      <p class="rsc-field-err" data-err="${id}" hidden></p>
    </div>`;
  const PW_REQS = `
    <div class="rsc-reqs">Password requirements:
      <ul><li>At least 8 characters</li>
      <li>Contains uppercase and lowercase letters</li>
      <li>Contains at least one number</li></ul>
    </div>`;

  const VIEWS = {
    signin: () => `
      <div class="rsc-head"><h2>Sign In</h2><p>Sync your progress across devices and courses</p></div>
      <form class="rsc-form" novalidate>
        <div class="rsc-alert" data-alert hidden><p></p></div>
        ${FIELD("email", "Email", "email", { autocomplete: "email" })}
        ${FIELD("password", "Password", "password", { autocomplete: "current-password" })}
        <div class="rsc-links">
          <button type="button" class="rsc-link" data-goto="forgot">Forgot password?</button>
        </div>
        <button type="submit" class="rsc-submit">Sign In</button>
      </form>
      <div class="rsc-foot">Don't have an account? <button type="button" class="rsc-link" data-goto="signup">Sign up</button></div>`,
    signup: () => `
      <div class="rsc-head"><h2>Create Account</h2><p>One Ready, Set, Cloud account for every course</p></div>
      <form class="rsc-form" novalidate>
        <div class="rsc-alert" data-alert hidden><p></p></div>
        <div class="rsc-row">
          ${FIELD("firstName", "First name", "text", { autocomplete: "given-name" })}
          ${FIELD("lastName", "Last name", "text", { autocomplete: "family-name" })}
        </div>
        ${FIELD("email", "Email", "email", { autocomplete: "email" })}
        ${FIELD("password", "Password", "password", { autocomplete: "new-password" })}
        ${FIELD("confirmPassword", "Confirm password", "password", { autocomplete: "new-password" })}
        <button type="submit" class="rsc-submit">Create Account</button>
      </form>
      ${PW_REQS}
      <div class="rsc-foot">Already have an account? <button type="button" class="rsc-link" data-goto="signin">Sign in</button></div>`,
    confirm: () => `
      <div class="rsc-head"><h2>Verify Your Email</h2><p>We've sent a confirmation code to <b>${esc(pendingEmail)}</b></p></div>
      <form class="rsc-form" novalidate>
        <div class="rsc-alert" data-alert hidden><p></p></div>
        ${FIELD("code", "Confirmation code", "text", { code: true, placeholder: "000000", maxlength: 6, inputmode: "numeric", autocomplete: "one-time-code" })}
        <button type="submit" class="rsc-submit">Verify</button>
        <div class="rsc-links">
          <button type="button" class="rsc-link rsc-muted" data-goto="signin">← Back to sign in</button>
          <button type="button" class="rsc-link" data-resend>Resend confirmation code</button>
        </div>
      </form>`,
    forgot: () => `
      <div class="rsc-head"><h2>Reset Password</h2><p>Enter your email and we'll send you a reset code</p></div>
      <form class="rsc-form" novalidate>
        <div class="rsc-alert" data-alert hidden><p></p></div>
        ${FIELD("email", "Email", "email", { autocomplete: "email" })}
        <button type="submit" class="rsc-submit">Send Reset Code</button>
        <div class="rsc-links">
          <button type="button" class="rsc-link rsc-muted" data-goto="signin">← Back to sign in</button>
        </div>
      </form>`,
    forgotConfirm: () => `
      <div class="rsc-head"><h2>Choose a New Password</h2><p>We've sent a reset code to <b>${esc(pendingEmail)}</b></p></div>
      <form class="rsc-form" novalidate>
        <div class="rsc-alert" data-alert hidden><p></p></div>
        ${FIELD("code", "Reset code", "text", { code: true, placeholder: "000000", maxlength: 6, inputmode: "numeric", autocomplete: "one-time-code" })}
        ${FIELD("password", "New password", "password", { autocomplete: "new-password" })}
        ${FIELD("confirmPassword", "Confirm new password", "password", { autocomplete: "new-password" })}
        <button type="submit" class="rsc-submit">Reset Password</button>
        <div class="rsc-links">
          <button type="button" class="rsc-link" data-resend>Resend code</button>
        </div>
      </form>
      ${PW_REQS}`,
    newPassword: () => `
      <div class="rsc-head"><h2>Choose a New Password</h2><p>Your account requires a new password before signing in</p></div>
      <form class="rsc-form" novalidate>
        <div class="rsc-alert" data-alert hidden><p></p></div>
        ${FIELD("password", "New password", "password", { autocomplete: "new-password" })}
        ${FIELD("confirmPassword", "Confirm new password", "password", { autocomplete: "new-password" })}
        <button type="submit" class="rsc-submit">Set Password</button>
      </form>
      ${PW_REQS}`
  };

  const SUBMIT_LABELS = {
    signin: ["Sign In", "Signing In…"], signup: ["Create Account", "Creating Account…"],
    confirm: ["Verify", "Verifying…"], forgot: ["Send Reset Code", "Sending…"],
    forgotConfirm: ["Reset Password", "Resetting…"], newPassword: ["Set Password", "Saving…"]
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

  /* Per-view client-side validation, mirroring the newsletter forms. */
  function validate(view, v) {
    const errs = {};
    const needEmail = ["signin", "signup", "forgot"].includes(view);
    const needPw = ["signup", "forgotConfirm", "newPassword"].includes(view);
    if (needEmail && !EMAIL_RE.test(v.email || "")) errs.email = "Enter a valid email address.";
    if (view === "signin" && (v.password || "").length < 8) errs.password = "Enter your password.";
    if (view === "signup") {
      if (!(v.firstName || "").trim() || v.firstName.length > 50) errs.firstName = "Required.";
      if (!(v.lastName || "").trim() || v.lastName.length > 50) errs.lastName = "Required.";
    }
    if (needPw) {
      if (!PW_RE.test(v.password || "")) errs.password = "Doesn't meet the requirements below.";
      if (v.password !== v.confirmPassword) errs.confirmPassword = "Passwords don't match.";
    }
    if (["confirm", "forgotConfirm"].includes(view) && !/^\d{6}$/.test(v.code || "")) errs.code = "Enter the 6-digit code.";
    return errs;
  }

  /* What each view's submit actually does. Returns the next view name, or
     null when the modal should close (signed in). */
  const ACTIONS = {
    async signin(v) {
      pendingEmail = v.email;
      try {
        const out = await idp("InitiateAuth", {
          AuthFlow: "USER_PASSWORD_AUTH", ClientId: config.clientId,
          AuthParameters: { USERNAME: v.email, PASSWORD: v.password }
        });
        if (out.ChallengeName === "NEW_PASSWORD_REQUIRED") { challengeSession = out.Session; return "newPassword"; }
        saveAuthResult(out.AuthenticationResult);
        return null;
      } catch (e) {
        if (e.code === "UserNotConfirmedException") {
          pendingPassword = v.password;
          await idp("ResendConfirmationCode", { ClientId: config.clientId, Username: v.email }).catch(() => {});
          return "confirm";
        }
        if (e.code === "PasswordResetRequiredException") {
          await idp("ForgotPassword", { ClientId: config.clientId, Username: v.email }).catch(() => {});
          return "forgotConfirm";
        }
        throw e;
      }
    },
    async signup(v) {
      pendingEmail = v.email; pendingPassword = v.password;
      await idp("SignUp", {
        ClientId: config.clientId, Username: v.email, Password: v.password,
        UserAttributes: [
          { Name: "email", Value: v.email },
          { Name: "given_name", Value: v.firstName.trim() },
          { Name: "family_name", Value: v.lastName.trim() }
        ]
      });
      return "confirm";
    },
    async confirm(v) {
      await idp("ConfirmSignUp", { ClientId: config.clientId, Username: pendingEmail, ConfirmationCode: v.code });
      if (pendingPassword) {
        const out = await idp("InitiateAuth", {
          AuthFlow: "USER_PASSWORD_AUTH", ClientId: config.clientId,
          AuthParameters: { USERNAME: pendingEmail, PASSWORD: pendingPassword }
        });
        pendingPassword = "";
        saveAuthResult(out.AuthenticationResult);
        return null;
      }
      return "signin";
    },
    async forgot(v) {
      pendingEmail = v.email;
      await idp("ForgotPassword", { ClientId: config.clientId, Username: v.email });
      return "forgotConfirm";
    },
    async forgotConfirm(v) {
      await idp("ConfirmForgotPassword", {
        ClientId: config.clientId, Username: pendingEmail,
        ConfirmationCode: v.code, Password: v.password
      });
      const out = await idp("InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH", ClientId: config.clientId,
        AuthParameters: { USERNAME: pendingEmail, PASSWORD: v.password }
      });
      saveAuthResult(out.AuthenticationResult);
      return null;
    },
    async newPassword(v) {
      const out = await idp("RespondToAuthChallenge", {
        ClientId: config.clientId, ChallengeName: "NEW_PASSWORD_REQUIRED", Session: challengeSession,
        ChallengeResponses: { USERNAME: pendingEmail, NEW_PASSWORD: v.password }
      });
      challengeSession = "";
      saveAuthResult(out.AuthenticationResult);
      return null;
    }
  };

  function showView(view) {
    card.innerHTML = `<button type="button" class="rsc-close" aria-label="close">×</button>` + VIEWS[view]();
    card.querySelector(".rsc-close").addEventListener("click", closeModal);
    card.querySelectorAll("[data-goto]").forEach((el) =>
      el.addEventListener("click", () => showView(el.dataset.goto)));
    card.querySelectorAll("[data-eye]").forEach((el) =>
      el.addEventListener("click", () => {
        const input = card.querySelector("#" + el.dataset.eye);
        input.type = input.type === "password" ? "text" : "password";
      }));
    const resend = card.querySelector("[data-resend]");
    if (resend) resend.addEventListener("click", () => resendCode(resend, view));
    const form = card.querySelector("form");
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(view, form); });
    const first = form.querySelector("input");
    if (first) first.focus();
  }

  async function resendCode(button, view) {
    try {
      if (view === "forgotConfirm") await idp("ForgotPassword", { ClientId: config.clientId, Username: pendingEmail });
      else await idp("ResendConfirmationCode", { ClientId: config.clientId, Username: pendingEmail });
    } catch (e) { showAlert(e.message); return; }
    let left = RESEND_COOLDOWN_S;
    const original = button.textContent;
    button.disabled = true;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      button.textContent = `Resend code in ${left--}s`;
      if (left < 0) { clearInterval(resendTimer); button.disabled = false; button.textContent = original; }
    }, 1000);
  }

  const showAlert = (msg) => {
    const alert = card.querySelector("[data-alert]");
    if (!alert) return;
    alert.hidden = false;
    alert.querySelector("p").textContent = msg;
  };

  async function submit(view, form) {
    const values = Object.fromEntries(new FormData(form).entries());
    // field-level validation, newsletter-style
    card.querySelectorAll(".rsc-field-err").forEach((p) => { p.hidden = true; });
    card.querySelectorAll(".rsc-input").forEach((i) => i.classList.remove("rsc-invalid"));
    const errs = validate(view, values);
    for (const [field, msg] of Object.entries(errs)) {
      const p = card.querySelector(`[data-err="${field}"]`);
      const input = card.querySelector("#" + field);
      if (p) { p.textContent = msg; p.hidden = false; }
      if (input) input.classList.add("rsc-invalid");
    }
    if (Object.keys(errs).length) return;

    const button = form.querySelector(".rsc-submit");
    const [label, busy] = SUBMIT_LABELS[view];
    button.disabled = true;
    button.innerHTML = `<span class="rsc-spin"></span>${busy}`;
    try {
      const next = await ACTIONS[view](values);
      if (next === null) {                     // signed in
        closeModal();
        refreshUi();
        pullAndMerge();
      } else {
        showView(next);
      }
    } catch (e) {
      showAlert(e.message || "Something went wrong — please try again.");
    } finally {
      if (!overlay.hidden && card.contains(button)) { button.disabled = false; button.textContent = label; }
    }
  }

  function openModal(view = "signin") {
    overlay.hidden = false;
    showView(view);
  }
  function closeModal() {
    overlay.hidden = true;
    clearInterval(resendTimer);
    pendingPassword = "";
  }

  /* ---------- account chip + menu ---------- */
  function refreshUi(stats) {
    if (!btn) return;
    if (isSignedIn()) {
      const c = claims();
      const name = c.given_name || (c.email || "").split("@")[0] || "account";
      btn.textContent = "◉ " + String(name).slice(0, 14);
      btn.setAttribute("aria-label", "account menu");
    } else {
      btn.textContent = "sign in";
      btn.setAttribute("aria-label", "sign in to sync progress");
      if (menu) menu.hidden = true;
    }
    if (stats && menu && !menu.hidden) fillMenu(stats);
  }

  function fillMenu(stats) {
    const c = claims();
    menu.innerHTML = "";
    const w = document.createElement("div"); w.className = "who";
    w.textContent = c.email || [c.given_name, c.family_name].filter(Boolean).join(" ") || "signed in";
    const s = document.createElement("div"); s.className = "stats";
    s.innerHTML = stats
      ? `<span><b>${stats.xp}</b> xp</span><span><b>${stats.currentStreak}</b>d streak</span>`
      : "syncing…";
    const out = document.createElement("button");
    out.className = "acctbtn"; out.type = "button"; out.textContent = "sign out";
    out.addEventListener("click", () => { menu.hidden = true; signOut(); });
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

    overlay = document.createElement("div");
    overlay.className = "rsc-overlay rsc-auth-scope";
    overlay.hidden = true;
    card = document.createElement("div");
    card.className = "rsc-card";
    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeModal(); });
    document.body.appendChild(overlay);

    const bar = document.querySelector(".hbar");
    if (!bar) return;
    const holder = document.createElement("div");
    holder.style.position = "relative";
    btn = document.createElement("button");
    btn.className = "acctbtn"; btn.id = "acctbtn"; btn.type = "button";
    menu = document.createElement("div");
    menu.className = "acctmenu"; menu.hidden = true;
    btn.addEventListener("click", () => {
      if (!isSignedIn()) { openModal("signin"); return; }
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
    if (!config || !config.clientId || !config.region) return;
    config.apiBase = config.apiBase || "/api";

    injectUi();
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
  return { mergeDetail, localDetail, isEmptyDetail, validate, errorMessage, boot, signOut };
})();
