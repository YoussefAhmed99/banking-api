import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateAmount } from '/opt/nodejs/shared/utils/validators.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded
    if (!event.body) {
      throw new ValidationError('Request body is required')
    }
    const body = JSON.parse(event.body)
    const accountId = event.pathParameters?.accountId
    const { amount } = body

    if (!accountId) {
      throw new ValidationError('Account ID is required')
    }

    validateAmount(amount)

    logger.info('Processing deposit', { accountId, amount, userId })

    // Verify ownership and get account
    const account = await checkAccountOwnership(accountId, userId, docClient)

    // Update the balance
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
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error processing deposit', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}