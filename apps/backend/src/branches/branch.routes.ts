import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createBranch, listBranches, compareBranches } from './branch.service'
import { parseBody } from '../shared/errors'

const createBranchSchema = z.object({
  parentBranchId: z.string().uuid(),
  fromMessageId:  z.string().uuid().nullable().optional(),
  name:           z.string().min(1).max(100),
})

export async function branchRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // GET /api/chats/compare?a=<branchId>&b=<branchId>
  // Registered BEFORE /:chatId routes so Fastify's static path wins
  app.get(
    '/compare',
    async (
      request: FastifyRequest<{ Querystring: { a: string; b: string } }>,
      reply: FastifyReply
    ) => {
      const { a, b } = request.query
      if (!a || !b) return reply.code(400).send({ error: 'Query params "a" and "b" (branch IDs) are required' })
      const result = await compareBranches(app, a, b)
      return reply.send(result)
    }
  )

  // GET /api/chats/:chatId/branches
  app.get(
    '/:chatId/branches',
    async (request: FastifyRequest<{ Params: { chatId: string } }>, reply: FastifyReply) => {
      const branches = await listBranches(app, request.params.chatId)
      return reply.send(branches)
    }
  )

  // POST /api/chats/:chatId/branches
  app.post(
    '/:chatId/branches',
    async (request: FastifyRequest<{ Params: { chatId: string } }>, reply: FastifyReply) => {
      const { parentBranchId, fromMessageId, name } = parseBody(createBranchSchema, request.body)
      const result = await createBranch(
        app, request.params.chatId, parentBranchId, fromMessageId ?? null, name, request.user.id
      )
      return reply.code(201).send(result)
    }
  )
}
