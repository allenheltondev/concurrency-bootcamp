/* DAL for everything in a user's partition: profile, per-course progress,
   earned badges. Owns the key scheme and the conditional-write expressions;
   storage-level failures surface as domain errors (OptimisticLockError),
   never as AWS exception types. */
import { BatchWriteCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { OptimisticLockError } from "../../domain/errors.mjs";
import { ddb, TABLE, toDomain } from "./client.mjs";

const userPk = (sub) => `USER#${sub}`;
const progressSk = (courseId) => `COURSE#${courseId}`;
const badgeSk = (badgeId) => `BADGE#${badgeId}`;

const isConditionalFailure = (err) => err.name === "ConditionalCheckFailedException";

export const createUserRepository = () => {
  const queryPartition = async (sub, skPrefix) => {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: skPrefix ? "pk = :pk AND begins_with(sk, :sk)" : "pk = :pk",
      ExpressionAttributeValues: { ":pk": userPk(sub), ...(skPrefix && { ":sk": skPrefix }) }
    }));
    return res.Items ?? [];
  };

  return {
    /* Everything about a user is one partition, so the whole snapshot —
       profile, course summaries, earned badges — is a single Query. */
    async getUserSnapshot(sub) {
      const items = await queryPartition(sub);
      return {
        profile: items.filter((i) => i.sk === "PROFILE").map(toDomain)[0] ?? null,
        progress: items.filter((i) => i.sk.startsWith("COURSE#")).map(toDomain),
        earnedBadgeIds: new Set(items.filter((i) => i.sk.startsWith("BADGE#")).map((i) => i.id))
      };
    },

    async getProfile(sub) {
      const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: userPk(sub), sk: "PROFILE" } }));
      return res.Item ? toDomain(res.Item) : null;
    },

    async listProgress(sub) {
      return (await queryPartition(sub, "COURSE#")).map(toDomain);
    },

    async getProgress(sub, courseId) {
      const res = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { pk: userPk(sub), sk: progressSk(courseId) }
      }));
      return res.Item ? toDomain(res.Item) : null;
    },

    async listEarnedBadges(sub) {
      return (await queryPartition(sub, "BADGE#")).map(toDomain);
    },

    async saveProgress(sub, progress, expectedVersion) {
      try {
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: { pk: userPk(sub), sk: progressSk(progress.courseId), type: "progress", ...progress },
          ConditionExpression: "attribute_not_exists(pk) OR version = :expected",
          ExpressionAttributeValues: { ":expected": expectedVersion }
        }));
      } catch (err) {
        if (isConditionalFailure(err)) throw new OptimisticLockError();
        throw err;
      }
    },

    async saveProfile(sub, profile) {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { pk: userPk(sub), sk: "PROFILE", type: "profile", ...profile }
      }));
    },

    async setProfileXp(sub, xp, nowIso) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: userPk(sub), sk: "PROFILE" },
        UpdateExpression: "SET xp = :xp, lastSeenAt = :now, #t = if_not_exists(#t, :type), createdAt = if_not_exists(createdAt, :now)",
        ExpressionAttributeNames: { "#t": "type" },
        ExpressionAttributeValues: { ":xp": xp, ":now": nowIso, ":type": "profile" }
      }));
    },

    /* Idempotent and permanent: returns false if already earned, so a
       concurrent writer can't double-award and earnedAt never moves. */
    async awardBadge(sub, badge) {
      try {
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: { pk: userPk(sub), sk: badgeSk(badge.id), type: "earned-badge", ...badge },
          ConditionExpression: "attribute_not_exists(pk)"
        }));
        return true;
      } catch (err) {
        if (isConditionalFailure(err)) return false;
        throw err;
      }
    },

    async deleteProgress(sub, courseId) {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { pk: userPk(sub), sk: progressSk(courseId) }
      }));
    },

    /* Removes every item in the user's partition — profile, progress, and
       earned badges. Batches of 25 (the BatchWrite limit), retrying
       unprocessed keys a few times before giving up loudly. */
    async deleteAllUserData(sub) {
      const items = await queryPartition(sub);
      let deleted = 0;
      for (let i = 0; i < items.length; i += 25) {
        let requests = items.slice(i, i + 25).map((item) => ({
          DeleteRequest: { Key: { pk: item.pk, sk: item.sk } }
        }));
        for (let attempt = 0; requests.length > 0; attempt++) {
          if (attempt >= 3) throw new Error(`account deletion left ${requests.length} items after retries`);
          const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: requests } }));
          const unprocessed = res.UnprocessedItems?.[TABLE] ?? [];
          deleted += requests.length - unprocessed.length;
          requests = unprocessed;
        }
      }
      return deleted;
    }
  };
};
