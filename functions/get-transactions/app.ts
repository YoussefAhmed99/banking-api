import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
      if((err instanceof AppError)) {
        logger.info('Operational error', { error: err.message })
        return error(err.message, err.statusCode)
     }
      if (err instanceof Error) {
        logger.error('Unexpected error', err);
        return error('Internal server error', 500);
      }

    logger.error('Unexpected error getting transactions', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}
