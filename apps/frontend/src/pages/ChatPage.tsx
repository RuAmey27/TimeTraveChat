import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { extractErrorMessage } from '../api/errors'
import { useSocket } from '../hooks/useSocket'
import { useChatStore } from '../store/chat.store'
import { useAuthStore } from '../store/auth.store'
import { Message, EventEnvelope, EventType } from '@ttt/shared'

interface Branch {
  id: string; name: string; chatId: string; parentBranchId: string | null
  createdAt: string
  creator: { id: string; username: string }
}

interface UserResult {
  id: string; username: string; phone?: string
}

export default function ChatPage() {
  const { id: chatId } = useParams<{ id: string }>()
  const navigate       = useNavigate()
  const { user }       = useAuthStore()
  const { activeBranchId, branches, chatState, setActiveChat, setBranches, setChatState, appendMessage } = useChatStore()
  const socket = useSocket()

  const [text,         setText]         = useState('')
  const [sending,      setSending]      = useState(false)
  const [newBranch,    setNewBranch]    = useState({ name: '', fromMessageId: '' as string | null })
  const [branchDialog, setBranchDialog] = useState(false)
  const [timeAt,       setTimeAt]       = useState('')
  const [timeTraveled, setTimeTraveled] = useState(false)
  // Invite by username
  const [inviteQuery,   setInviteQuery]   = useState('')
  const [inviteResults, setInviteResults] = useState<UserResult[]>([])
  const [inviting,      setInviting]      = useState(false)
  const [inviteMsg,     setInviteMsg]     = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Load chat ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatId) return
    ;(async () => {
      const [{ data: chatData }, { data: branchData }] = await Promise.all([
        api.get<{ id: string; branches: Branch[] }>(`/chats/${chatId}`),
        api.get<Branch[]>(`/chats/${chatId}/branches`),
      ])

      const main = chatData.branches.find((b: Branch) => !b.parentBranchId) ?? chatData.branches[0]
      setBranches(branchData)
      setActiveChat(chatId, main.id)
      await loadState(chatId, main.id)
    })()
  }, [chatId])

  // ── Real-time socket subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!socket || !chatId) return

    socket.emit('chat:join', chatId)

    const onMessageNew = (payload: { chatId: string; branchId: string; event: EventEnvelope }) => {
      // Only append if the message is for the currently viewed branch
      if (payload.branchId !== activeBranchId) return
      if (payload.event.eventType !== EventType.MESSAGE_SENT) return

      const p = payload.event.payload as {
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
        createdAt:       payload.event.createdAt,
        updatedAt:       payload.event.createdAt,
      }
      appendMessage(msg)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
    }

    socket.on('message:new', onMessageNew)

    return () => {
      socket.off('message:new', onMessageNew)
      socket.emit('chat:leave', chatId)
    }
  }, [socket, chatId, activeBranchId])

  async function loadState(cId: string, bId: string, at?: string) {
    const params: Record<string, string> = { branchId: bId }
    if (at) params.at = at
    const { data } = await api.get(`/chats/${cId}/state`, { params })
    setChatState(data)
    setTimeTraveled(!!at)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function switchBranch(branchId: string) {
    if (!chatId) return
    setActiveChat(chatId, branchId)
    await loadState(chatId, branchId)
  }

  // ── User search + invite ──────────────────────────────────────────────────
  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setInviteResults([]); return }
    const { data } = await api.get<UserResult[]>('/users/search', { params: { q } })
    setInviteResults(data)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchUsers(inviteQuery), 300)
    return () => clearTimeout(t)
  }, [inviteQuery, searchUsers])

  async function inviteUser(username: string) {
    if (!chatId) return
    setInviting(true)
    setInviteMsg(null)
    try {
      await api.post(`/chats/${chatId}/members`, { username })
      setInviteMsg(`@${username} added!`)
      setInviteQuery('')
      setInviteResults([])
    } catch (err: unknown) {
      setInviteMsg(extractErrorMessage(err, 'Failed to invite'))
    } finally {
      setInviting(false)
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!text.trim() || !chatId || !activeBranchId || sending) return
    setSending(true)
    try {
      await api.post(`/chats/${chatId}/messages`, { branchId: activeBranchId, text: text.trim() })
      setText('')
      // Socket event will handle appending — no need to reload full state
    } finally {
      setSending(false)
    }
  }

  // ── Create branch ─────────────────────────────────────────────────────────
  async function handleCreateBranch() {
    if (!chatId || !activeBranchId || !newBranch.name.trim()) return
    await api.post(`/chats/${chatId}/branches`, {
      parentBranchId: activeBranchId,
      fromMessageId:  newBranch.fromMessageId || null,
      name:           newBranch.name.trim(),
    })
    setBranchDialog(false)
    setNewBranch({ name: '', fromMessageId: '' })
    const { data } = await api.get<Branch[]>(`/chats/${chatId}/branches`)
    setBranches(data)
  }

  // ── Time travel ───────────────────────────────────────────────────────────
  async function handleTimeTravel() {
    if (!chatId || !activeBranchId || !timeAt) return
    await loadState(chatId, activeBranchId, timeAt)
  }

  const messages = chatState?.messages ?? []

  return (
    <div className="flex h-screen bg-gray-100">
      {/* ── Sidebar: branches ─────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <button onClick={() => navigate('/')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          <h2 className="text-sm font-semibold text-gray-800 mt-1">Branches</h2>
        </div>

        <ul className="flex-1 overflow-y-auto py-2">
          {branches.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => switchBranch(b.id)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                  b.id === activeBranchId
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-gray-300">{b.parentBranchId ? '├─' : '┌─'}</span>
                {b.name}
              </button>
            </li>
          ))}
        </ul>

        <div className="p-3 border-t border-gray-200 space-y-2">
          {/* Invite by username */}
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Invite</p>
          <input
            value={inviteQuery}
            onChange={(e) => setInviteQuery(e.target.value)}
            placeholder="@username or +phone"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {inviteResults.length > 0 && (
            <ul className="border border-gray-200 rounded bg-white shadow-sm">
              {inviteResults.map((u) => (
                <li key={u.id}>
                  <button
                    disabled={inviting}
                    onClick={() => inviteUser(u.username)}
                    className="w-full text-left text-xs px-2 py-1.5 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                  >
                    @{u.username}
                    {u.phone && <span className="text-gray-400 ml-1">{u.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {inviteMsg && (
            <p className={`text-xs ${inviteMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>
              {inviteMsg}
            </p>
          )}
          <button
            onClick={() => setBranchDialog(true)}
            className="w-full text-xs text-brand-600 hover:text-brand-700 font-medium py-1"
          >
            + New branch
          </button>
        </div>
      </aside>

      {/* ── Main chat area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-gray-800">
              {branches.find((b) => b.id === activeBranchId)?.name ?? 'Chat'}
            </span>
            {timeTraveled && (
              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                Time-travel view (read-only)
              </span>
            )}
          </div>

          {/* Time-travel controls */}
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={timeAt}
              onChange={(e) => setTimeAt(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              onClick={handleTimeTravel}
              disabled={!timeAt}
              className="text-xs bg-yellow-400 hover:bg-yellow-500 disabled:opacity-40 text-yellow-900 font-medium px-3 py-1 rounded transition-colors"
            >
              Time travel
            </button>
            {timeTraveled && (
              <button
                onClick={() => chatId && activeBranchId && loadState(chatId, activeBranchId)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Back to present
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 mt-20">No messages yet. Say something!</p>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} currentUserId={user?.id ?? ''} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!timeTraveled && (
          <div className="bg-white border-t border-gray-200 px-5 py-3 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={sendMessage}
              disabled={!text.trim() || sending}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 transition-colors"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        )}
      </div>

      {/* ── Branch creation dialog ─────────────────────────────────────── */}
      {branchDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Create branch</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Branch name</label>
                <input
                  value={newBranch.name}
                  onChange={(e) => setNewBranch((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. stripe-investigation"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fork from message ID <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  value={newBranch.fromMessageId ?? ''}
                  onChange={(e) => setNewBranch((p) => ({ ...p, fromMessageId: e.target.value || null }))}
                  placeholder="message UUID"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setBranchDialog(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranch.name.trim()}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg, currentUserId }: { msg: Message; currentUserId: string }) {
  const isOwn = msg.userId === currentUserId

  if (msg.isDeleted) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-gray-400 italic">Message deleted</span>
      </div>
    )
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm shadow-sm ${
          isOwn ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm'
        }`}
      >
        {!isOwn && (
          <p className="text-xs font-semibold text-brand-600 mb-1">@{msg.username}</p>
        )}
        <p className="leading-relaxed">{msg.text}</p>
        {msg.editHistory.length > 0 && (
          <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
            edited {msg.editHistory.length}×
          </p>
        )}
        {/* Reactions */}
        {Object.keys(msg.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <span key={emoji} className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs">
                {emoji} {users.length}
              </span>
            ))}
          </div>
        )}
        <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-xs text-gray-300 font-mono">{msg.id.slice(0, 8)}</p>
      </div>
    </div>
  )
}
