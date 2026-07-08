/* GET /api/me/courses            -> cross-course summary list ("what have I done")
   GET /api/me/courses/{courseId} -> full progress doc (summary + detail + version)
   The list view strips the detail blob — it exists for the single-course
   fetch, and the summaries are what the cross-course screen needs. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  const sub = event.requestContext.authorizer.jwt.claims.sub;
  const courseId = event.pathParameters?.courseId;

  if (courseId) {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: `USER#${sub}`, sk: `COURSE#${courseId}` }
    }));
    if (!res.Item) return json(404, { message: `no progress in '${courseId}'` });
    const { pk, sk, type, ...progress } = res.Item;
    return json(200, progress);
  }

  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":sk": "COURSE#" }
  }));
  const courses = (res.Items ?? []).map(({ pk, sk, type, detail, ...summary }) => summary);
  return json(200, { courses });
};
