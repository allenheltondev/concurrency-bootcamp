/* Just enough of @aws-sdk/client-dynamodb for the code under test: the
   client is only ever constructed and handed to the document client. */
export class DynamoDBClient {
  constructor() {}
}
