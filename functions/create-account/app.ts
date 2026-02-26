import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, ConflictError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken } from '/opt/nodejs/shared/auth/auth.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createAccountSchema, CreateAccountBody } from '/opt/nodejs/shared/schemas/index.js'
import middy from '/opt/nodejs/node_modules/@middy/core/index.js'
import { validationMiddleware } from '/opt/nodejs/shared/middleware/validation.js'

type createAccountEvent = APIGatewayProxyEvent & {
  validatedBody: CreateAccountBody
}

const baseHandler = async (event: createAccountEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Verify JWT and extract userId
    const decoded = verifyAccessToken(event)
    const { userId } = decoded

    const { accountId, customerName, initialBalance } = event.validatedBody

    logger.info('Creating account', { accountId, customerName, initialBalance, userId })

    // Check if account already exists
    const existing = await docClient.send(
      new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId }
      })
    )

    if (existing.Item) {
      throw new ConflictError('Account already exists')
    }

    const account = {
      accountId,
      userId,
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

    logger.info('Account created successfully', { accountId })
    return success({ message: 'Account created successfully', account }, 201)
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if(err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error creating account', err)
    return error('Internal server error', 500)
  }
}

export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: createAccountSchema,
  })
)