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

/* ---- seed the catalogs the way the deploy step would ---- */
store.set("COURSES|COURSE#js-concurrency", {
  pk: "COURSES", sk: "COURSE#js-concurrency", type: "course",
  id: "js-concurrency", title: "T", description: "d", status: "active", totalItems: 4
});
for (const b of [
  { id: "first-solve", criteria: { type: "total-solved", count: 1 } },
  { id: "js-concurrency-halfway", criteria: { type: "percent-complete", courseId: "js-concurrency", threshold: 50 } },
  { id: "js-concurrency-complete", criteria: { type: "course-completed", courseId: "js-concurrency" } },
  { id: "first-course", criteria: { type: "courses-completed", count: 1 } },
  { id: "streak-3", criteria: { type: "streak", days: 3 } }
]) {
  store.set(`BADGES|BADGE#${b.id}`, {
    pk: "BADGES", sk: `BADGE#${b.id}`, type: "badge",
    name: b.id, icon: "x", description: "d", ...b
  });
}

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
r = await invoke("GET", "/api/badges");
check("badge catalog lists 5", parse(r).badges.length === 5);
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
check("xp 10", d.stats.xp === 10, JSON.stringify(d.stats));
check("streak starts at 1", d.stats.currentStreak === 1);
check("first-solve awarded", d.newBadges.some((b) => b.id === "first-solve"));
check("halfway NOT awarded", !d.newBadges.some((b) => b.id === "js-concurrency-halfway"));

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true, b: true } }, 0));
check("stale PUT 409", r.statusCode === 409, r.body);
check("409 carries current version", parse(r).current.version === 1);

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true, b: true } }, 1));
d = parse(r);
check("second PUT 200, version 2", r.statusCode === 200 && d.version === 2);
check("halfway awarded once", d.newBadges.length === 1 && d.newBadges[0].id === "js-concurrency-halfway");
check("xp 20", d.stats.xp === 20);

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true, b: true, c: true, d: 1 } }, 2));
d = parse(r);
check("completed at 100%", d.summary.status === "completed" && d.summary.percentComplete === 100);
check("completion badges", ["js-concurrency-complete", "first-course"].every((id) => d.newBadges.some((b) => b.id === id)));
check("xp includes completion bonus", d.stats.xp === 290, d.stats.xp);
check("completedAt set", !!d.summary.completedAt);
const completedAt = d.summary.completedAt;

r = await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true } }, 3));
d = parse(r);
check("regress keeps completedAt", d.summary.completedAt === completedAt);
check("regress -> in-progress", d.summary.status === "in-progress");
check("xp recomputed down", d.stats.xp === 10, d.stats.xp);

/* ---- reads ---- */
r = await invoke("GET", "/api/me/courses");
d = parse(r);
check("list my courses: 1 summary, no detail", d.courses.length === 1 && d.courses[0].detail === undefined);
r = await invoke("GET", "/api/me/courses/js-concurrency");
check("get my course: detail present", parse(r).detail.solved.a === true);
r = await invoke("GET", "/api/me/courses/other-course");
check("no progress 404", r.statusCode === 404);
r = await invoke("GET", "/api/me");
check("profile xp", parse(r).xp === 10, r.body);
r = await invoke("GET", "/api/me/badges");
check("earned badges list", parse(r).badges.length === 4, JSON.stringify(parse(r).badges.map((b) => b.id)));

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
r = await invoke("GET", "/api/me/badges");
check("badges survive reset", parse(r).badges.length === 4);
r = await invoke("GET", "/api/me");
check("xp back to 0", parse(r).xp === 0);

/* ---- full account-data erasure: unlike a reset, nothing survives ---- */
await invoke("PUT", "/api/me/courses/js-concurrency", putBody({ solved: { a: true } }));
r = await invoke("DELETE", "/api/me");
check("delete account 204", r.statusCode === 204, r.statusCode);
r = await invoke("GET", "/api/me/badges");
check("badges erased", parse(r).badges.length === 0);
r = await invoke("GET", "/api/me/courses");
check("progress erased", parse(r).courses.length === 0);
r = await invoke("GET", "/api/me");
check("profile back to zero-state", parse(r).xp === 0 && parse(r).createdAt === null, r.body);
check("catalogs untouched by account deletion", [...store.keys()].filter((k) => k.startsWith("USER#")).length === 0 && store.size === 6);

console.log(failures ? `\n${failures} FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
