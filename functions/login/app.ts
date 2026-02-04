import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, UnauthorizedError, ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateEmail, validatePassword } from '/opt/nodejs/shared/utils/validators.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { comparePassword } from '/opt/nodejs/shared/auth/password.js'
import { generateAccessToken, generateRefreshToken } from '/opt/nodejs/shared/auth/jwt.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {

    if (!event.body) {
      throw new ValidationError('Request body is required')
    }

    const body = JSON.parse(event.body)
    const { email, password } = body

    validateEmail(email)
    validatePassword(password)

    logger.info('Login attempt', { email })

    // Find user by email using GSI
    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email.toLowerCase()
        }
      })
    )

    if (!result.Items || result.Items.length === 0) {
      throw new UnauthorizedError('Invalid email or password')
    }

    const user = result.Items[0]

    const passwordValid = await comparePassword(password, user.passwordHash)
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid email or password')
    }

    const accessToken = generateAccessToken(user.userId, user.role)
    const refreshToken = generateRefreshToken(user.userId)

    // Store refresh token
    const refreshTokenExpiry = Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    await docClient.send(
      new PutCommand({
        TableName: process.env.REFRESH_TOKENS_TABLE,
        Item: {
          token: refreshToken,
          userId: user.userId,
          createdAt: new Date().toISOString(),
          expiresAt: refreshTokenExpiry
        }
      })
    )

    logger.info('Login successful', { userId: user.userId })
    return success({
      accessToken,
      refreshToken,
      expiresIn: 900
    })
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error during login', err)
    return error('Internal server error', 500)
  }
}
