import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { ConflictError, ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateAccountId, validateAmount } from '/opt/nodejs/shared/utils/validators.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken } from '/opt/nodejs/shared/auth/auth.js'

export const handler = async event => {
  try {
    // Verify JWT and extract userId
    const decoded = verifyAccessToken(event)
    const { userId } = decoded

    const body = JSON.parse(event.body)
    const { accountId, customerName, initialBalance } = body

    // Validate inputs
    validateAccountId(accountId)

    if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') {
      throw new ValidationError('Customer name is required')
    }

    validateAmount(initialBalance, { allowZero: true, fieldName: 'Initial balance' })

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
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error creating account', err)
    return error('Internal server error', 500)
  }
}
