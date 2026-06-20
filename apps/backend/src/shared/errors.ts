import { z } from 'zod'

/**
 * Creates an error with an HTTP statusCode that Fastify's error handler reads.
 */
export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number }
  err.statusCode = statusCode
  return err
}

/**
 * Validates `data` against a Zod schema.
 * Throws a 400 httpError with readable field messages instead of letting
 * ZodError bubble up (Fastify v5 strips extra properties off errors).
 */
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join(' | ')
    throw httpError(400, msg)
  }
  return result.data
}
