import { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { EventType } from '@ttt/shared'
import { appendEvent, reconstructState } from '../events/event-store'
import { httpError } from '../shared/errors'

export async function getMyChats(app: FastifyInstance, userId: string) {
  return app.prisma.chat.findMany({
    where:   { members: { some: { userId } } },
    include: {
      branches: {
        where:   { parentBranchId: null },
        select:  { id: true },
      },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createChat(app: FastifyInstance, name: string, createdBy: string) {
  const chatId       = uuidv4()
  const mainBranchId = uuidv4()

  await app.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.chat.create({ data: { id: chatId, name, createdBy } })
    await tx.branch.create({ data: { id: mainBranchId, chatId, name: 'main', createdBy } })
    await tx.chatMember.create({ data: { chatId, userId: createdBy } })
  })

  await appendEvent(app, {
    chatId,
    branchId:    mainBranchId,
    eventType:   EventType.USER_JOINED,
    aggregateId: createdBy,
    payload:     { userId: createdBy },
  })

  return { chatId, mainBranchId }
}

export async function joinChat(
  app: FastifyInstance,
  chatId: string,
  userId: string,
  username: string
) {
  const chat = await app.prisma.chat.findUnique({ where: { id: chatId } })
  if (!chat) throw httpError(404, 'Chat not found')

  const mainBranch = await app.prisma.branch.findFirst({
    where: { chatId, parentBranchId: null },
  })
  if (!mainBranch) throw httpError(500, 'Main branch not found')

  await app.prisma.chatMember.upsert({
    where:  { chatId_userId: { chatId, userId } },
    create: { chatId, userId },
    update: {},
  })

  await appendEvent(app, {
    chatId,
    branchId:    mainBranch.id,
    eventType:   EventType.USER_JOINED,
    aggregateId: userId,
    payload:     { userId, username },
  })

  return chat
}

export async function inviteMember(
  app: FastifyInstance,
  chatId: string,
  inviterId: string,
  targetUsername: string
) {
  const target = await app.prisma.user.findUnique({
    where:  { username: targetUsername },
    select: { id: true, username: true },
  })
  if (!target) throw httpError(404, `User @${targetUsername} not found`)

  const already = await app.prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: target.id } },
  })
  if (already) throw httpError(409, `@${targetUsername} is already in this chat`)

  const mainBranch = await app.prisma.branch.findFirst({
    where: { chatId, parentBranchId: null },
  })
  if (!mainBranch) throw httpError(500, 'Main branch not found')

  await app.prisma.chatMember.create({ data: { chatId, userId: target.id } })

  await appendEvent(app, {
    chatId,
    branchId:    mainBranch.id,
    eventType:   EventType.USER_JOINED,
    aggregateId: target.id,
    payload:     { userId: target.id, username: target.username, invitedBy: inviterId },
  })

  // Notify the invited user in real-time so their chat list refreshes
  const chat = await app.prisma.chat.findUnique({ where: { id: chatId }, select: { name: true } })
  app.io.to(`user:${target.id}`).emit('chat:invited', {
    chatId,
    chatName: chat?.name ?? '',
    invitedBy: inviterId,
  })

  return { userId: target.id, username: target.username }
}

export async function getChatState(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  at?: string
) {
  const upToTimestamp = at ? new Date(at) : undefined
  if (upToTimestamp && isNaN(upToTimestamp.getTime())) {
    throw httpError(400, 'Invalid timestamp for "at" parameter')
  }
  return reconstructState(app, chatId, branchId, upToTimestamp)
}
