import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '/opt/nodejs/shared/db/client.js'
import { NotFoundError } from '/opt/nodejs/shared/errors/AppError.js'
import { success, error } from '/opt/nodejs/shared/utils/responses.js'
import { logger } from '/opt/nodejs/shared/logger/index.js'

export const handler = async event => {
  try {
    const { accountId } = event.pathParameters;

    logger.info('Getting account', { accountId });

    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId }
      })
    );

    if (!result.Item) {
      throw new NotFoundError('Account not found');
    }

    logger.info('Account retrieved successfully', { accountId });
    return success(result.Item);
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message });
      return error(err.message, err.statusCode);
    }

    logger.error('Unexpected error getting account', err, { accountId: event.pathParameters?.accountId });
    return error('Internal server error', 500);
  }
}
