import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createChat, joinChat, getChatState, getMyChats, inviteMember } from './chat.service'
import { parseBody } from '../shared/errors'

const createChatSchema = z.object({ name: z.string().min(1).max(100) })

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // GET /api/chats  — list chats the current user belongs to
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const chats = await getMyChats(app, request.user.id)
    return reply.send(chats)
  })

  // POST /api/chats
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = parseBody(createChatSchema, request.body)
    const result   = await createChat(app, name, request.user.id)
    return reply.code(201).send(result)
  })

  // GET /api/chats/:id
  app.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const chat = await app.prisma.chat.findUnique({
        where:   { id: request.params.id },
        include: {
          branches: { orderBy: { createdAt: 'asc' } },
          members:  { include: { user: { select: { id: true, username: true } } } },
        },
      })
      if (!chat) return reply.code(404).send({ error: 'Chat not found' })
      return reply.send(chat)
    }
  )

  // POST /api/chats/:id/members  — invite a user by @username
  app.post(
    '/:id/members',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { username } = parseBody(z.object({ username: z.string().min(1) }), request.body)
      const result = await inviteMember(app, request.params.id, request.user.id, username)
      return reply.code(201).send(result)
    }
  )

  // POST /api/chats/:id/join
  app.post(
    '/:id/join',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await joinChat(app, request.params.id, request.user.id, request.user.username)
      return reply.send(result)
    }
  )

  // GET /api/chats/:id/state?branchId=<uuid>&at=<ISO8601>
  app.get(
    '/:id/state',
    async (
      request: FastifyRequest<{
        Params:      { id: string }
        Querystring: { branchId?: string; at?: string }
      }>,
      reply: FastifyReply
    ) => {
      const { at } = request.query
      let { branchId } = request.query

      if (!branchId) {
        const main = await app.prisma.branch.findFirst({
          where: { chatId: request.params.id, parentBranchId: null },
        })
        if (!main) return reply.code(404).send({ error: 'No branches found' })
        branchId = main.id
      }

      const state = await getChatState(app, request.params.id, branchId!, at)
      return reply.send(state)
    }
  )

  // GET /api/chats/:id/events?branchId=<uuid>
  app.get(
    '/:id/events',
    async (
      request: FastifyRequest<{
        Params:      { id: string }
        Querystring: { branchId?: string }
      }>,
      reply: FastifyReply
    ) => {
      let { branchId } = request.query

      if (!branchId) {
        const main = await app.prisma.branch.findFirst({
          where: { chatId: request.params.id, parentBranchId: null },
        })
        if (!main) return reply.code(404).send({ error: 'No branches found' })
        branchId = main.id
      }

      const events = await app.prisma.event.findMany({
        where:   { chatId: request.params.id, branchId },
        orderBy: { version: 'asc' },
      })

      return reply.send(events.map((e: { version: bigint; [k: string]: unknown }) => ({ ...e, version: Number(e.version) })))
    }
  )
}
