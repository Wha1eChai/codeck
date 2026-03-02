// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSessionState } from '../useSessionState'
import { useSessionStore } from '../../stores/session-store'
import { installMockElectron, uninstallMockElectron } from '../../__test-utils__/mock-electron'
import type { MockElectronAPI } from '../../__test-utils__/mock-electron'
import type { MultiSessionManagerState } from '@common/multi-session-types'

let mockElectron: MockElectronAPI

describe('useSessionState', () => {
  beforeEach(() => {
    mockElectron = installMockElectron()
    useSessionStore.setState({
      sessions: [],
      currentSessionId: null,
      sessionStatus: 'idle',
      currentError: null,
      projectPath: null,
      sessionStates: {},
      openTabs: [],
      scrollPositions: {},
    })
  })

  afterEach(() => {
    uninstallMockElectron()
  })

  it('subscribes to onMultiSessionStateChanged on mount', () => {
    renderHook(() => useSessionState())
    expect(mockElectron.onMultiSessionStateChanged).toHaveBeenCalledTimes(1)
  })

  it('syncs multi-session state when event fires', () => {
    // Capture the callback registered by the hook
    let capturedCallback: ((state: MultiSessionManagerState) => void) | null = null
    mockElectron.onMultiSessionStateChanged.mockImplementation((cb: (state: MultiSessionManagerState) => void) => {
      capturedCallback = cb
      return () => {}
    })

    renderHook(() => useSessionState())
    expect(capturedCallback).not.toBeNull()

    // Simulate backend state change
    const multiState: MultiSessionManagerState = {
      activeSessions: {
        'sess-1': { sessionId: 'sess-1', projectPath: '/p', sdkSessionId: null, status: 'streaming', error: null },
      },
      focusedSessionId: 'sess-1',
      currentProjectPath: '/p',
    }

    capturedCallback!(multiState)

    const store = useSessionStore.getState()
    expect(store.currentSessionId).toBe('sess-1')
    expect(store.sessionStates['sess-1']?.status).toBe('streaming')
  })

  it('unsubscribes on unmount', () => {
    const unsubFn = vi.fn()
    mockElectron.onMultiSessionStateChanged.mockReturnValue(unsubFn)

    const { unmount } = renderHook(() => useSessionState())
    unmount()

    expect(unsubFn).toHaveBeenCalledTimes(1)
  })
})

// Need vi import
import { vi } from 'vitest'
