import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '1h'

export function generateAccessToken(userId, role) {
    return jwt.sign(
        { userId, role },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    )
}

export function generateRefreshToken(userId) {
    return jwt.sign(
        { userId, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    )
}

export function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET)
}

export function decodeToken(token) {
    return jwt.decode(token)
}
