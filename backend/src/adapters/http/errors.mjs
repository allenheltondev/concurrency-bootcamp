/* Maps domain errors to HTTP responses — the only place status codes and
   domain failures meet. Registered on the router, so route handlers just
   call services and let errors propagate. */
import { CourseNotFoundError, ProgressNotFoundError, VersionConflictError } from "../../domain/errors.mjs";
import { logger, metrics, MetricUnit } from "../../lib/powertools.mjs";

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });

export const registerErrorHandlers = (app) => {
  app.errorHandler([CourseNotFoundError, ProgressNotFoundError], async (error) =>
    json(404, { statusCode: 404, error: "NotFoundError", message: error.message }));

  app.errorHandler(VersionConflictError, async (error, reqCtx) => {
    metrics.addMetric("VersionConflict", MetricUnit.Count, 1);
    logger.info("progress version conflict", { path: reqCtx.route });
    return json(409, { message: error.message, current: error.current ?? {} });
  });
};
