import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { NotFoundError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateAmount } from '/opt/nodejs/shared/utils/validators.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'

export const handler = async event => {
  try {
    const body = JSON.parse(event.body)
    const { accountId } = event.pathParameters
    const { amount } = body

    validateAmount(amount)

    logger.info('Processing deposit', { accountId, amount })

    // Fetch the account
    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId }
      })
    )

    if (!result.Item) {
      throw new NotFoundError('Account not found')
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
