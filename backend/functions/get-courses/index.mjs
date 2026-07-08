/* GET /api/courses          -> every course in the catalog
   GET /api/courses/{courseId} -> one course, 404 if unknown
   The catalog lives in a single COURSES partition (seeded at deploy by
   backend/tools/seed-catalog.mjs), so listing is a Query, never a Scan. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

const publicView = ({ pk, sk, type, ...rest }) => rest;

export const handler = async (event) => {
  const courseId = event.pathParameters?.courseId;
  if (courseId) {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: "COURSES", sk: `COURSE#${courseId}` }
    }));
    if (!res.Item) return json(404, { message: `no course '${courseId}'` });
    return json(200, publicView(res.Item));
  }
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": "COURSES" }
  }));
  return json(200, { courses: (res.Items ?? []).map(publicView) });
};
