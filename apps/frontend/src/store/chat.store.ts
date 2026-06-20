import { create } from 'zustand'
import { ChatState } from '@ttt/shared'

interface Branch {
  id:       string
  name:     string
  chatId:   string
  parentBranchId: string | null
  createdAt: string
}

interface ChatStoreState {
  activeChatId:   string | null
  activeBranchId: string | null
  branches:       Branch[]
  chatState:      ChatState | null
  setActiveChat:   (chatId: string, branchId: string) => void
  setBranches:     (branches: Branch[]) => void
  setChatState:    (state: ChatState)   => void
  appendMessage:   (msg: ChatState['messages'][number]) => void
  reset:           () => void
}

export const useChatStore = create<ChatStoreState>((set) => ({
  activeChatId:   null,
  activeBranchId: null,
  branches:       [],
  chatState:      null,

  setActiveChat:  (chatId, branchId) => set({ activeChatId: chatId, activeBranchId: branchId }),
  setBranches:    (branches)         => set({ branches }),
  setChatState:   (state)            => set({ chatState: state }),
  appendMessage:  (msg) =>
    set((s) => {
      if (!s.chatState) return s
      // Dedup: socket broadcasts to ALL clients including the sender
      const exists = s.chatState.messages.some((m) => m.id === msg.id)
      if (exists) return s
      return { chatState: { ...s.chatState, messages: [...s.chatState.messages, msg] } }
    }),
  reset: () => set({ activeChatId: null, activeBranchId: null, branches: [], chatState: null }),
}))
