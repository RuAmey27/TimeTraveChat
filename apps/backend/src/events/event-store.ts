import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { EventType, EventEnvelope, ChatState, Message } from '@ttt/shared'
import { TOPICS } from '../plugins/kafka'

/** Create a snapshot every N events */
const SNAPSHOT_THRESHOLD = 100

// ─────────────────────────────────────────────────────────────────────────────
//  Write
// ─────────────────────────────────────────────────────────────────────────────

interface AppendEventInput {
  chatId:      string
  branchId:    string
  eventType:   EventType
  aggregateId: string
  payload:     Record<string, unknown>
  metadata?:   Record<string, unknown>
}

/**
 * Appends an immutable event to the event store and publishes it to Kafka.
 * Version is monotonically increasing per (chatId, branchId).
 */
export async function appendEvent(
  app: FastifyInstance,
  input: AppendEventInput
): Promise<EventEnvelope> {
  const last = await app.prisma.event.findFirst({
    where:   { chatId: input.chatId, branchId: input.branchId },
    orderBy: { version: 'desc' },
    select:  { version: true },
  })

  const version = last ? Number(last.version) + 1 : 1

  const row = await app.prisma.event.create({
    data: {
      id:          uuidv4(),
      chatId:      input.chatId,
      branchId:    input.branchId,
      eventType:   input.eventType,
      aggregateId: input.aggregateId,
      payload:     input.payload  as object,
      metadata:    (input.metadata ?? {}) as object,
      version:     BigInt(version),
    },
  })

  const envelope = rowToEnvelope(row)

  // Fan-out to Kafka (fire-and-forget is fine; Kafka is the async backbone)
  app.kafkaProducer
    .send({
      topic:    TOPICS.CHAT_EVENTS,
      messages: [{ key: input.chatId, value: JSON.stringify(envelope) }],
    })
    .catch((err: unknown) => app.log.error({ err }, 'Kafka publish failed'))

  // Async snapshot (never blocks the response)
  if (version % SNAPSHOT_THRESHOLD === 0) {
    createSnapshot(app, input.chatId, input.branchId).catch((err: unknown) =>
      app.log.error({ err }, 'Snapshot creation failed')
    )
  }

  return envelope
}

// ─────────────────────────────────────────────────────────────────────────────
//  Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getEvents(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  opts?: { fromVersion?: number; toVersion?: number; upToTimestamp?: Date }
): Promise<EventEnvelope[]> {
  const rows = await app.prisma.event.findMany({
    where: {
      chatId,
      branchId,
      ...(opts?.fromVersion   !== undefined && { version:   { gte: BigInt(opts.fromVersion) } }),
      ...(opts?.toVersion     !== undefined && { version:   { lte: BigInt(opts.toVersion) } }),
      ...(opts?.upToTimestamp !== undefined && { createdAt: { lte: opts.upToTimestamp } }),
    },
    orderBy: { version: 'asc' },
  })

  return rows.map(rowToEnvelope)
}

// ─────────────────────────────────────────────────────────────────────────────
//  State reconstruction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuilds ChatState from events, using a snapshot as a base when available.
 * Complexity: O(events since last snapshot) instead of O(all events).
 *
 * Pass `upToTimestamp` for time-travel ("what did the chat look like at T?").
 */
