import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../../shared/db/client.js'
import { success, error } from '../../shared/utils/responses.js'
import { logger } from '../../shared/logger/index.js'
import { verifyAccessToken } from '../../shared/auth/auth.js'

export const handler = async event => {
  try {
    const decoded = verifyAccessToken(event)
    const { userId } = decoded

    logger.info('Listing accounts', { userId })

    // Query accounts by userId using GSI
    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      })
    )

    const accounts = result.Items || []

    logger.info('Accounts retrieved', { userId, count: accounts.length })
    return success({
      accounts: accounts.map(account => ({
        accountId: account.accountId,
        customerName: account.customerName,
        balance: account.balance,
        createdAt: account.createdAt
      }))
    })
  } catch (err) {
    if (err.isOperational) {
      logger.info('Operational error', { error: err.message })
      return error(err.message, err.statusCode)
    }

    logger.error('Unexpected error listing accounts', err)
    return error('Internal server error', 500)
  }
}
