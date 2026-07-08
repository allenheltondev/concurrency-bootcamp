/* Maps errors to HTTP responses — the only place failures meet status codes
   — and the error side of the structured logging story:

   - domain not-found        -> warn (name, message, request context), 404
   - version conflict        -> info + VersionConflict metric, 409 + current doc
   - framework HttpError     -> warn (404 route-miss gets its own line;
     (route 404, validation     validation/413 keep their default bodies via
     422, body limit 413)      toWebResponse), status preserved
   - anything else           -> error WITH name/message/stack in the log,
                                and a deliberately generic 500 body — internal
                                details are for CloudWatch, never for clients. */
import { HttpError } from "@aws-lambda-powertools/event-handler/http";
import { CourseNotFoundError, ProgressNotFoundError, VersionConflictError } from "../../domain/errors.mjs";
import { logger, metrics, MetricUnit } from "../../lib/powertools.mjs";

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json" } });

const requestContext = (reqCtx) => ({
  method: reqCtx.req.method,
  path: new URL(reqCtx.req.url).pathname,
  route: reqCtx.route,
  sub: reqCtx.event?.requestContext?.authorizer?.jwt?.claims?.sub
});

export const registerErrorHandlers = (app) => {
  app.errorHandler([CourseNotFoundError, ProgressNotFoundError], async (error, reqCtx) => {
    logger.warn("domain object not found", { ...requestContext(reqCtx), error: error.name, errorMessage: error.message });
    return json(404, { statusCode: 404, error: "NotFoundError", message: error.message });
  });

  app.errorHandler(VersionConflictError, async (error, reqCtx) => {
    metrics.addMetric("VersionConflict", MetricUnit.Count, 1);
    logger.info("progress version conflict", requestContext(reqCtx));
    return json(409, { message: error.message, current: error.current ?? {} });
  });

  // Catch-all. Specific handlers above win; everything else lands here.
  app.errorHandler(Error, async (error, reqCtx) => {
    const request = requestContext(reqCtx);

    // The router's own errors (route 404, validation 422, body-limit 413…)
    // already have safe, well-shaped bodies — log, then let them through.
    if (error instanceof HttpError) {
      if (error.statusCode === 404) {
        logger.warn("no route matched", request);
      } else {
        logger.warn("request rejected", {
          ...request,
          error: error.name,
          statusCode: error.statusCode,
          errorMessage: error.message,
          details: error.details
        });
      }
      return error.toWebResponse();
    }

    // Unexpected failure: full details (stack included) go to the log,
    // a generic body goes to the client.
    logger.error("unhandled error", {
      ...request,
      error: error.name,
      errorMessage: error.message,
      stack: error.stack
    });
    return json(500, { statusCode: 500, error: "InternalServerError", message: "Internal Server Error" });
  });
};
