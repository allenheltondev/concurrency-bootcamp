/* Single traced DynamoDB document client for the lambdalith, plus the key
   helpers that define the single-table layout in one place. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { tracer } from "./powertools.mjs";

export const ddb = DynamoDBDocumentClient.from(
  tracer.captureAWSv3Client(new DynamoDBClient({})),
  { marshallOptions: { removeUndefinedValues: true } }
);

export const TABLE = process.env.TABLE_NAME;

export const keys = {
  course: (courseId) => ({ pk: "COURSES", sk: `COURSE#${courseId}` }),
  badge: (badgeId) => ({ pk: "BADGES", sk: `BADGE#${badgeId}` }),
  profile: (sub) => ({ pk: `USER#${sub}`, sk: "PROFILE" }),
  progress: (sub, courseId) => ({ pk: `USER#${sub}`, sk: `COURSE#${courseId}` }),
  earnedBadge: (sub, badgeId) => ({ pk: `USER#${sub}`, sk: `BADGE#${badgeId}` })
};

/* Strip storage-only attributes before anything leaves the API. */
export const publicView = ({ pk, sk, type, ...rest }) => rest;
