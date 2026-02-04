import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, ConflictError, ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { validateEmail, validatePassword } from '/opt/nodejs/shared/utils/validators.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { hashPassword } from '/opt/nodejs/shared/auth/password.js'
import crypto from 'crypto'
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

    logger.info('Registering user', { email })

    // Check if email already exists using GSI
    const existing = await docClient.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email.toLowerCase()
        }
      })
    )

    if (existing.Items && existing.Items.length > 0) {
      throw new ConflictError('Email already registered')
    }

    const userId = crypto.randomUUID()
    const passwordHash = await hashPassword(password)

    const user = {
      userId,
      email: email.toLowerCase(),
      passwordHash,
      role: 'customer',
      createdAt: new Date().toISOString()
    }

    await docClient.send(
      new PutCommand({
        TableName: process.env.USERS_TABLE,
        Item: user
      })
    )

    logger.info('User registered successfully', { userId, email })
    return success({ message: 'User registered successfully', userId }, 201)
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error registering user', err)
    return error('Internal server error', 500)
  }
}
