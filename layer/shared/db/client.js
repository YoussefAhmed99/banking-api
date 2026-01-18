import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
    ...(process.env.AWS_SAM_LOCAL === 'true' && {
        endpoint: 'http://172.18.0.2:8000'
    })
})

export const docClient = DynamoDBDocumentClient.from(client)