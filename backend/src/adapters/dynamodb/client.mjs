/* Single traced DynamoDB document client shared by the repositories. */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { tracer } from "../../lib/powertools.mjs";

export const ddb = DynamoDBDocumentClient.from(
  tracer.captureAWSv3Client(new DynamoDBClient({})),
  { marshallOptions: { removeUndefinedValues: true } }
);

export const TABLE = process.env.TABLE_NAME;

/* Storage items carry pk/sk/type; domain objects never see them. */
export const toDomain = ({ pk, sk, type, ...rest }) => rest;
