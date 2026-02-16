import { z, ZodError  } from 'zod'
import { error } from '../utils/responses.js'

export function withValidation(schema: z.ZodSchema, handler: Function) {
  return async (event: any) => {
    try {
      const body = JSON.parse(event.body || '{}')
      const validated = schema.parse(body)
      
      event.validatedBody = validated
      
      return await handler(event)
    } catch (err) {
        if (err instanceof ZodError) {
            const details = err.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
            }))
            
            return error('Validation failed', 400, { details })
        }
        
        throw err
    }
  }
}