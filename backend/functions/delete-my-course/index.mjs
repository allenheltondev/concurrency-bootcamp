/* DELETE /api/me/courses/{courseId} — reset my progress in one course (the
   backend twin of the footer's Reset button). Earned badges are permanent
   and stay; XP is derived from stored progress, so it's recomputed from
   what remains. Streaks reflect activity, not holdings — untouched. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const XP_PER_SOLVED = 10;
const XP_PER_COMPLETED_COURSE = 250;

export const handler = async (event) => {
  const sub = event.requestContext.authorizer.jwt.claims.sub;
  const courseId = event.pathParameters?.courseId ?? "";
  if (!/^[a-z0-9-]{1,64}$/.test(courseId)) {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "invalid course id" }) };
  }

  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { pk: `USER#${sub}`, sk: `COURSE#${courseId}` }
  }));

  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":sk": "COURSE#" }
  }));
  const remaining = res.Items ?? [];
  const totalSolved = remaining.reduce((n, p) => n + (p.solvedCount ?? 0), 0);
  const coursesCompleted = remaining.filter((p) => p.status === "completed").length;
  const xp = totalSolved * XP_PER_SOLVED + coursesCompleted * XP_PER_COMPLETED_COURSE;

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `USER#${sub}`, sk: "PROFILE" },
    UpdateExpression: "SET xp = :xp, lastSeenAt = :now, #t = if_not_exists(#t, :type), createdAt = if_not_exists(createdAt, :now)",
    ExpressionAttributeNames: { "#t": "type" },
    ExpressionAttributeValues: { ":xp": xp, ":now": new Date().toISOString(), ":type": "profile" }
  }));

  return { statusCode: 204 };
};
