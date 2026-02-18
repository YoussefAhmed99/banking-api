import { z, ZodError } from 'zod'
import { error } from '../utils/responses.js'

export function validationMiddleware(schema: z.ZodSchema) {
  return {
    before: (request: any) => {
      try {
        const body = JSON.parse(request.event.body || '{}')
        const validated = schema.parse(body)
        request.event.validatedBody = validated
      } catch (err) {
        if (err instanceof ZodError) {
          const message = err.issues[0].message
          request.response = error(message, 400)
          return request.response
        }

        if (err instanceof SyntaxError) {
          request.response = error('Invalid JSON in request body', 400)
          return request.response
        }

        throw err
      }
    }
  }
}