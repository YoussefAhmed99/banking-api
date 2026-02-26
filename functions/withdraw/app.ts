import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { AppError, ValidationError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'
import { verifyAccessToken, checkAccountOwnership } from '/opt/nodejs/shared/auth/auth.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import middy from '/opt/nodejs/node_modules/@middy/core/index.js'
import { validationMiddleware } from '/opt/nodejs/shared/middleware/validation.js'
import { withdrawSchema, accountIdSchema, WithdrawBody, AccountIdPathParam } from '/opt/nodejs/shared/schemas/index.js'

type WithdrawEvent = APIGatewayProxyEvent & {
  validatedBody: WithdrawBody
  validatedParams: AccountIdPathParam
}

const baseHandler = async (event: WithdrawEvent): Promise<APIGatewayProxyResult> => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded

    const { accountId } = event.validatedParams
    const { amount } = event.validatedBody

    logger.info('Processing withdrawal', { accountId, amount, userId })

    // Verify ownership and get account
    const account = await checkAccountOwnership(accountId, userId, docClient)

    // Update the balance
    const newBalance = account.balance - amount

    if (newBalance < 0) {
      throw new ValidationError('Insufficient funds')
    }

    await docClient.send(
      new PutCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Item: {
          ...account,
          balance: newBalance
        }
      })
    )

    await docClient.send(
      new PutCommand({
        TableName: process.env.TRANSACTIONS_TABLE,
        Item: {
          accountId,
          timestamp: Date.now(),
          amount: amount * -1,
          type: 'withdrawal',
          newBalance
        }
      })
    )

    logger.info('Withdrawal successful', { accountId, amount, newBalance })
    return success({ message: 'Withdrawal successful', newBalance })
  } catch (err) {
    if (err instanceof AppError) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    if (err instanceof Error) {
      logger.error('Unexpected error', err);
      return error('Internal server error', 500);
    }

    logger.error('Unexpected error processing withdrawal', err, { accountId: event.pathParameters?.accountId })
    return error('Internal server error', 500)
  }
}

export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: withdrawSchema,
    pathParameters: accountIdSchema
  })
)