export async function reconstructState(
  app: FastifyInstance,
  chatId: string,
  branchId: string,
  upToTimestamp?: Date
): Promise<ChatState> {
  const snapshot = await app.prisma.snapshot.findFirst({
    where: {
      chatId,
      branchId,
      ...(upToTimestamp ? { createdAt: { lte: upToTimestamp } } : {}),
    },
    orderBy: { version: 'desc' },
  })

  const base: ChatState = snapshot
    ? (snapshot.state as unknown as ChatState)
    : { chatId, branchId, messages: [], members: [], lastVersion: 0 }

  const events = await getEvents(app, chatId, branchId, {
    fromVersion:   snapshot ? Number(snapshot.version) + 1 : 1,
    ...(upToTimestamp ? { upToTimestamp } : {}),
  })

  return events.reduce(applyEvent, base)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pure event projector — applies a single event to a state snapshot
// ─────────────────────────────────────────────────────────────────────────────

export function applyEvent(state: ChatState, event: EventEnvelope): ChatState {
  const ts = event.createdAt

  switch (event.eventType) {
    case EventType.USER_JOINED: {
      const { userId } = event.payload as { userId: string }
      if (state.members.includes(userId)) return { ...state, lastVersion: event.version }
      return { ...state, members: [...state.members, userId], lastVersion: event.version }
    }

    case EventType.USER_LEFT: {
      const { userId } = event.payload as { userId: string }
      return {
        ...state,
        members:     state.members.filter((m) => m !== userId),
        lastVersion: event.version,
      }
    }

    case EventType.MESSAGE_SENT: {
      const p = event.payload as {
        messageId: string; userId: string; username: string; text: string; parentMessageId?: string
      }
      const msg: Message = {
        id:              p.messageId,
        userId:          p.userId,
        username:        p.username,
        text:            p.text,
        parentMessageId: p.parentMessageId,
        isDeleted:       false,
        editHistory:     [],
        reactions:       {},
        createdAt:       ts,
        updatedAt:       ts,
      }
      return { ...state, messages: [...state.messages, msg], lastVersion: event.version }
    }

    case EventType.MESSAGE_EDITED: {
      const p = event.payload as { messageId: string; newText: string; oldText: string }
      return {
        ...state,
        lastVersion: event.version,
        messages: state.messages.map((m) =>
          m.id === p.messageId
            ? { ...m, text: p.newText, editHistory: [...m.editHistory, p.oldText], updatedAt: ts }
            : m
        ),
      }
    }

    case EventType.MESSAGE_DELETED: {
      const { messageId } = event.payload as { messageId: string }
      return {
        ...state,
        lastVersion: event.version,
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, updatedAt: ts } : m
        ),
      }
    }

    case EventType.REACTION_ADDED: {
      const p = event.payload as { messageId: string; userId: string; emoji: string }
      return {
        ...state,
        lastVersion: event.version,
        messages: state.messages.map((m) => {
          if (m.id !== p.messageId) return m
          const current = m.reactions[p.emoji] ?? []
          if (current.includes(p.userId)) return m
          return { ...m, reactions: { ...m.reactions, [p.emoji]: [...current, p.userId] } }
        }),
      }
    }

    case EventType.REACTION_REMOVED: {
      const p = event.payload as { messageId: string; userId: string; emoji: string }
      return {
        ...state,
        lastVersion: event.version,
        messages: state.messages.map((m) => {
          if (m.id !== p.messageId) return m
          const filtered = (m.reactions[p.emoji] ?? []).filter((u) => u !== p.userId)
          return { ...m, reactions: { ...m.reactions, [p.emoji]: filtered } }
        }),
      }
    }

    default:
      return { ...state, lastVersion: event.version }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Snapshotting
// ─────────────────────────────────────────────────────────────────────────────

export async function createSnapshot(
  app: FastifyInstance,
  chatId: string,
  branchId: string
): Promise<void> {
  const state = await reconstructState(app, chatId, branchId)

  await app.prisma.snapshot.upsert({
    where: {
      chatId_branchId_version: {
        chatId,
        branchId,
        version: BigInt(state.lastVersion),
      },
    },
    create: {
      chatId,
      branchId,
      version: BigInt(state.lastVersion),
      state:   state as unknown as object,
    },
    update: { state: state as unknown as object },
  })

  app.log.info({ chatId, branchId, version: state.lastVersion }, 'Snapshot created')
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function rowToEnvelope(row: {
  id: string; chatId: string; branchId: string; aggregateId: string
  eventType: string; version: bigint; payload: unknown; metadata: unknown
  createdAt: Date
}): EventEnvelope {
  return {
    id:          row.id,
    chatId:      row.chatId,
    branchId:    row.branchId,
    aggregateId: row.aggregateId,
    eventType:   row.eventType as EventType,
    version:     Number(row.version),
    payload:     row.payload as Record<string, unknown>,
    metadata:    row.metadata as Record<string, unknown>,
    createdAt:   row.createdAt.toISOString(),
  }
}
