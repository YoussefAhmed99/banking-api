import { z, ZodError } from 'zod'
import { error } from '../utils/responses.js'

type ValidationConfig = {
  body?: z.ZodSchema
  pathParameters?: z.ZodSchema
  queryStringParameters?: z.ZodSchema
}

export function validationMiddleware(config: ValidationConfig) {
  return {
    before: async (request: any) => {
      try {
        if (config.body) {
          const body = JSON.parse(request.event.body || '{}')
          request.event.validatedBody = config.body.parse(body)
        }

        if (config.pathParameters) {
          const params = request.event.pathParameters || {}
          request.event.validatedParams = config.pathParameters.parse(params)
        }

        if (config.queryStringParameters) {
          const query = request.event.queryStringParameters || {}
          request.event.validatedQuery = config.queryStringParameters.parse(query)
        }

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