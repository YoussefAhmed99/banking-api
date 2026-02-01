import { QueryCommand } from '@aws-sdk/lib-dynamodb'
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

    logger.info('Getting transactions', { accountId, userId })

    // Verify ownership
    await checkAccountOwnership(accountId, userId, docClient)

    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        KeyConditionExpression: 'accountId = :accountId',
        ExpressionAttributeValues: {
          ':accountId': accountId
        },
        ScanIndexForward: false  // Sort by timestamp DESC (newest first)
      })
    )

    logger.info('Transactions retrieved successfully', { accountId, count: result.Count })
    return success({
      transactions: result.Items || [],
      count: result.Count
    })
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error getting transactions', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}
