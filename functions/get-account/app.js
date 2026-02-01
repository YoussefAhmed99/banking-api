import { docClient } from '../../shared/db/client.js'
import { ValidationError } from '../../shared/errors/AppError.js'
import { success, error } from '../../shared/utils/responses.js'
import { logger } from '../../shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '../../shared/auth/auth.js'

export const handler = async event => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded
    const accountId = event.pathParameters?.accountId

    if (!accountId) {
      throw new ValidationError('Account ID is required')
    }

    logger.info('Getting account', { accountId, userId })

    // Verify ownership and get account
    const account = await checkAccountOwnership(accountId, userId, docClient)

    logger.info('Account retrieved successfully', { accountId })
    return success(account)
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error getting account', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}
