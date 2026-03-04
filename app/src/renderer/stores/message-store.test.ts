import { beforeEach, describe, expect, it } from 'vitest'
import type { Message } from '@common/types'
import { useMessageStore } from './message-store'

const SESSION_ID = 'session-1'

function makeMessage(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? 'id',
    sessionId: partial.sessionId ?? SESSION_ID,
    role: partial.role ?? 'assistant',
    type: partial.type ?? 'text',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? Date.now(),
    ...(partial.toolName ? { toolName: partial.toolName } : {}),
    ...(partial.toolInput ? { toolInput: partial.toolInput } : {}),
    ...(partial.toolUseId ? { toolUseId: partial.toolUseId } : {}),
    ...(partial.toolResult ? { toolResult: partial.toolResult } : {}),
    ...(partial.success !== undefined ? { success: partial.success } : {}),
    ...(partial.usage ? { usage: partial.usage } : {}),
    ...(partial.isStreamDelta !== undefined ? { isStreamDelta: partial.isStreamDelta } : {}),
    ...(partial.isReplay !== undefined ? { isReplay: partial.isReplay } : {}),
  }
}

describe('message-store', () => {
  beforeEach(() => {
    useMessageStore.setState({ messages: {} })
  })

  it('updates stream delta by stable message id', async () => {
    const { addMessage } = useMessageStore.getState()

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_0',
        type: 'text',
        content: 'Hello ',
        isStreamDelta: true,
      }),
    )

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_0',
        type: 'text',
        content: 'Hello world',
        isStreamDelta: true,
      }),
    )

    // Stream deltas are microtask-batched — wait for flush
    await new Promise(resolve => queueMicrotask(resolve))
    const messages = useMessageStore.getState().messages[SESSION_ID]
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Hello world')
    expect(messages[0].isStreamDelta).toBe(true)
  })

  it('replaces stream delta with final non-delta when id matches', () => {
    const { addMessage } = useMessageStore.getState()

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_0',
        type: 'text',
        content: 'partial',
        isStreamDelta: true,
      }),
    )

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_0',
        type: 'text',
        content: 'final content',
        isStreamDelta: false,
      }),
    )

    const messages = useMessageStore.getState().messages[SESSION_ID]
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('final content')
    expect(messages[0].isStreamDelta).toBe(false)
  })

  it('keeps separate stream blocks when ids differ', async () => {
    const { addMessage } = useMessageStore.getState()

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_0',
        type: 'thinking',
        content: 'thinking...',
        isStreamDelta: true,
      }),
    )

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_1',
        type: 'text',
        content: 'answer',
        isStreamDelta: true,
      }),
    )

    await new Promise(resolve => queueMicrotask(resolve))
    const messages = useMessageStore.getState().messages[SESSION_ID]
    expect(messages).toHaveLength(2)
    expect(messages[0].id).toBe('turn-1_block_0')
    expect(messages[1].id).toBe('turn-1_block_1')
  })

  it('upserts non-stream messages by id', () => {
    const { addMessage } = useMessageStore.getState()

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'system-1',
        role: 'system',
        type: 'text',
        content: 'first',
      }),
    )

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'system-1',
        role: 'system',
        type: 'text',
        content: 'updated',
      }),
    )

    const messages = useMessageStore.getState().messages[SESSION_ID]
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('updated')
  })

  it('keeps in-flight stream messages when late history arrives', async () => {
    const { addMessage, setMessages } = useMessageStore.getState()

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'turn-1_block_0',
        type: 'text',
        content: 'partial',
        isStreamDelta: true,
      }),
    )

    // Flush the stream delta so it's visible in store before history arrives
    await new Promise(resolve => queueMicrotask(resolve))

    setMessages(SESSION_ID, [
      makeMessage({
        id: 'history-1',
        role: 'user',
        type: 'text',
        content: 'old prompt',
        isStreamDelta: false,
      }),
    ])

    const messages = useMessageStore.getState().messages[SESSION_ID]
    expect(messages).toHaveLength(2)
    expect(messages[0].id).toBe('history-1')
    expect(messages[1].id).toBe('turn-1_block_0')
    expect(messages[1].isStreamDelta).toBe(true)
  })

  it('clearMessages removes all messages for a session', () => {
    const { addMessage, clearMessages } = useMessageStore.getState()

    addMessage(SESSION_ID, makeMessage({ id: 'msg-1', content: 'hello' }))
    addMessage(SESSION_ID, makeMessage({ id: 'msg-2', content: 'world' }))
    addMessage('other-session', makeMessage({ id: 'msg-3', sessionId: 'other-session', content: 'other' }))

    clearMessages(SESSION_ID)

    const state = useMessageStore.getState().messages
    expect(state[SESSION_ID]).toBeUndefined()
    expect(state['other-session']).toHaveLength(1)
  })

  it('should efficiently update existing stream messages with O(1) lookup', () => {
    const { addMessage } = useMessageStore.getState()
    // Add 500 messages
    for (let i = 0; i < 500; i++) {
      addMessage(SESSION_ID, makeMessage({ id: `msg_${i}`, content: `text ${i}`, timestamp: i }))
    }
    // Update the last message 100 times (simulating stream deltas)
    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      addMessage(SESSION_ID, makeMessage({ id: 'msg_499', content: `updated ${i}`, timestamp: 500 + i }))
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(200)
    expect(useMessageStore.getState().messages[SESSION_ID]).toHaveLength(500)
    expect(useMessageStore.getState().messages[SESSION_ID][499].content).toBe('updated 99')
  })

  it('rebuilds index map on setMessages', () => {
    const { setMessages, addMessage } = useMessageStore.getState()
    setMessages(SESSION_ID, [
      makeMessage({ id: 'h1', content: 'history 1' }),
      makeMessage({ id: 'h2', content: 'history 2' }),
    ])
    // Update an existing message by id — should find via index map
    addMessage(SESSION_ID, makeMessage({ id: 'h1', content: 'updated history' }))
    const msgs = useMessageStore.getState().messages[SESSION_ID]
    expect(msgs).toHaveLength(2)
    expect(msgs[0].content).toBe('updated history')
  })

  it('replaces existing messages with history when no stream is active', () => {
    const { addMessage, setMessages } = useMessageStore.getState()

    addMessage(
      SESSION_ID,
      makeMessage({
        id: 'local-1',
        role: 'system',
        type: 'text',
        content: 'local',
      }),
    )

    setMessages(SESSION_ID, [
      makeMessage({
        id: 'history-2',
        role: 'user',
        type: 'text',
        content: 'history',
      }),
    ])

    const messages = useMessageStore.getState().messages[SESSION_ID]
    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe('history-2')
  })

  it('should batch multiple stream deltas into fewer store updates', async () => {
    const { addMessage } = useMessageStore.getState()

    // Send 10 rapid stream deltas
    for (let i = 0; i < 10; i++) {
      addMessage(SESSION_ID, makeMessage({
        id: 'delta_1',
        type: 'text',
        content: `chunk ${i}`,
        timestamp: i,
        isStreamDelta: true,
      }))
    }

    // After microtask flush, the final content should be available
    await new Promise(resolve => queueMicrotask(resolve))
    const msgs = useMessageStore.getState().messages[SESSION_ID]
    expect(msgs).toBeDefined()
    expect(msgs[0]?.content).toBe('chunk 9')
    expect(msgs).toHaveLength(1)
  })

  it('should flush pending deltas before applying non-delta message', () => {
    const { addMessage } = useMessageStore.getState()

    // Queue some deltas
    addMessage(SESSION_ID, makeMessage({
      id: 'delta_stream',
      type: 'text',
      content: 'streaming...',
      isStreamDelta: true,
    }))

    // Then add a non-delta message — should flush first
    addMessage(SESSION_ID, makeMessage({
      id: 'final_msg',
      type: 'text',
      content: 'done',
      isStreamDelta: false,
    }))

    const msgs = useMessageStore.getState().messages[SESSION_ID]
    expect(msgs).toHaveLength(2)
    expect(msgs[0].id).toBe('delta_stream')
    expect(msgs[1].id).toBe('final_msg')
  })
})
