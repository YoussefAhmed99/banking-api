import { ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken } from '/opt/nodejs/shared/auth/auth.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AppError } from '/opt/nodejs/shared/errors/AppError.js'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded

    logger.info('Logout request', { userId })

    // Find all refresh tokens for this user
    const result = await docClient.send(
      new ScanCommand({
        TableName: process.env.REFRESH_TOKENS_TABLE,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      })
    )

    // Delete all refresh tokens for this user
    if (result.Items && result.Items.length > 0) {
      const deletePromises = result.Items.map(item =>
        docClient.send(
          new DeleteCommand({
            TableName: process.env.REFRESH_TOKENS_TABLE,
            Key: { token: item.token }
          })
        )
      )
      await Promise.all(deletePromises)
    }

    logger.info('Logout successful', { userId, tokensRevoked: result.Items?.length || 0 })
    return success({ message: 'Logged out successfully' })
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error during logout', err)
    return error('Internal server error', 500)
  }
}
