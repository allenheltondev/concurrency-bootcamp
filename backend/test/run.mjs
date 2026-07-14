/* Functional tests for the lambdalith. Drives the exported middy handler
   with synthetic API Gateway HTTP API (v2) events — the same chain a real
   request takes (middy -> Powertools -> router -> validation -> handler) —
   against the in-memory DynamoDB fake registered by test/register.mjs.
   Run from backend/: npm test */

// Environment must be set before the app modules are imported. Logs stay ON
// (INFO) — they're part of the contract under test — but every invocation
// captures stdout, so test output stays readable and log lines are
// assertable via lastLogs().
process.env.TABLE_NAME = "test-table";
process.env.POWERTOOLS_LOG_LEVEL = "INFO";
process.env.POWERTOOLS_TRACE_ENABLED = "false";
process.env.POWERTOOLS_METRICS_DISABLED = "true";
process.env.POWERTOOLS_SERVICE_NAME = "test";
process.env.POWERTOOLS_METRICS_NAMESPACE = "Test";

const { store, failNextCall } = await import("@aws-sdk/lib-dynamodb");
const { handler } = await import("../src/api.mjs");

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : "  " + extra}`);
  if (!cond) failures++;
};

/* ---- seed the course catalog the way the deploy step would (badges are
   authored in the shared rsc-core catalog, not this backend) ---- */
store.set("COURSES|COURSE#js-concurrency", {
  pk: "COURSES", sk: "COURSE#js-concurrency", type: "course",
  id: "js-concurrency", title: "T", description: "d", status: "active", totalItems: 4
});

/* ---- synthetic HTTP API v2 events through the real handler ---- */
const lambdaCtx = {
  functionName: "test", awsRequestId: "req-1", callbackWaitsForEmptyEventLoop: true,
  functionVersion: "1", invokedFunctionArn: "arn:aws:lambda:::function:test",
  memoryLimitInMB: "256", logGroupName: "g", logStreamName: "s",
  getRemainingTimeInMillis: () => 10_000
};
let capturedLogs = [];
const lastLogs = () => capturedLogs.join("");

const invoke = async (method, path, body, extraHeaders = {}) => {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  // Powertools logs info to stdout and warn/error to stderr — capture both.
  capturedLogs = [];
  const capture = (chunk) => { capturedLogs.push(String(chunk)); return true; };
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  process.stdout.write = capture;
  process.stderr.write = capture;
  try {
    return await doInvoke(method, path, raw, extraHeaders);
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
};

const doInvoke = (method, path, raw, extraHeaders) => {
  return handler({
    version: "2.0",
    routeKey: "ANY /api/{proxy+}",
    rawPath: path,
    rawQueryString: "",
    headers: {
      "content-type": "application/json",
      ...(raw !== undefined && { "content-length": String(Buffer.byteLength(raw)) }),
      ...extraHeaders
    },
    requestContext: {
      requestId: "req-1", apiId: "api", http: { method, path },
      authorizer: { jwt: { claims: { sub: "u1" } } }
    },
    body: raw,
    isBase64Encoded: false
  }, lambdaCtx);
};

// The public catalog routes (template.yaml, Auth: Authorizer: NONE) are
// invoked by API Gateway with NO authorizer block at all — unlike every
// other test above, which always carries one. This confirms the handler
// doesn't assume requestContext.authorizer exists for those routes.
const invokeNoAuthorizer = (method, path) => handler({
  version: "2.0",
  routeKey: "ANY /api/{proxy+}",
  rawPath: path,
  rawQueryString: "",
  headers: { "content-type": "application/json" },
  requestContext: { requestId: "req-1", apiId: "api", http: { method, path } },
  body: undefined,
  isBase64Encoded: false
}, lambdaCtx);
const parse = (r) => (r.body ? JSON.parse(r.body) : null);
const putBody = (detail, version) => ({ detail, ...(version !== undefined && { version }) });

/* ---- health + catalogs ---- */
let r = await invoke("GET", "/api/health");
check("health 200 with caller identity", r.statusCode === 200 && parse(r).sub === "u1", r.body);
check("access log: request handled with route/status/sub",
  lastLogs().includes('"request handled"') && lastLogs().includes('"status":200')
  && lastLogs().includes('"route":') && lastLogs().includes('"sub":"u1"'), lastLogs().slice(0, 400));
check("access log carries correlation id", lastLogs().includes('"correlation_id":"req-1"'));
r = await invoke("GET", "/api/courses");
check("course catalog lists 1", parse(r).courses.length === 1 && parse(r).courses[0].pk === undefined);
r = await invoke("GET", "/api/courses/js-concurrency");
check("single course fetch", parse(r).totalItems === 4);
r = await invoke("GET", "/api/courses/unknown-course");
check("unknown course 404", r.statusCode === 404);

// ---- public catalog routes must not 500 when API GW omits the authorizer
// (template.yaml's Auth: Authorizer: NONE means it always will) ----
r = await invokeNoAuthorizer("GET", "/api/courses");
check("public /courses works with no authorizer block", r.statusCode === 200 && parse(r).courses.length === 1, r.body);
r = await invokeNoAuthorizer("GET", "/api/courses/js-concurrency");
check("public /courses/:id works with no authorizer block", r.statusCode === 200 && parse(r).totalItems === 4, r.body);

r = await invoke("GET", "/api/nope");
check("unknown route 404", r.statusCode === 404);
check("route miss logged as warn", lastLogs().includes('"no route matched"') && lastLogs().includes('"/api/nope"'), lastLogs().slice(0, 400));

/* ---- unexpected errors: full details to logs, generic body to clients ---- */
failNextCall(new Error("secret db detail: connection string"));
r = await invoke("GET", "/api/courses");
check("storage failure -> 500", r.statusCode === 500, r.statusCode);
check("500 body is generic", parse(r).message === "Internal Server Error", r.body);
check("500 body leaks no internals", !r.body.includes("secret"));
check("500 log has error + stack + route context",
  lastLogs().includes('"unhandled error"') && lastLogs().includes("secret db detail")
  && lastLogs().includes('"stack"') && lastLogs().includes('"/api/courses"'), lastLogs().slice(0, 600));

/* ---- progress write path ---- */
r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true }, position: { module: "learn" }, misses: [] }));
let d = parse(r);
check("first PUT 200", r.statusCode === 200, r.body);
check("version 1", d.version === 1);
check("25% in-progress", d.summary.percentComplete === 25 && d.summary.status === "in-progress");
check("no gamification in response", d.stats === undefined && d.newBadges === undefined, r.body);

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true, b: true } }, 0));
check("stale PUT 409", r.statusCode === 409, r.body);
check("409 carries current version", parse(r).current.version === 1);

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true, b: true } }, 1));
d = parse(r);
check("second PUT 200, version 2", r.statusCode === 200 && d.version === 2);
check("50% in-progress", d.summary.percentComplete === 50 && d.summary.status === "in-progress");

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true, b: true, c: true, d: 1 } }, 2));
d = parse(r);
check("completed at 100%", d.summary.status === "completed" && d.summary.percentComplete === 100);
check("completedAt set", !!d.summary.completedAt);
const completedAt = d.summary.completedAt;

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true } }, 3));
d = parse(r);
check("regress keeps completedAt", d.summary.completedAt === completedAt);
check("regress -> in-progress", d.summary.status === "in-progress");

/* ---- reads ---- */
r = await invoke("GET", "/api/me/courses");
d = parse(r);
check("list my courses: 1 summary, no detail", d.courses.length === 1 && d.courses[0].detail === undefined);
r = await invoke("GET", "/api/me/courses/js-concurrency");
check("get my course: detail present", parse(r).detail.solved.a === true);
r = await invoke("GET", "/api/me/courses/other-course");
check("no progress 404", r.statusCode === 404);
r = await invoke("GET", "/api/me");
check("profile has createdAt/lastSeenAt, no xp", parse(r).lastSeenAt !== null && parse(r).xp === undefined, r.body);

/* ---- validation & limits ---- */
r = await invoke("PUT", "/api/me/courses/js-concurrency", { detail: { solved: [] } });
check("bad detail rejected", r.statusCode >= 400 && r.statusCode < 500, r.statusCode);
r = await invoke("PUT", "/api/me/courses/NOPE!", putBody({ solved: {} }));
check("bad course id rejected", r.statusCode >= 400 && r.statusCode < 500, r.statusCode);
r = await invoke("PUT", "/api/me/courses/unknown-course", putBody({ solved: {} }));
check("unknown course PUT 404", r.statusCode === 404, r.statusCode);
r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: {} }), { "content-length": String(1024 * 1024) });
check("oversized body 413", r.statusCode === 413, r.statusCode);

/* ---- reset ---- */
r = await invoke("DELETE", "/api/me/courses/js-concurrency");
check("delete 204", r.statusCode === 204, r.statusCode);
r = await invoke("GET", "/api/me/courses");
check("no courses after delete", parse(r).courses.length === 0);

/* ---- full account-data erasure: unlike a reset, nothing survives ---- */
await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true } }));
r = await invoke("DELETE", "/api/me");
check("delete account 204", r.statusCode === 204, r.statusCode);
r = await invoke("GET", "/api/me/courses");
check("progress erased", parse(r).courses.length === 0);
r = await invoke("GET", "/api/me");
check("profile back to zero-state", parse(r).createdAt === null && parse(r).lastSeenAt === null, r.body);
check("catalog untouched by account deletion", [...store.keys()].filter((k) => k.startsWith("USER#")).length === 0 && store.size === 1);

console.log(failures ? `\n${failures} FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
