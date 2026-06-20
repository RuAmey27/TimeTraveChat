import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  /**
   * GET /api/users/search?q=<term>
   * Searches username (starts-with, case-insensitive) and exact phone match.
   * Returns max 20 results. Never returns passwordHash.
   */
  app.get(
    '/search',
    async (
      request: FastifyRequest<{ Querystring: { q?: string } }>,
      reply: FastifyReply
    ) => {
      const q = (request.query.q ?? '').trim()
      if (!q) return reply.send([])

      const users = await app.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { phone:    { equals:   q } },             // exact phone (E.164)
          ],
          // Don't return yourself
          NOT: { id: request.user.id },
        },
        select: { id: true, username: true, phone: true, createdAt: true },
        take: 20,
        orderBy: { username: 'asc' },
      })

      return reply.send(users)
    }
  )

  /**
   * GET /api/users/:id
   * Public profile — no sensitive fields.
   */
  app.get(
    '/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await app.prisma.user.findUnique({
        where:  { id: request.params.id },
        select: { id: true, username: true, createdAt: true },
      })
      if (!user) return reply.code(404).send({ error: 'User not found' })
      return reply.send(user)
    }
  )
}
