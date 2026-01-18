import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'

export const handler = async event => {
  try {
    const { accountId } = event.pathParameters

    logger.info('Getting transactions', { accountId })

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