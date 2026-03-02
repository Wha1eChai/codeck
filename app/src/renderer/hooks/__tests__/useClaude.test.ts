// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClaude } from '../useClaude'
import { useMessageStore } from '../../stores/message-store'
import { useSessionStore } from '../../stores/session-store'
import { installMockElectron, uninstallMockElectron } from '../../__test-utils__/mock-electron'
import type { MockElectronAPI } from '../../__test-utils__/mock-electron'

let mockElectron: MockElectronAPI

describe('useClaude', () => {
  beforeEach(() => {
    mockElectron = installMockElectron()
    useMessageStore.setState({ messages: {} })
    useSessionStore.setState({
      sessionStatus: 'idle',
      currentError: null,
    })
  })

  afterEach(() => {
    uninstallMockElectron()
  })

  it('sendMessage — adds optimistic user message and calls IPC', async () => {
    const { result } = renderHook(() => useClaude('sess-1'))

    await act(async () => {
      await result.current.sendMessage('Hello world')
    })

    // Check optimistic user message was added
    const messages = useMessageStore.getState().messages['sess-1']
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Hello world')
    expect(messages[0].id).toMatch(/^user_/)

    // Check IPC was called
    expect(mockElectron.sendMessage).toHaveBeenCalledWith(
      'sess-1', 'Hello world', undefined, undefined, undefined,
    )
  })

  it('sendMessage — does nothing when sessionId is null', async () => {
    const { result } = renderHook(() => useClaude(null))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(mockElectron.sendMessage).not.toHaveBeenCalled()
  })

  it('sendMessage — passes permission mode and execution options', async () => {
    const { result } = renderHook(() => useClaude('sess-1'))

    await act(async () => {
      await result.current.sendMessage('test', 'plan', { model: 'opus' }, { autoAllowReadOnly: true, blockedCommands: [] })
    })

    expect(mockElectron.sendMessage).toHaveBeenCalledWith(
      'sess-1', 'test', 'plan', { model: 'opus' }, { autoAllowReadOnly: true, blockedCommands: [] },
    )
  })

  it('sendMessage — handles IPC error gracefully', async () => {
    mockElectron.sendMessage.mockRejectedValueOnce(new Error('Network error'))

    // syncStatus only updates sessionStatus when currentSessionId matches
    useSessionStore.setState({ currentSessionId: 'sess-1' })

    const { result } = renderHook(() => useClaude('sess-1'))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    // Should set error status
    const state = useSessionStore.getState()
    expect(state.sessionStatus).toBe('error')
    expect(state.currentError).toBe('Network error')
  })

  it('abort — calls IPC abort', async () => {
    const { result } = renderHook(() => useClaude('sess-1'))

    await act(async () => {
      await result.current.abort()
    })

    expect(mockElectron.abort).toHaveBeenCalledWith('sess-1')
  })

  it('abort — does nothing when sessionId is null', async () => {
    const { result } = renderHook(() => useClaude(null))

    await act(async () => {
      await result.current.abort()
    })

    expect(mockElectron.abort).not.toHaveBeenCalled()
  })

  it('respondPermission — calls IPC', async () => {
    const { result } = renderHook(() => useClaude('sess-1'))

    const response = { requestId: 'req-1', allowed: true }
    await act(async () => {
      await result.current.respondPermission(response)
    })

    expect(mockElectron.respondPermission).toHaveBeenCalledWith(response)
  })

  it('respondAskUserQuestion — calls IPC', async () => {
    const { result } = renderHook(() => useClaude('sess-1'))

    const response = { requestId: 'ask-1', answers: { 'Q?': 'A' }, cancelled: false }
    await act(async () => {
      await result.current.respondAskUserQuestion(response)
    })

    expect(mockElectron.respondAskUserQuestion).toHaveBeenCalledWith(response)
  })

  it('respondExitPlanMode — calls IPC', async () => {
    const { result } = renderHook(() => useClaude('sess-1'))

    const response = { requestId: 'plan-1', allowed: true }
    await act(async () => {
      await result.current.respondExitPlanMode(response)
    })

    expect(mockElectron.respondExitPlanMode).toHaveBeenCalledWith(response)
  })
})
