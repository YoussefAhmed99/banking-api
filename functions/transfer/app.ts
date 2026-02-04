import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, ValidationError, NotFoundError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateAmount, validateAccountId } from '/opt/nodejs/shared/utils/validators.js'
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
    const { toAccountId, amount } = body

    if (!accountId) {
      throw new ValidationError('Account ID is required')
    }

    validateAccountId(toAccountId)
    validateAmount(amount)

    if (accountId === toAccountId) {
      throw new ValidationError('Cannot transfer to the same account')
    }

    logger.info('Processing transfer', { fromAccountId: accountId, toAccountId, amount, userId })

    // Verify ownership of source account
    const sourceAccount = await checkAccountOwnership(accountId, userId, docClient)

    // Verify destination account exists (no ownership check - anyone can receive)
    const destResult = await docClient.send(
      new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId: toAccountId }
      })
    )

    if (!destResult.Item) {
      throw new NotFoundError('Destination account not found')
    }

    const destAccount = destResult.Item

    // Check sufficient funds
    const sourceNewBalance = sourceAccount.balance - amount
    if (sourceNewBalance < 0) {
      throw new ValidationError('Insufficient funds')
    }

    const destNewBalance = destAccount.balance + amount
    const timestamp = Date.now()

    // Update source account
    await docClient.send(
      new PutCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Item: {
          ...sourceAccount,
          balance: sourceNewBalance
        }
      })
    )

    // Update destination account
    await docClient.send(
      new PutCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Item: {
          ...destAccount,
          balance: destNewBalance
        }
      })
    )

    // Record source transaction (outgoing)
    await docClient.send(
      new PutCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        Item: {
          accountId,
          timestamp,
          amount: amount * -1,
          type: 'transfer_out',
          toAccountId,
          newBalance: sourceNewBalance
        }
      })
    )

    // Record destination transaction (incoming)
    await docClient.send(
      new PutCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        Item: {
          accountId: toAccountId,
          timestamp,
          amount,
          type: 'transfer_in',
          fromAccountId: accountId,
          newBalance: destNewBalance
        }
      })
    )

    logger.info('Transfer successful', { fromAccountId: accountId, toAccountId, amount, sourceNewBalance })
    return success({
      message: 'Transfer successful',
      newBalance: sourceNewBalance
    })
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error processing transfer', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}
