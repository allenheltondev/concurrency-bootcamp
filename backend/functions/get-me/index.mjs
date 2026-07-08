/* GET /api/me        -> profile + gamification stats (XP, streaks)
   GET /api/me/badges -> badges I've earned, with earnedAt
   Identity is always the token's sub claim — never client-supplied. */
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

  if (event.rawPath.endsWith("/badges")) {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":sk": "BADGE#" }
    }));
    return json(200, { badges: (res.Items ?? []).map(({ pk, sk, type, ...b }) => b) });
  }

  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: `USER#${sub}`, sk: "PROFILE" }
  }));
  // A user who has never synced progress still gets a coherent zero-state.
  const { pk, sk, type, ...profile } = res.Item ?? {};
  return json(200, {
    xp: 0, currentStreak: 0, longestStreak: 0, lastActivityDate: null,
    createdAt: null, lastSeenAt: null,
    ...profile
  });
};
