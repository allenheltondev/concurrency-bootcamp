/* Driving adapter: everything under /api/me. Routes stay thin — identity
   extraction, validation, service calls, business metrics/logs. All rules
   live in the domain layer. Identity is always the JWT's sub claim, never
   client-supplied. */
import { logger, metrics, MetricUnit } from "../../lib/powertools.mjs";
import { courseIdParams, progressBody } from "./schemas.mjs";

const subOf = (reqCtx) => reqCtx.event.requestContext.authorizer.jwt.claims.sub;

export const registerMeRoutes = (app, { progressService }) => {
  app.get("/me", async (reqCtx) => progressService.getProfile(subOf(reqCtx)));

  app.get("/me/badges", async (reqCtx) => ({
    badges: await progressService.listEarnedBadges(subOf(reqCtx))
  }));

  app.get("/me/courses", async (reqCtx) => ({
    courses: await progressService.listCourseSummaries(subOf(reqCtx))
  }));

  app.get("/me/courses/:courseId", async (reqCtx) =>
    progressService.getCourseProgress(subOf(reqCtx), reqCtx.valid.req.path.courseId),
  { validation: { req: { path: courseIdParams } } });

  app.put("/me/courses/:courseId", async (reqCtx) => {
    const sub = subOf(reqCtx);
    const { courseId } = reqCtx.valid.req.path;
    const { completedNow, ...result } = await progressService.syncProgress(sub, courseId, reqCtx.valid.req.body);

    metrics.addMetric("ProgressSynced", MetricUnit.Count, 1);
    if (result.newBadges.length) metrics.addMetric("BadgeAwarded", MetricUnit.Count, result.newBadges.length);
    if (completedNow) metrics.addMetric("CourseCompleted", MetricUnit.Count, 1);
    logger.info("progress synced", {
      sub, courseId,
      solvedCount: result.summary.solvedCount,
      percentComplete: result.summary.percentComplete,
      newBadges: result.newBadges.map((b) => b.id)
    });

    return result;
  }, { validation: { req: { path: courseIdParams, body: progressBody } } });

  app.delete("/me/courses/:courseId", async (reqCtx) => {
    const sub = subOf(reqCtx);
    const { courseId } = reqCtx.valid.req.path;
    await progressService.resetProgress(sub, courseId);

    metrics.addMetric("CourseReset", MetricUnit.Count, 1);
    logger.info("progress reset", { sub, courseId });
    return new Response(null, { status: 204 });
  }, { validation: { req: { path: courseIdParams } } });
};
