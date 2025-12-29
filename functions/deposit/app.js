import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand
} from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
  ...(process.env.AWS_SAM_LOCAL === 'true' && {
    endpoint: 'http://172.18.0.2:8000'
  })
})
const docClient = DynamoDBDocumentClient.from(client)

export const handler = async event => {
  try {
    const body = JSON.parse(event.body)
    const { accountId } = event.pathParameters
    const { amount } = body

    if (amount == null || amount <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid amount' })
      }
    }

    // Fetch the account
    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId }
      })
    )

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Account not found' })
      }
    }

    // Update the balance
    const newBalance = result.Item.balance + amount

    await docClient.send(
      new PutCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Item: {
          ...result.Item,
          balance: newBalance
        }
      })
    )

    // After updating account, before return:
    await docClient.send(
      new PutCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        Item: {
          accountId,
          timestamp: Date.now(),
          amount,
          type: 'deposit',
          newBalance
        }
      })
    )

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Deposit successful', newBalance })
    }
  } catch (error) {
    console.error('Error processing deposit:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    }
  }
}
