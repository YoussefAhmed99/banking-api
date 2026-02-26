import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import middy from '/opt/nodejs/node_modules/@middy/core/index.js'
import { validationMiddleware } from '/opt/nodejs/shared/middleware/validation.js'
import { accountIdSchema, AccountIdPathParam } from '/opt/nodejs/shared/schemas/index.js'

type GetAccountEvent = APIGatewayProxyEvent & {
  validatedParams: AccountIdPathParam
}

const baseHandler = async (event: GetAccountEvent): Promise<APIGatewayProxyResult> => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded
    const { accountId } = event.validatedParams

    logger.info('Getting account', { accountId, userId })

    // Verify ownership and get account
    const account = await checkAccountOwnership(accountId, userId, docClient)

    logger.info('Account retrieved successfully', { accountId })
    return success(account)
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error getting account', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}

export const handler = middy(baseHandler).use(
  validationMiddleware({
    pathParameters: accountIdSchema
  })
)
