import { ValidationError } from '/opt/nodejs/shared/errors/AppError.js'

interface ValidateAmountOptions {
    allowZero?: boolean;
    allowNegative?: boolean;
    fieldName?: string;
}

export function validateEmail(email: string) {
    if (!email) {
        throw new ValidationError('Email is required')
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email format')
    }
}

export function validatePassword(password: string) {
    if (!password) {
        throw new ValidationError('Password is required')
    }
    if (password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters')
    }
}

export function validateAmount(amount: number, options: ValidateAmountOptions = {}) {
    const {
        allowZero = false,
        allowNegative = false,
        fieldName = 'Amount'
    } = options;

    if (!allowNegative && amount < 0) {
        throw new ValidationError(`${fieldName} cannot be negative`);
    }

    if (!allowZero && amount === 0) {
        throw new ValidationError(`${fieldName} must be greater than zero`);
    }
}


export function validateAccountId(accountId: string) {
    if (!accountId) {
        throw new ValidationError('Account ID is required')
    }
}
