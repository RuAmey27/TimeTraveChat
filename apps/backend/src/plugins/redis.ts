import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import Redis from 'ioredis'
import { config } from '../config'

export default fp(async (app: FastifyInstance) => {
  const redis = new Redis(config.REDIS_URL, {
    // Keep command retry behavior explicit for background reconnect scenarios.
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    enableReadyCheck: false,
  })

  redis.on('error',   (err) => app.log.error({ err }, 'Redis error'))
  redis.on('connect', ()    => app.log.info('Redis connected'))
  redis.on('close',   ()    => app.log.warn('Redis connection closed, will retry'))
  redis.on('reconnecting', () => app.log.warn('Redis reconnecting'))

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    if (redis.status !== 'end') {
      await redis.quit().catch(() => {
        redis.disconnect(false)
      })
    }
  })
})
