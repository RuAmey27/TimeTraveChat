import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { sendMessage, editMessage, deleteMessage, addReaction, removeReaction } from './message.service'
import { parseBody } from '../shared/errors'

const sendSchema = z.object({
  branchId:        z.string().uuid(),
  text:            z.string().min(1).max(4000),
  parentMessageId: z.string().uuid().optional(),
})

const editSchema = z.object({
  branchId: z.string().uuid(),
  newText:  z.string().min(1).max(4000),
  oldText:  z.string(),
})

const reactionSchema = z.object({
  branchId: z.string().uuid(),
  emoji:    z.string().min(1).max(10),
})

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // POST /api/chats/:chatId/messages
  app.post(
    '/:chatId/messages',
    async (request: FastifyRequest<{ Params: { chatId: string } }>, reply: FastifyReply) => {
      const { branchId, text, parentMessageId } = parseBody(sendSchema, request.body)
      const event = await sendMessage(app, request.params.chatId, branchId, request.user.id, request.user.username, text, parentMessageId)
      // Broadcast to everyone in the chat room (including sender for consistency)
      app.io.to(`chat:${request.params.chatId}`).emit('message:new', {
        chatId:   request.params.chatId,
        branchId,
        event,
      })
      return reply.code(201).send(event)
    }
  )

  // PATCH /api/chats/:chatId/messages/:messageId
  app.patch(
    '/:chatId/messages/:messageId',
    async (
      request: FastifyRequest<{ Params: { chatId: string; messageId: string } }>,
      reply: FastifyReply
    ) => {
      const { branchId, newText, oldText } = parseBody(editSchema, request.body)
      const event = await editMessage(
        app, request.params.chatId, branchId, request.params.messageId, request.user.id, newText, oldText
      )
      return reply.send(event)
    }
  )

  // DELETE /api/chats/:chatId/messages/:messageId?branchId=<uuid>
  app.delete(
    '/:chatId/messages/:messageId',
    async (
      request: FastifyRequest<{
        Params:      { chatId: string; messageId: string }
        Querystring: { branchId: string }
      }>,
      reply: FastifyReply
    ) => {
      const { branchId } = request.query
      const event = await deleteMessage(
        app, request.params.chatId, branchId, request.params.messageId, request.user.id
      )
      return reply.send(event)
    }
  )

  // POST /api/chats/:chatId/messages/:messageId/reactions
  app.post(
    '/:chatId/messages/:messageId/reactions',
    async (
      request: FastifyRequest<{ Params: { chatId: string; messageId: string } }>,
      reply: FastifyReply
    ) => {
      const { branchId, emoji } = parseBody(reactionSchema, request.body)
      const event = await addReaction(
        app, request.params.chatId, branchId, request.params.messageId, request.user.id, emoji
      )
      return reply.code(201).send(event)
    }
  )

  // DELETE /api/chats/:chatId/messages/:messageId/reactions?branchId=<uuid>&emoji=<emoji>
  app.delete(
    '/:chatId/messages/:messageId/reactions',
    async (
      request: FastifyRequest<{
        Params:      { chatId: string; messageId: string }
        Querystring: { branchId: string; emoji: string }
      }>,
      reply: FastifyReply
    ) => {
      const { branchId, emoji } = request.query
      const event = await removeReaction(
        app, request.params.chatId, branchId, request.params.messageId, request.user.id, emoji
      )
      return reply.send(event)
    }
  )
}
