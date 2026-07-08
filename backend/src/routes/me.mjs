/* Everything under /api/me — profile + stats, cross-course summaries, earned
   badges, and the progress write path that XP, streaks, and badge awards all
   hang off. Identity is always the JWT's sub claim, never client-supplied. */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { NotFoundError } from "@aws-lambda-powertools/event-handler/http";
import { logger, metrics, MetricUnit } from "../lib/powertools.mjs";
import { ddb, TABLE, keys, publicView } from "../lib/store.mjs";
import { computeXp, meetsCriteria, nextStreak } from "../lib/gamification.mjs";
import { courseIdParams, progressBody } from "../lib/schemas.mjs";

const subOf = (reqCtx) => reqCtx.event.requestContext.authorizer.jwt.claims.sub;

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });

const myPartition = async (sub, skPrefix) => {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: skPrefix ? "pk = :pk AND begins_with(sk, :sk)" : "pk = :pk",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ...(skPrefix && { ":sk": skPrefix }) }
  }));
  return res.Items ?? [];
};

export const registerMeRoutes = (app) => {
  app.get("/me", async (reqCtx) => {
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.profile(subOf(reqCtx)) }));
    // A user who has never synced still gets a coherent zero-state.
    return {
      xp: 0, currentStreak: 0, longestStreak: 0, lastActivityDate: null,
      createdAt: null, lastSeenAt: null,
      ...publicView(res.Item ?? {})
    };
  });

  app.get("/me/badges", async (reqCtx) => ({
    badges: (await myPartition(subOf(reqCtx), "BADGE#")).map(publicView)
  }));

  app.get("/me/courses", async (reqCtx) => ({
    // Summaries only — the detail blob belongs to the single-course fetch.
    courses: (await myPartition(subOf(reqCtx), "COURSE#")).map(({ detail, ...item }) => publicView(item))
  }));

  app.get("/me/courses/:courseId", async (reqCtx) => {
    const { courseId } = reqCtx.valid.req.path;
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.progress(subOf(reqCtx), courseId) }));
    if (!res.Item) throw new NotFoundError(`no progress in '${courseId}'`);
    return publicView(res.Item);
  }, { validation: { req: { path: courseIdParams } } });

  app.put("/me/courses/:courseId", async (reqCtx) => {
    const sub = subOf(reqCtx);
    const { courseId } = reqCtx.valid.req.path;
    const { detail, version: clientVersion } = reqCtx.valid.req.body;

    // The course must exist — totalItems comes from its catalog entry.
    const courseRes = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.course(courseId) }));
    if (!courseRes.Item) throw new NotFoundError(`no course '${courseId}'`);

    // Everything about this user is one partition: profile, per-course
    // summaries, earned badges — one Query feeds versioning, stats, awards.
    const me = await myPartition(sub);
    const profile = me.find((i) => i.sk === "PROFILE") ?? {};
    const otherProgress = me.filter((i) => i.sk.startsWith("COURSE#") && i.sk !== `COURSE#${courseId}`);
    const existing = me.find((i) => i.sk === `COURSE#${courseId}`);
    const earned = new Set(me.filter((i) => i.sk.startsWith("BADGE#")).map((i) => i.id));

    const now = new Date().toISOString();
    const totalItems = courseRes.Item.totalItems ?? 0;
    const solvedCount = Object.values(detail.solved).filter(Boolean).length;
    const percentComplete = totalItems ? Math.min(100, Math.floor((100 * solvedCount) / totalItems)) : 0;
    const status = totalItems && solvedCount >= totalItems ? "completed" : "in-progress";
    const expectedVersion = clientVersion ?? 0;

    const progress = {
      ...keys.progress(sub, courseId),
      type: "progress",
      courseId,
      version: expectedVersion + 1,
      status,
      solvedCount,
      totalItems,
      percentComplete,
      startedAt: existing?.startedAt ?? now,
      // First completion is permanent — regressing below 100% never unsets it.
      completedAt: existing?.completedAt ?? (status === "completed" ? now : undefined),
      lastAccessedAt: now,
      detail
    };

    // Optimistic locking: the write only lands if the client wrote against
    // the version it read. Last-write-wins is what silently eats progress
    // when the same account is open on a phone and a laptop.
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: progress,
        ConditionExpression: "attribute_not_exists(pk) OR version = :expected",
        ExpressionAttributeValues: { ":expected": expectedVersion }
      }));
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
      metrics.addMetric("VersionConflict", MetricUnit.Count, 1);
      logger.info("progress version conflict", { sub, courseId, expectedVersion });
      const current = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.progress(sub, courseId) }));
      return json(409, {
        message: "version conflict — merge with current and retry",
        current: publicView(current.Item ?? {})
      });
    }

    // ---- Derived stats: recomputed from stored progress, never accumulated ----
    const allProgress = [...otherProgress, progress];
    const { totalSolved, coursesCompleted, xp } = computeXp(allProgress);
    const streak = nextStreak(profile, now.slice(0, 10));
    const stats = { xp, ...streak };
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...keys.profile(sub), type: "profile",
        createdAt: profile.createdAt ?? now, lastSeenAt: now,
        ...stats
      }
    }));

    // ---- Badge awards: evaluate the catalog against the fresh state ----
    const badgeCatalog = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "BADGES" }
    }));
    const ctx = { totalSolved, coursesCompleted, streak: streak.currentStreak, progress: allProgress };
    const newBadges = [];
    for (const badge of badgeCatalog.Items ?? []) {
      if (earned.has(badge.id) || !meetsCriteria(badge.criteria ?? {}, ctx)) continue;
      try {
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            ...keys.earnedBadge(sub, badge.id), type: "earned-badge",
            id: badge.id, name: badge.name, icon: badge.icon,
            earnedAt: now,
            courseId: badge.criteria?.courseId
          },
          // Idempotent and permanent: no double-award, earnedAt never moves.
          ConditionExpression: "attribute_not_exists(pk)"
        }));
        newBadges.push({ id: badge.id, name: badge.name, icon: badge.icon, description: badge.description });
      } catch (err) {
        if (err.name !== "ConditionalCheckFailedException") throw err;
      }
    }

    metrics.addMetric("ProgressSynced", MetricUnit.Count, 1);
    if (newBadges.length) metrics.addMetric("BadgeAwarded", MetricUnit.Count, newBadges.length);
    if (status === "completed" && existing?.status !== "completed") {
      metrics.addMetric("CourseCompleted", MetricUnit.Count, 1);
    }
    logger.info("progress synced", { sub, courseId, solvedCount, percentComplete, newBadges: newBadges.map((b) => b.id) });

    const { pk, sk, type, detail: _detail, version, ...summary } = progress;
    return { courseId, version, summary, stats, newBadges };
  }, { validation: { req: { path: courseIdParams, body: progressBody } } });

  app.delete("/me/courses/:courseId", async (reqCtx) => {
    const sub = subOf(reqCtx);
    const { courseId } = reqCtx.valid.req.path;

    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: keys.progress(sub, courseId) }));

    // XP is derived, so a reset just recomputes it from what remains.
    // Badges are permanent and streaks reflect activity — both untouched.
    const remaining = await myPartition(sub, "COURSE#");
    const { xp } = computeXp(remaining);
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: keys.profile(sub),
      UpdateExpression: "SET xp = :xp, lastSeenAt = :now, #t = if_not_exists(#t, :type), createdAt = if_not_exists(createdAt, :now)",
      ExpressionAttributeNames: { "#t": "type" },
      ExpressionAttributeValues: { ":xp": xp, ":now": new Date().toISOString(), ":type": "profile" }
    }));

    metrics.addMetric("CourseReset", MetricUnit.Count, 1);
    logger.info("progress reset", { sub, courseId });
    return new Response(null, { status: 204 });
  }, { validation: { req: { path: courseIdParams } } });
};
