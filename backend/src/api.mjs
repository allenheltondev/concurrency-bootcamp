/* The lambdalith: one function behind ANY /api/{proxy+}, with the Powertools
   event-handler Router resolving paths internally.

   This file is the composition root of a hexagonal layout:
     adapters/http      driving adapter — routes, schemas, error mapping
     domain             the core — services, gamification rules, errors;
                        imports nothing from AWS, HTTP, or Powertools
     adapters/dynamodb  driven adapter — the DAL; owns keys and conditional
                        writes, raises domain errors, never leaks pk/sk
   Repositories are injected into services here, so tests (backend/test/)
   and any future storage swap only touch this wiring.

   Powertools wiring:
   - Router (event-handler/http): routing, path params, zod request
     validation, structured 4xx/5xx bodies
   - Logger: structured JSON logs, Lambda context + API Gateway correlation
     id injected via middy
   - Tracer: X-Ray — handler segment via middy, per-route subsegments +
     ColdStart annotation via the router middleware, DynamoDB client captured
     in adapters/dynamodb/client.mjs
   - Metrics (EMF): per-request latency/error/fault with the matched route as
     a dimension via the router middleware, business metrics in the http
     adapter (ProgressSynced, VersionConflict, BadgeAwarded, CourseCompleted,
     CourseReset) */
import middy from "@middy/core";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { RequestEntityTooLargeError, Router } from "@aws-lambda-powertools/event-handler/http";
import { tracer as tracerMiddleware } from "@aws-lambda-powertools/event-handler/http/middleware/tracer";
import { metrics as metricsMiddleware } from "@aws-lambda-powertools/event-handler/http/middleware/metrics";
import { logger, metrics, tracer } from "./lib/powertools.mjs";
import { createCatalogRepository } from "./adapters/dynamodb/catalog-repository.mjs";
import { createUserRepository } from "./adapters/dynamodb/user-repository.mjs";
import { createCatalogService } from "./domain/catalog-service.mjs";
import { createProgressService } from "./domain/progress-service.mjs";
import { registerErrorHandlers } from "./adapters/http/errors.mjs";
import { registerCatalogRoutes } from "./adapters/http/catalog-routes.mjs";
import { registerMeRoutes } from "./adapters/http/me-routes.mjs";

const MAX_BODY_BYTES = 128 * 1024; // well under DynamoDB's 400 KB item cap

const bodyLimit = async ({ reqCtx, next }) => {
  const length = Number(reqCtx.req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    throw new RequestEntityTooLargeError(`request body is capped at ${MAX_BODY_BYTES} bytes`);
  }
  await next();
};

// ---- wire the hexagon: repositories -> services -> routes ----
const catalogRepository = createCatalogRepository();
const userRepository = createUserRepository();
const catalogService = createCatalogService({ catalogRepository });
const progressService = createProgressService({ catalogRepository, userRepository });

const app = new Router({ prefix: "/api", logger });
app.use(tracerMiddleware(tracer));
app.use(metricsMiddleware(metrics));
app.use(bodyLimit);
registerErrorHandlers(app);

// Proves the CloudFront routing + authorizer chain end to end: 401 without a
// token, the caller's identity with one.
app.get("/health", async (reqCtx) => ({
  ok: true,
  sub: reqCtx.event.requestContext?.authorizer?.jwt?.claims?.sub ?? null
}));

registerCatalogRoutes(app, { catalogService });
registerMeRoutes(app, { progressService });

export const handler = middy(async (event, context) => app.resolve(event, context))
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger, { correlationIdPath: "requestContext.requestId" }));
