import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateAmount } from '/opt/nodejs/shared/utils/validators.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'

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

    logger.info('Processing withdrawal', { accountId, amount, userId })

    // Verify ownership and get account
    const account = await checkAccountOwnership(accountId, userId, docClient)

    // Update the balance
    const newBalance = account.balance - amount

    if (newBalance < 0) {
      throw new ValidationError('Insufficient funds')
    }

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
          amount: amount * -1,
          type: 'withdrawal',
          newBalance
        }
      })
    )

    logger.info('Withdrawal successful', { accountId, amount, newBalance })
    return success({ message: 'Withdrawal successful', newBalance })
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error processing withdrawal', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}