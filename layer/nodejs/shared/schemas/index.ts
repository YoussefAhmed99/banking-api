import { z } from 'zod'

export const depositSchema = z.object({
  amount: z
    .number()
    .refine(val => val > 0, { message: 'Amount must be greater than zero' })
})

export const withdrawSchema = z.object({
  amount: z
    .number()
    .refine(val => val > 0, { message: 'Amount must be greater than zero' })
})

export const transferSchema = z.object({
  toAccountId: z.string().min(1, 'Destination account ID is required'),
  amount: z
    .number()
    .refine(val => val > 0, { message: 'Amount must be greater than zero' })
})

export const createAccountSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  initialBalance: z
    .number()
    .refine(val => val >= 0, { message: 'Initial balance cannot be negative' })
})