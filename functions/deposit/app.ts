import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'
import middy from '/opt/nodejs/node_modules/@middy/core/index.js'
import { validationMiddleware } from '/opt/nodejs/shared/middleware/validation.js'
import { depositSchema } from '/opt/nodejs/shared/schemas/index.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const baseHandler = async (event: APIGatewayProxyEvent & { validatedBody?: any }): Promise<APIGatewayProxyResult> => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded
    const accountId = event.pathParameters?.accountId
    const { amount } = event.validatedBody

    if (!accountId) {
      return error('Account ID is required', 400)
    }

    logger.info('Processing deposit', { accountId, amount, userId })

    const account = await checkAccountOwnership(accountId, userId, docClient)
    const newBalance = account.balance + amount

    await docClient.send(
      new PutCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Item: {
          ...account,
          balance: newBalance
        }
      })
    )

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

    logger.info('Deposit successful', { accountId, amount, newBalance })
    return success({ message: 'Deposit successful', newBalance })
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err)
      return error('Internal server error', 500)
    }

    logger.error('Unexpected error processing deposit', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}

export const handler = middy(baseHandler).use(validationMiddleware(depositSchema))