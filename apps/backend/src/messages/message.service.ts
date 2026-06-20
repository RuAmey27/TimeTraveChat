import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { EventType } from '@ttt/shared'
import { appendEvent } from '../events/event-store'

export async function sendMessage(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  userId: string,
  username: string,
  text: string,
  parentMessageId?: string
) {
  const messageId = uuidv4()
  return appendEvent(app, {
    chatId,
    branchId,
    eventType:   EventType.MESSAGE_SENT,
    aggregateId: messageId,
    payload:     { messageId, userId, username, text, ...(parentMessageId ? { parentMessageId } : {}) },
  })
}

export async function editMessage(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  messageId: string,
  userId: string,
  newText: string,
  oldText: string
) {
  return appendEvent(app, {
    chatId,
    branchId,
    eventType:   EventType.MESSAGE_EDITED,
    aggregateId: messageId,
    payload:     { messageId, userId, newText, oldText },
  })
}

export async function deleteMessage(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  messageId: string,
  userId: string
) {
  return appendEvent(app, {
    chatId,
    branchId,
    eventType:   EventType.MESSAGE_DELETED,
    aggregateId: messageId,
    payload:     { messageId, userId },
  })
}

export async function addReaction(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  messageId: string,
  userId: string,
  emoji: string
) {
  return appendEvent(app, {
    chatId,
    branchId,
    eventType:   EventType.REACTION_ADDED,
    aggregateId: messageId,
    payload:     { messageId, userId, emoji },
  })
}

export async function removeReaction(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  messageId: string,
  userId: string,
  emoji: string
) {
  return appendEvent(app, {
    chatId,
    branchId,
    eventType:   EventType.REACTION_REMOVED,
    aggregateId: messageId,
    payload:     { messageId, userId, emoji },
  })
}
