#!/usr/bin/env node
/* Integration smoke test for the deployed backend API. Hits the real thing
   through CloudFront with a real Cognito token — the check the in-process
   test suite can't make: issuer/audience config, the JWT authorizer, and the
   /api/* routing, end to end. Dependency-free (Node 18+ fetch).

   Config (env):
     API_URL            base URL, default https://bootcamp.readysetcloud.io/api
     TOKEN              a valid JWT — skips sign-in when provided
   or, to sign in a dedicated smoke-test user via USER_PASSWORD_AUTH:
     COGNITO_CLIENT_ID  this app's client id (UserPoolClientId stack output)
     SMOKE_USERNAME     the test user's username/email
     SMOKE_PASSWORD     the test user's password
     AWS_REGION         default us-east-1
   optional:
     SMOKE_MUTATE=1     also exercise the write path (PUT + DELETE progress
                        for the smoke user — safe only on a dedicated user)

   Usage: node backend/tools/integration-smoke.mjs */

const API_URL = (process.env.API_URL ?? "https://bootcamp.readysetcloud.io/api").replace(/\/$/, "");
const REGION = process.env.AWS_REGION ?? "us-east-1";
const COURSE_ID = "js-concurrency";

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  " + extra}`);
  if (!cond) failures++;
};
const die = (msg) => { console.error(`integration-smoke: ${msg}`); process.exit(1); };

async function signIn() {
  if (process.env.TOKEN) return process.env.TOKEN;
  const { COGNITO_CLIENT_ID, SMOKE_USERNAME, SMOKE_PASSWORD } = process.env;
  if (!COGNITO_CLIENT_ID || !SMOKE_USERNAME || !SMOKE_PASSWORD) {
    die("set TOKEN, or COGNITO_CLIENT_ID + SMOKE_USERNAME + SMOKE_PASSWORD");
  }
  const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth"
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: SMOKE_USERNAME, PASSWORD: SMOKE_PASSWORD }
    })
  });
  const body = await res.json();
  if (!res.ok || !body.AuthenticationResult?.IdToken) {
    die(`sign-in failed (${res.status}): ${body.__type ?? ""} ${body.message ?? ""}`);
  }
  return body.AuthenticationResult.IdToken;
}

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body && { "content-type": "application/json" })
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body stays null */ }
  return { status: res.status, json, text };
};

// ---- auth boundary: no token must be rejected before any handler runs ----
let r = await api("GET", "/health");
check("unauthenticated /health -> 401", r.status === 401, `${r.status} ${r.text.slice(0, 120)}`);

const token = await signIn();

// ---- reads with a real token ----
r = await api("GET", "/health", { token });
check("authenticated /health -> 200 with sub", r.status === 200 && !!r.json?.sub, `${r.status} ${r.text.slice(0, 120)}`);
const sub = r.json?.sub;

r = await api("GET", "/courses", { token });
check("course catalog includes js-concurrency", r.status === 200 && r.json?.courses?.some((c) => c.id === COURSE_ID), r.text.slice(0, 200));

r = await api("GET", "/badges", { token });
check("badge catalog is seeded", r.status === 200 && r.json?.badges?.length > 0, r.text.slice(0, 200));

r = await api("GET", "/me", { token });
check("/me returns a profile", r.status === 200 && typeof r.json?.xp === "number", r.text.slice(0, 200));

r = await api("GET", "/nope", { token });
check("unknown route -> 404, well-shaped body", r.status === 404 && r.json?.error === "NotFoundError", r.text.slice(0, 200));

// ---- write path (opt-in: mutates the smoke user's data) ----
if (process.env.SMOKE_MUTATE === "1") {
  const current = await api("GET", `/me/courses/${COURSE_ID}`, { token });
  const version = current.status === 200 ? current.json.version : 0;

  r = await api("PUT", `/me/courses/${COURSE_ID}`, {
    token,
    body: { version, detail: { solved: { "smoke-test": true }, position: {}, misses: [] } }
  });
  check("PUT progress -> 200 with summary + stats", r.status === 200 && r.json?.summary && r.json?.stats, `${r.status} ${r.text.slice(0, 200)}`);

  r = await api("PUT", `/me/courses/${COURSE_ID}`, {
    token,
    body: { version: 0, detail: { solved: {} } }
  });
  // version 0 is only valid for a fresh doc, and we just wrote one above
  check("stale PUT -> 409 with current doc", r.status === 409 && r.json?.current?.version >= 1, `${r.status} ${r.text.slice(0, 200)}`);

  r = await api("DELETE", `/me/courses/${COURSE_ID}`, { token });
  check("DELETE progress -> 204", r.status === 204, r.status);
} else {
  console.log("- write path skipped (set SMOKE_MUTATE=1 with a dedicated test user to enable)");
}

console.log(failures ? `\n${failures} FAILED` : `\nall smoke checks passed (sub ${sub})`);
process.exit(failures ? 1 : 0);
