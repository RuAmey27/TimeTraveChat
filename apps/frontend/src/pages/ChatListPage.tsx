import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSocket } from '../hooks/useSocket'
import { disconnectSocket } from '../hooks/useSocket'
import { useAuthStore } from '../store/auth.store'

interface Chat {
  id:        string
  name:      string
  createdAt: string
  _count:    { members: number }
  branches:  { id: string }[]
}

export default function ChatListPage() {
  const [chats,    setChats]    = useState<Chat[]>([])
  const [newName,  setNewName]  = useState('')
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const socket = useSocket()

  async function fetchChats() {
    const { data } = await api.get<Chat[]>('/chats')
    setChats(data)
  }

  useEffect(() => {
    fetchChats().finally(() => setLoading(false))
  }, [])

  // Real-time: someone invited this user to a chat
  useEffect(() => {
    if (!socket) return
    const onInvited = () => fetchChats()
    socket.on('chat:invited', onInvited)
    return () => { socket.off('chat:invited', onInvited) }
  }, [socket])

  async function createChat() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post<{ chatId: string }>('/chats', { name: newName.trim() })
      navigate(`/chat/${data.chatId}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Time-Travel Chat</h1>
          <p className="text-xs text-gray-400">
            @<span className="font-medium text-gray-600">{user?.username}</span>
          </p>
        </div>
        <button onClick={() => { disconnectSocket(); logout() }} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          Sign out
        </button>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {/* Create chat */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">New chat room</h2>
          <div className="flex gap-2">
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createChat()}
              placeholder="Chat name…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={createChat} disabled={creating || !newName.trim()}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              {creating ? '…' : 'Create'}
            </button>
          </div>
        </div>

        {/* Chat list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          <div className="px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Your chats</h2>
            {loading && <span className="text-xs text-gray-400">Loading…</span>}
          </div>

          {!loading && chats.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              No chats yet — create one above or get invited.
            </p>
          )}

          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => navigate(`/chat/${chat.id}`)}
              className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{chat.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {chat._count.members} member{chat._count.members !== 1 ? 's' : ''} ·{' '}
                  {new Date(chat.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className="text-gray-300 text-lg">›</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

