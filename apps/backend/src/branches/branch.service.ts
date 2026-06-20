import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { EventType } from '@ttt/shared'
import { appendEvent, reconstructState } from '../events/event-store'
import { httpError } from '../shared/errors'

export async function createBranch(
  app: FastifyInstance,
  chatId: string,
  parentBranchId: string,
  fromMessageId: string | null,
  name: string,
  createdBy: string
) {
  const branchId = uuidv4()

  // Find the event where this branch forks (by aggregateId = messageId)
  let branchPointEventId: string | null = null
  if (fromMessageId) {
    const event = await app.prisma.event.findFirst({
      where: { chatId, branchId: parentBranchId, aggregateId: fromMessageId },
    })
    branchPointEventId = event?.id ?? null
  }

  await app.prisma.branch.create({
    data: { id: branchId, chatId, parentBranchId, branchPointEventId, name, createdBy },
  })

  await appendEvent(app, {
    chatId,
    branchId:    parentBranchId,
    eventType:   EventType.BRANCH_CREATED,
    aggregateId: branchId,
    payload:     { branchId, parentBranchId, fromMessageId, name, createdBy },
  })

  return { branchId, parentBranchId, fromMessageId, name }
}

export async function listBranches(app: FastifyInstance, chatId: string) {
  return app.prisma.branch.findMany({
    where:   { chatId },
    include: { creator: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Compares two branches — returns messages only in A, only in B, and common.
 * This is the "git diff" feature.
 */
export async function compareBranches(
  app: FastifyInstance,
  branchAId: string,
  branchBId: string
) {
  const [branchA, branchB] = await Promise.all([
    app.prisma.branch.findUnique({ where: { id: branchAId } }),
    app.prisma.branch.findUnique({ where: { id: branchBId } }),
  ])

  if (!branchA || !branchB) throw httpError(404, 'Branch not found')
  if (branchA.chatId !== branchB.chatId) throw httpError(400, 'Branches belong to different chats')

  const [stateA, stateB] = await Promise.all([
    reconstructState(app, branchA.chatId, branchAId),
    reconstructState(app, branchB.chatId, branchBId),
  ])

  const idsA = new Set(stateA.messages.map((m) => m.id))
  const idsB = new Set(stateB.messages.map((m) => m.id))

  return {
    branchA:   { id: branchAId, name: branchA.name, messageCount: stateA.messages.length },
    branchB:   { id: branchBId, name: branchB.name, messageCount: stateB.messages.length },
    onlyInA:   stateA.messages.filter((m) => !idsB.has(m.id)),
    onlyInB:   stateB.messages.filter((m) => !idsA.has(m.id)),
    common:    stateA.messages.filter((m) => idsB.has(m.id)),
  }
}
