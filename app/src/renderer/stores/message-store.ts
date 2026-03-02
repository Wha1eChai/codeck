import { create } from 'zustand'
import { Message } from '@common/types'

interface MessageStore {
  messages: Record<string, Message[]>

  addMessage: (sessionId: string, msg: Message) => void
  setMessages: (sessionId: string, messages: Message[]) => void
  clearMessages: (sessionId: string) => void
}

function upsertMessage(messages: Message[], msg: Message): Message[] {
  const existingIndex = messages.findIndex((existing) => existing.id === msg.id)
  if (existingIndex < 0) {
    return [...messages, msg]
  }

  const updated = [...messages]
  updated[existingIndex] = msg
  return updated
}

function mergeHistoricalBeforeLive(current: Message[], historical: Message[]): Message[] {
  const liveIds = new Set(current.map((msg) => msg.id))
  const historicalOnly = historical.filter((msg) => !liveIds.has(msg.id))
  return [...historicalOnly, ...current]
}

export const useMessageStore = create<MessageStore>((set) => ({
  messages: {},

  addMessage: (sessionId, msg) =>
    set((state) => {
      const currentMessages = state.messages[sessionId] || []
      const updatedMessages = upsertMessage(currentMessages, msg)

      return {
        messages: {
          ...state.messages,
          [sessionId]: updatedMessages,
        },
      }
    }),

  setMessages: (sessionId, messages) =>
    set((state) => ({
      messages: (() => {
        const currentMessages = state.messages[sessionId] || []
        const hasActiveStream = currentMessages.some((msg) => msg.isStreamDelta)

        // Avoid clobbering in-flight stream updates with late history load.
        const nextMessages =
          hasActiveStream && messages.every((msg) => !msg.isStreamDelta)
            ? mergeHistoricalBeforeLive(currentMessages, messages)
            : messages

        return {
          ...state.messages,
          [sessionId]: nextMessages,
        }
      })(),
    })),

  clearMessages: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.messages
      return { messages: rest }
    }),
}))
