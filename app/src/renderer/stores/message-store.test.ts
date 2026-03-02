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

  it('updates stream delta by stable message id', () => {
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

  it('keeps separate stream blocks when ids differ', () => {
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

  it('keeps in-flight stream messages when late history arrives', () => {
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
})
