/* In-memory fake of the DynamoDB document client — just enough for this
   backend's handlers: Get/Put/Delete/Query/Update with the specific
   condition, key-condition, and update expressions they use. Not a general
   emulator; unsupported expressions throw so a new query shape can't pass
   tests by accident. */
export const store = new Map();
const key = (k) => `${k.pk}|${k.sk}`;

class Cmd { constructor(input) { this.input = input; } }
export class GetCommand extends Cmd {}
export class PutCommand extends Cmd {}
export class DeleteCommand extends Cmd {}
export class QueryCommand extends Cmd {}
export class UpdateCommand extends Cmd {}

class CondFail extends Error {
  constructor() { super("The conditional request failed"); this.name = "ConditionalCheckFailedException"; }
}

export class DynamoDBDocumentClient {
  static from() { return new DynamoDBDocumentClient(); }
  async send(cmd) {
    const i = cmd.input;
    if (cmd instanceof GetCommand) {
      const item = store.get(key(i.Key));
      return { Item: item ? structuredClone(item) : undefined };
    }
    if (cmd instanceof PutCommand) {
      const existing = store.get(key(i.Item));
      if (i.ConditionExpression) {
        const v = i.ExpressionAttributeValues ?? {};
        if (i.ConditionExpression === "attribute_not_exists(pk)") {
          if (existing) throw new CondFail();
        } else if (i.ConditionExpression === "attribute_not_exists(pk) OR version = :expected") {
          if (existing && existing.version !== v[":expected"]) throw new CondFail();
        } else throw new Error(`fake ddb: unsupported condition ${i.ConditionExpression}`);
      }
      store.set(key(i.Item), structuredClone(i.Item));
      return {};
    }
    if (cmd instanceof DeleteCommand) { store.delete(key(i.Key)); return {}; }
    if (cmd instanceof QueryCommand) {
      const v = i.ExpressionAttributeValues;
      const pk = v[":pk"];
      const skPrefix = i.KeyConditionExpression.includes("begins_with") ? v[":sk"] : null;
      return {
        Items: [...store.values()]
          .filter((it) => it.pk === pk && (!skPrefix || it.sk.startsWith(skPrefix)))
          .map((it) => structuredClone(it))
      };
    }
    if (cmd instanceof UpdateCommand) {
      const k = key(i.Key);
      const item = store.get(k) ?? { ...i.Key };
      const v = i.ExpressionAttributeValues ?? {};
      const names = i.ExpressionAttributeNames ?? {};
      // split SET clauses on commas not inside if_not_exists(...)
      const parts = [];
      let depth = 0, cur = "";
      for (const ch of i.UpdateExpression.replace(/^SET\s+/, "")) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      for (const part of parts) {
        let [lhs, rhs] = part.split("=").map((s) => s.trim());
        lhs = names[lhs] ?? lhs;
        const m = rhs.match(/^if_not_exists\((\w+|#\w+),\s*(:\w+)\)$/);
        if (m) {
          const attr = names[m[1]] ?? m[1];
          item[lhs] = item[attr] !== undefined ? item[attr] : v[m[2]];
        } else item[lhs] = v[rhs];
      }
      store.set(k, item);
      return {};
    }
    throw new Error("fake ddb: unsupported command");
  }
}
