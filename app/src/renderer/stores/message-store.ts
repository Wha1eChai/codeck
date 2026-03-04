import { create } from 'zustand'
import { Message } from '@common/types'

interface MessageStore {
  messages: Record<string, Message[]>
  /** Maps sessionId → messageId marking where a rewind was performed */
  rewindPoints: Readonly<Record<string, string>>

  addMessage: (sessionId: string, msg: Message) => void
  setMessages: (sessionId: string, messages: Message[]) => void
  clearMessages: (sessionId: string) => void
  setRewindPoint: (sessionId: string, messageId: string) => void
  clearRewindPoint: (sessionId: string) => void
}

// ── O(1) message index maps (module-level, outside store) ──

const messageIndexMaps: Record<string, Map<string, number>> = {}

function upsertMessage(messages: Message[], msg: Message, sessionId: string): Message[] {
  const indexMap = messageIndexMaps[sessionId]
  if (indexMap) {
    const existingIndex = indexMap.get(msg.id)
    if (existingIndex !== undefined && existingIndex < messages.length && messages[existingIndex]?.id === msg.id) {
      const updated = [...messages]
      updated[existingIndex] = msg
      return updated
    }
  }
  // Append new message and register in index map
  const newMessages = [...messages, msg]
  if (!messageIndexMaps[sessionId]) {
    messageIndexMaps[sessionId] = new Map()
  }
  messageIndexMaps[sessionId].set(msg.id, newMessages.length - 1)
  return newMessages
}

function rebuildIndexMap(sessionId: string, messages: Message[]): void {
  const map = new Map<string, number>()
  for (let i = 0; i < messages.length; i++) {
    map.set(messages[i].id, i)
  }
  messageIndexMaps[sessionId] = map
}

function mergeHistoricalBeforeLive(current: Message[], historical: Message[]): Message[] {
  const liveIds = new Set(current.map((msg) => msg.id))
  const historicalOnly = historical.filter((msg) => !liveIds.has(msg.id))
  return [...historicalOnly, ...current]
}

// ── Microtask-batched delta flushing ──

let pendingDeltas: { sessionId: string; msg: Message }[] = []
let flushScheduled = false

function flushPendingDeltas(): void {
  flushScheduled = false
  const batch = pendingDeltas
  pendingDeltas = []
  if (batch.length === 0) return

  useMessageStore.setState((state) => {
    let nextMessages = { ...state.messages }
    for (const { sessionId, msg } of batch) {
      const current = nextMessages[sessionId] || []
      nextMessages = { ...nextMessages, [sessionId]: upsertMessage(current, msg, sessionId) }
    }
    return { messages: nextMessages }
  })
}

function scheduleDeltaFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(flushPendingDeltas)
}

const EMPTY_REWIND_POINTS: Readonly<Record<string, string>> = {}

export const useMessageStore = create<MessageStore>((set) => ({
  messages: {},
  rewindPoints: EMPTY_REWIND_POINTS,

  addMessage: (sessionId, msg) => {
    if (msg.isStreamDelta) {
      pendingDeltas.push({ sessionId, msg })
      scheduleDeltaFlush()
      return
    }
    // Non-delta: flush pending first, then apply immediately
    if (pendingDeltas.length > 0) flushPendingDeltas()
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: upsertMessage(state.messages[sessionId] || [], msg, sessionId),
      },
    }))
  },

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

        rebuildIndexMap(sessionId, nextMessages)

        return {
          ...state.messages,
          [sessionId]: nextMessages,
        }
      })(),
    })),

  clearMessages: (sessionId) =>
    set((state) => {
      delete messageIndexMaps[sessionId]
      const { [sessionId]: _, ...rest } = state.messages
      const { [sessionId]: _rp, ...restRewind } = state.rewindPoints
      return { messages: rest, rewindPoints: restRewind }
    }),

  setRewindPoint: (sessionId, messageId) =>
    set((state) => ({
      rewindPoints: { ...state.rewindPoints, [sessionId]: messageId },
    })),

  clearRewindPoint: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.rewindPoints
      return { rewindPoints: rest }
    }),
}))
