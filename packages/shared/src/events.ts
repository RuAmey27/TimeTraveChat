// ─────────────────────────────────────────────
//  Event types
// ─────────────────────────────────────────────
export enum EventType {
  USER_JOINED      = 'UserJoined',
  USER_LEFT        = 'UserLeft',
  MESSAGE_SENT     = 'MessageSent',
  MESSAGE_EDITED   = 'MessageEdited',
  MESSAGE_DELETED  = 'MessageDeleted',
  REACTION_ADDED   = 'ReactionAdded',
  REACTION_REMOVED = 'ReactionRemoved',
  BRANCH_CREATED   = 'BranchCreated',
  SNAPSHOT_CREATED = 'SnapshotCreated',
}

// ─────────────────────────────────────────────
//  Generic event envelope
// ─────────────────────────────────────────────
export interface EventEnvelope<T = Record<string, unknown>> {
  id: string
  chatId: string
  branchId: string
  aggregateId: string
  eventType: EventType
  version: number
  payload: T
  metadata?: Record<string, unknown>
  createdAt: string
}

// ─────────────────────────────────────────────
//  Typed payload shapes
// ─────────────────────────────────────────────
export interface UserJoinedPayload {
  userId: string
  username: string
}

export interface UserLeftPayload {
  userId: string
}

export interface MessageSentPayload {
  messageId: string
  userId: string
  username: string
  text: string
  parentMessageId?: string
}

export interface MessageEditedPayload {
  messageId: string
  userId: string
  newText: string
  oldText: string
}

export interface MessageDeletedPayload {
  messageId: string
  userId: string
}

export interface ReactionAddedPayload {
  messageId: string
  userId: string
  emoji: string
}

export interface ReactionRemovedPayload {
  messageId: string
  userId: string
  emoji: string
}

export interface BranchCreatedPayload {
  branchId: string
  parentBranchId: string | null
  fromMessageId: string | null
  name: string
  createdBy: string
}

// ─────────────────────────────────────────────
//  Read model (Chat state rebuilt from events)
// ─────────────────────────────────────────────
export interface Message {
  id: string
  userId: string
  username: string
  text: string
  parentMessageId?: string
  isDeleted: boolean
  editHistory: string[]               // previous texts, oldest first
  reactions: Record<string, string[]> // emoji -> array of userIds
  createdAt: string
  updatedAt: string
}

export interface ChatState {
  chatId: string
  branchId: string
  messages: Message[]
  members: string[]
  lastVersion: number
}
