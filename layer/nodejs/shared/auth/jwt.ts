import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '1h'

export interface TokenPayload {
    userId: string
    role?: string
    type?: 'refresh'
}

export function generateAccessToken(userId: string, role: string) {
    return jwt.sign(
        { userId, role },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    )
}

export function generateRefreshToken(userId: string) {
    return jwt.sign(
        { userId, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    )
}

export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
}

export function decodeToken(token: string) {
    return jwt.decode(token)
}
