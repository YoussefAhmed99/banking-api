import { GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../../shared/db/client.js'
import { UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js'
import { success, error } from '../../shared/utils/responses.js'
import { logger } from '../../shared/logger/index.js'
import { verifyToken, generateAccessToken } from '../../shared/auth/jwt.js'

export const handler = async event => {
  try {
    const body = JSON.parse(event.body)
    const { refreshToken } = body

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required')
    }

    logger.info('Refresh token request')

    // Verify the token signature and check it's a refresh token
    let decoded
    try {
      decoded = verifyToken(refreshToken)
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Refresh token has expired')
      }
      throw new UnauthorizedError('Invalid refresh token')
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type')
    }

    // Check if token exists in database (not revoked)
    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.REFRESH_TOKENS_TABLE,
        Key: { token: refreshToken }
      })
    )

    if (!result.Item) {
      throw new UnauthorizedError('Refresh token has been revoked')
    }

    // Check if token has expired (TTL check)
    const now = Math.floor(Date.now() / 1000)
    if (result.Item.expiresAt < now) {
      // Clean up expired token
      await docClient.send(
        new DeleteCommand({
          TableName: process.env.REFRESH_TOKENS_TABLE,
          Key: { token: refreshToken }
        })
      )
      throw new UnauthorizedError('Refresh token has expired')
    }

    // Get user role from users table
    const userResult = await docClient.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId: decoded.userId }
      })
    )

    const role = userResult.Item?.role || 'customer'

    // Generate new access token
    const accessToken = generateAccessToken(decoded.userId, role)

    logger.info('Token refreshed successfully', { userId: decoded.userId })
    return success({
      accessToken,
      expiresIn: 900
    })
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error during token refresh', err)
    return error('Internal server error', 500)
  }
}
