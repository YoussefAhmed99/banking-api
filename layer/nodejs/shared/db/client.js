import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient(
    process.env.IS_OFFLINE
        ? { endpoint: 'http://localhost:8000', region: 'us-east-1' }
        : {}
);

export const docClient = DynamoDBDocumentClient.from(client)