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
    const { accountId, customerName, initialBalance } = body

    if (!accountId || !customerName || initialBalance == null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing required fields' })
      }
    }

    if (initialBalance < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Initial balance cannot be negative' })
      }
    }

    // Check if account already exists
    const existing = await docClient.send(
      new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId }
      })
    )

    if (existing.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Account already exists' })
      }
    }

    const account = {
      accountId,
      customerName,
      balance: initialBalance,
      createdAt: new Date().toISOString()
    }

    await docClient.send(
      new PutCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Item: account
      })
    )

    if (initialBalance > 0) {
      await docClient.send(
        new PutCommand({
          TableName: process.env.TRANSACTIONS_TABLE,
          Item: {
            accountId,
            timestamp: Date.now(),
            amount: initialBalance,
            type: 'initial_deposit',
            newBalance: initialBalance
          }
        })
      )
    }

    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Account created successfully', account })
    }
  } catch (error) {
    console.error('Error creating account:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' })
    }
  }
}
