import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import Redis from 'ioredis'
import { config } from '../config'

export default fp(async (app: FastifyInstance) => {
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true })

  redis.on('error',   (err) => app.log.error({ err }, 'Redis error'))
  redis.on('connect', ()    => app.log.info('Redis connected'))

  await redis.connect()

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
  })
})
