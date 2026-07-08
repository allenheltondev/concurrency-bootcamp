/* GET /api/badges -> the badge catalog (definitions + criteria), seeded at
   deploy into a single BADGES partition. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

export const handler = async () => {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": "BADGES" }
  }));
  return json(200, { badges: (res.Items ?? []).map(({ pk, sk, type, ...b }) => b) });
};
