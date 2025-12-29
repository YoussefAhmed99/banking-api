import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
  ...(process.env.AWS_SAM_LOCAL === 'true' && {
    endpoint: 'http://172.18.0.2:8000'
  })
})
const docClient = DynamoDBDocumentClient.from(client)

export const handler = async event => {
  try {
    const { accountId } = event.pathParameters

    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        KeyConditionExpression: 'accountId = :accountId',
        ExpressionAttributeValues: {
          ':accountId': accountId
        },
        ScanIndexForward: false  // Sort by timestamp DESC (newest first)
      })
    )

    return {
      statusCode: 200,
      body: JSON.stringify({
        transactions: result.Items || [],
        count: result.Count
      })
    }
  } catch (error) {
    console.error('Error getting transactions:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    }
  }
}