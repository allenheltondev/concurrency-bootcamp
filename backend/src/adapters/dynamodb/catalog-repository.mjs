/* DAL for the course and badge catalogs — single COURSES / BADGES
   partitions, seeded at deploy by backend/tools/seed-catalog.mjs, so
   listing is a Query, never a Scan over user data. */
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE, toDomain } from "./client.mjs";

const partition = async (pk) => {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": pk }
  }));
  return (res.Items ?? []).map(toDomain);
};

export const createCatalogRepository = () => ({
  listCourses: () => partition("COURSES"),

  listBadges: () => partition("BADGES"),

  async getCourse(courseId) {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: "COURSES", sk: `COURSE#${courseId}` }
    }));
    return res.Item ? toDomain(res.Item) : null;
  }
});
