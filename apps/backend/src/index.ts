import Fastify, { FastifyRequest, FastifyReply, FastifyError } from 'fastify'
import cors from '@fastify/cors'
import jwt  from '@fastify/jwt'
import { config } from './config'

// Plugins
import prismaPlugin from './plugins/prisma'
import redisPlugin  from './plugins/redis'
import kafkaPlugin  from './plugins/kafka'
import socketPlugin from './websocket/socket'

// Routes
import { authRoutes }    from './auth/auth.routes'
import { chatRoutes }    from './chats/chat.routes'
import { messageRoutes } from './messages/message.routes'
import { branchRoutes }  from './branches/branch.routes'
import { userRoutes }    from './users/user.routes'

const app = Fastify({
  logger: {
    transport: config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

async function start() {
  // ── Core plugins ────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*'
      ? true
      : config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  })
  await app.register(jwt,  { secret: config.JWT_SECRET })

  // ── Infrastructure plugins ───────────────────────────────────────────────────
  await app.register(prismaPlugin)
  await app.register(redisPlugin)
  await app.register(kafkaPlugin)
  await app.register(socketPlugin)

  // ── JWT auth decorator (used as onRequest hook on protected routes) ──────────
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.send(err)
    }
  })

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(authRoutes,    { prefix: '/api' })
  await app.register(chatRoutes,    { prefix: '/api/chats' })
  await app.register(messageRoutes, { prefix: '/api/chats' })
  await app.register(branchRoutes,  { prefix: '/api/chats' })
  await app.register(userRoutes,    { prefix: '/api/users' })

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Global error handler ─────────────────────────────────────────────────────
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      const code = error.statusCode ?? 500
      if (code >= 500) app.log.error(error)
      return reply.code(code).send({
        error: error.message ?? 'Internal Server Error',
        ...(config.NODE_ENV === 'development' && code >= 500 && { stack: error.stack }),
      })
    }
  )

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
