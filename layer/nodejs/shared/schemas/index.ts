import { z } from 'zod'

// ─── Field Schemas (reusable primitives) ────────────────────────────────────

const accountId = z.string().min(1, { message: 'Account ID is required' })

const amount = z.number()
  .positive({ message: 'Amount must be greater than 0' })
  .max(10000000, { message: 'Amount must be less than or equal to 10,000,000' })

const customerName = z.string()
  .min(3, { message: 'Customer name must be at least 3 characters long' })
  .max(100, { message: 'Customer name must be less than or equal to 100 characters long' })

const initialBalance = z.number()
  .min(0, { message: 'Initial balance must be at least 0' })
  .max(10000000, { message: 'Initial balance must be less than or equal to 10,000,000' })

const email = z.string()
  .min(1, { message: 'Email is required' })
  .email({ message: 'Invalid email format' })

const password = z.string()
  .min(1, { message: 'Password is required' })
  .min(8, { message: 'Password must be at least 8 characters' })

const toAccountId = z.string()
  .min(1, { message: 'Destination account ID is required' })

const refreshToken = z.string()
  .min(1, { message: 'Refresh token is required' })

// ─── Path Params Schemas ───────────────────────────────────────

export const accountIdSchema  = z.object({
  accountId
})

// ─── Body Schemas (request bodies) ──────────────────────────────────────────

export const depositSchema = z.object({
  amount
})

export const createAccountSchema = z.object({
  accountId,
  customerName,
  initialBalance
})

export const loginSchema = z.object({ email, password })

export const registerSchema = z.object({ email, password })

export const transferSchema = z.object({ toAccountId, amount })

export const withdrawSchema = z.object({ amount })

export const refreshTokenSchema = z.object({ refreshToken })

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type AccountIdPathParam = z.infer<typeof accountIdSchema >
export type DepositBody = z.infer<typeof depositSchema>
export type CreateAccountBody = z.infer<typeof createAccountSchema>
export type LoginBody = z.infer<typeof loginSchema>
export type RegisterBody = z.infer<typeof registerSchema>
export type TransferBody = z.infer<typeof transferSchema>
export type WithdrawBody = z.infer<typeof withdrawSchema>
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>