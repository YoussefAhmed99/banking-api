import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../../shared/db/client.js'
import { ValidationError } from '../../shared/errors/AppError.js'
import { validateAmount } from '../../shared/utils/validators.js'
import { success, error } from '../../shared/utils/responses.js'
import { logger } from '../../shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '../../shared/auth/auth.js'

export const handler = async event => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded

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
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error processing deposit', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}