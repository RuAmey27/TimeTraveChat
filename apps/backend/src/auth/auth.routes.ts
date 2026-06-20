import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { registerSchema, loginSchema } from './auth.schema'
import { register, login } from './auth.service'
import { parseBody } from '../shared/errors'

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post('/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(registerSchema, request.body)
    const result = await register(app, body)
    return reply.code(201).send(result)
  })

  // POST /api/auth/login
  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(loginSchema, request.body)
    const result = await login(app, body)
    return reply.send(result)
  })

  // GET /api/auth/me  (protected)
  app.get(
    '/auth/me',
    { onRequest: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await app.prisma.user.findUnique({
        where:  { id: request.user.id },
        select: { id: true, username: true, email: true, createdAt: true },
      })
      if (!user) return reply.code(404).send({ error: 'User not found' })
      return reply.send(user)
    }
  )
}
