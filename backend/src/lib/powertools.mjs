/* One instance of each Powertools utility, shared by the whole lambdalith.
   Service name and metrics namespace come from POWERTOOLS_SERVICE_NAME /
   POWERTOOLS_METRICS_NAMESPACE (set in template.yaml Globals), so the code
   stays environment-agnostic. */
import { Logger } from "@aws-lambda-powertools/logger";
import { search } from "@aws-lambda-powertools/logger/correlationId";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";

export const logger = new Logger({ correlationIdSearchFn: search });
export const tracer = new Tracer();
export const metrics = new Metrics();
export { MetricUnit } from "@aws-lambda-powertools/metrics";
