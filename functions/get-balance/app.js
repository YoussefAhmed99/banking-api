import { docClient } from '/opt/nodejs/shared/db/client.js'
import { ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'

export const handler = async event => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded
    const accountId = event.pathParameters?.accountId

    if (!accountId) {
      throw new ValidationError('Account ID is required')
    }

    logger.info('Getting balance', { accountId, userId })

    // Verify ownership and get account
    const account = await checkAccountOwnership(accountId, userId, docClient)

    logger.info('Balance retrieved', { accountId, balance: account.balance })
    return success({
      accountId: account.accountId,
      balance: account.balance
    })
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error getting balance', err)
    return error('Internal server error', 500)
  }
}
