/* Catalog reads: courses and badge definitions, seeded at deploy into the
   COURSES / BADGES partitions — listing is a Query, never a Scan. */
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { NotFoundError } from "@aws-lambda-powertools/event-handler/http";
import { ddb, TABLE, keys, publicView } from "../lib/store.mjs";
import { courseIdParams } from "../lib/schemas.mjs";

const partition = async (pk) => {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": pk }
  }));
  return (res.Items ?? []).map(publicView);
};

export const registerCatalogRoutes = (app) => {
  app.get("/courses", async () => ({ courses: await partition("COURSES") }));

  app.get("/badges", async () => ({ badges: await partition("BADGES") }));

  app.get("/courses/:courseId", async (reqCtx) => {
    const { courseId } = reqCtx.valid.req.path;
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.course(courseId) }));
    if (!res.Item) throw new NotFoundError(`no course '${courseId}'`);
    return publicView(res.Item);
  }, { validation: { req: { path: courseIdParams } } });
};
