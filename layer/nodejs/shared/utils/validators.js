import { ValidationError } from '/opt/nodejs/shared/errors/AppError.js'

export function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        throw new ValidationError('Email is required')
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email format')
    }
}

export function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        throw new ValidationError('Password is required')
    }
    if (password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters')
    }
}

export function validateAmount(amount, options = {}) {
    const {
        allowZero = false,
        allowNegative = false,
        fieldName = 'Amount'
    } = options;

    if (typeof amount !== 'number') {
        throw new ValidationError(`${fieldName} must be a number`);
    }

    if (!allowNegative && amount < 0) {
        throw new ValidationError(`${fieldName} cannot be negative`);
    }

    if (!allowZero && amount === 0) {
        throw new ValidationError(`${fieldName} must be greater than zero`);
    }

    if (!allowZero && !allowNegative && amount <= 0) {
        throw new ValidationError(`${fieldName} must be a positive number`);
    }
}


export function validateAccountId(accountId) {
    if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
        throw new ValidationError('Account ID is required')
    }
}
