import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL:   z.string().min(1),
  REDIS_URL:      z.string().min(1),
  KAFKA_BROKERS:  z.string().min(1),
  KAFKA_USERNAME: z.string().optional(),
  KAFKA_PASSWORD: z.string().optional(),
  JWT_SECRET:     z.string().min(16),
  PORT:           z.coerce.number().default(4000),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  // Comma-separated allowed origins e.g. https://myapp.vercel.app
  // Use * to allow all (development default)
  CORS_ORIGIN:    z.string().default('*'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
