import { APIGatewayProxyEvent } from 'aws-lambda'
import { verifyToken, TokenPayload } from './jwt.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js'

export function extractTokenFromHeader(event: APIGatewayProxyEvent ) : string {
    const authHeader = event.headers?.Authorization || event.headers?.authorization
    if (!authHeader) {
        throw new UnauthorizedError('Missing Authorization header')
    }

    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new UnauthorizedError('Invalid Authorization header format')
    }

    return parts[1]
}

export function verifyAccessToken(event: APIGatewayProxyEvent): TokenPayload {
    const token = extractTokenFromHeader(event)

    try {
        const decoded = verifyToken(token)

        if (decoded.type === 'refresh') {
            throw new UnauthorizedError('Cannot use refresh token for API access')
        }

        return decoded
    } catch (err) {
        if(err instanceof Error) {
            if (err.name === 'TokenExpiredError') {
                throw new UnauthorizedError('Token has expired')
            }
            if (err.name === 'JsonWebTokenError') {
                throw new UnauthorizedError('Invalid token')
            }
        }
        throw err
    }
}

export async function checkAccountOwnership(accountId: string, userId: string, docClient: any) {
    const result = await docClient.send(new GetCommand({
        TableName: process.env.ACCOUNTS_TABLE,
        Key: { accountId }
    }))

    if (!result.Item) {
        throw new ForbiddenError('Account not found or access denied')
    }

    if (result.Item.userId !== userId) {
        throw new ForbiddenError('You do not have access to this account')
    }

    return result.Item
}
