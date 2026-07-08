/* PUT /api/me/courses/{courseId} — the write path everything hangs off.

   The client submits only its progress document ({ detail, version }); the
   server derives the rest. detail is the same shape the app keeps in
   localStorage ({ solved, position, misses }) and is treated as the app's
   document; the summary (status/counts/percent), XP, streak, and badge
   awards are all computed here so they can't drift from the detail and
   can't be forged by a client.

   Concurrency: optimistic locking. The item carries a version; the write is
   conditional on the version the client read; a mismatch returns 409 with
   the current item so the client can merge and retry. Last-write-wins is
   what silently eats progress when the same account is open on a phone and
   a laptop.

   Profile stats and badges are written after the progress item, not in a
   transaction: every stat is derived from the stored progress, so a crash
   between writes is healed by the next successful PUT. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }
});
const TABLE = process.env.TABLE_NAME;

const MAX_BODY_BYTES = 128 * 1024; // well under DynamoDB's 400 KB item cap
const MAX_MISSES = 50;             // matches the app's own cap
const XP_PER_SOLVED = 10;
const XP_PER_COMPLETED_COURSE = 250;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function invalidDetailReason(detail) {
  if (!isPlainObject(detail)) return "detail must be an object";
  if (!isPlainObject(detail.solved)) return "detail.solved must be an object";
  if (detail.position !== undefined && !isPlainObject(detail.position)) return "detail.position must be an object";
  if (detail.misses !== undefined && !Array.isArray(detail.misses)) return "detail.misses must be an array";
  if ((detail.misses?.length ?? 0) > MAX_MISSES) return `detail.misses is capped at ${MAX_MISSES}`;
  return null;
}

/* Declarative badge criteria — one case per type; adding a badge type is one
   more case here plus a JSON entry in backend/data/badges.json. */
function meetsCriteria(criteria, ctx) {
  const inScope = criteria.courseId
    ? ctx.progress.filter((p) => p.courseId === criteria.courseId)
    : ctx.progress;
  switch (criteria.type) {
    case "total-solved": return ctx.totalSolved >= criteria.count;
    case "streak": return ctx.streak >= criteria.days;
    case "courses-completed": return ctx.coursesCompleted >= criteria.count;
    case "course-started": return inScope.some((p) => p.solvedCount > 0);
    case "percent-complete": return inScope.some((p) => p.percentComplete >= criteria.threshold);
    case "course-completed": return inScope.some((p) => p.status === "completed");
    default: return false; // unknown type: never award rather than misaward
  }
}

export const handler = async (event) => {
  const sub = event.requestContext.authorizer.jwt.claims.sub;
  const courseId = event.pathParameters?.courseId ?? "";
  if (!/^[a-z0-9-]{1,64}$/.test(courseId)) return json(400, { message: "invalid course id" });
  if ((event.body ?? "").length > MAX_BODY_BYTES) return json(413, { message: "progress document too large" });

  let body;
  try { body = JSON.parse(event.body ?? ""); }
  catch { return json(400, { message: "body must be JSON" }); }
  const detailError = invalidDetailReason(body?.detail);
  if (detailError) return json(400, { message: detailError });
  const detail = body.detail;

  // The course must exist — totalItems comes from its catalog entry.
  const courseRes = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: "COURSES", sk: `COURSE#${courseId}` }
  }));
  if (!courseRes.Item) return json(404, { message: `no course '${courseId}'` });

  // Everything about this user is one partition: profile, per-course
  // summaries, earned badges — one Query feeds versioning, stats, and awards.
  const meRes = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": `USER#${sub}` }
  }));
  const me = meRes.Items ?? [];
  const profile = me.find((i) => i.sk === "PROFILE") ?? {};
  const otherProgress = me.filter((i) => i.sk.startsWith("COURSE#") && i.sk !== `COURSE#${courseId}`);
  const existing = me.find((i) => i.sk === `COURSE#${courseId}`);
  const earned = new Set(me.filter((i) => i.sk.startsWith("BADGE#")).map((i) => i.id));

  const now = new Date().toISOString();
  const today = now.slice(0, 10); // UTC day; a timezone pref can refine later

  const totalItems = courseRes.Item.totalItems ?? 0;
  const solvedCount = Object.values(detail.solved).filter(Boolean).length;
  const percentComplete = totalItems ? Math.min(100, Math.floor((100 * solvedCount) / totalItems)) : 0;
  const status = totalItems && solvedCount >= totalItems ? "completed" : "in-progress";
  const expectedVersion = Number.isInteger(body.version) ? body.version : 0;

  const progress = {
    pk: `USER#${sub}`,
    sk: `COURSE#${courseId}`,
    type: "progress",
    courseId,
    version: expectedVersion + 1,
    status,
    solvedCount,
    totalItems,
    percentComplete,
    startedAt: existing?.startedAt ?? now,
    // First completion is permanent — dropping below 100% later never unsets it.
    completedAt: existing?.completedAt ?? (status === "completed" ? now : undefined),
    lastAccessedAt: now,
    detail
  };

  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: progress,
      ConditionExpression: "attribute_not_exists(pk) OR version = :expected",
      ExpressionAttributeValues: { ":expected": expectedVersion }
    }));
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
    // Another device wrote first. Hand back the current doc so the client
    // can merge (union solved/misses, newest position) and retry.
    const current = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: `USER#${sub}`, sk: `COURSE#${courseId}` }
    }));
    const { pk, sk, type, ...doc } = current.Item ?? {};
    return json(409, { message: "version conflict — merge with current and retry", current: doc });
  }

  // ---- Derived stats (XP recomputed, never accumulated, so it can't drift) ----
  const allProgress = [...otherProgress, progress];
  const totalSolved = allProgress.reduce((n, p) => n + (p.solvedCount ?? 0), 0);
  const coursesCompleted = allProgress.filter((p) => p.status === "completed").length;
  const xp = totalSolved * XP_PER_SOLVED + coursesCompleted * XP_PER_COMPLETED_COURSE;

  let currentStreak = 1;
  if (profile.lastActivityDate === today) currentStreak = profile.currentStreak ?? 1;
  else if (profile.lastActivityDate === new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
    currentStreak = (profile.currentStreak ?? 0) + 1;
  }
  const longestStreak = Math.max(currentStreak, profile.longestStreak ?? 0);

  const stats = { xp, currentStreak, longestStreak, lastActivityDate: today };
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      pk: `USER#${sub}`, sk: "PROFILE", type: "profile",
      createdAt: profile.createdAt ?? now, lastSeenAt: now,
      ...stats
    }
  }));

  // ---- Badge awards: evaluate the catalog against the fresh state ----
  const badgeRes = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": "BADGES" }
  }));
  const ctx = { totalSolved, coursesCompleted, streak: currentStreak, progress: allProgress };
  const newBadges = [];
  for (const badge of badgeRes.Items ?? []) {
    if (earned.has(badge.id) || !meetsCriteria(badge.criteria ?? {}, ctx)) continue;
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          pk: `USER#${sub}`, sk: `BADGE#${badge.id}`, type: "earned-badge",
          id: badge.id, name: badge.name, icon: badge.icon,
          earnedAt: now,
          courseId: badge.criteria?.courseId
        },
        // Awards are idempotent and permanent: a concurrent writer can't
        // double-award, and earnedAt never moves.
        ConditionExpression: "attribute_not_exists(pk)"
      }));
      newBadges.push({ id: badge.id, name: badge.name, icon: badge.icon, description: badge.description });
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
    }
  }

  const { pk, sk, type, detail: _detail, version, ...summary } = progress;
  return json(200, { courseId, version, summary, stats, newBadges });
};
