// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionActions } from '../useSessionActions'
import { useSessionStore } from '../../stores/session-store'
import { useMessageStore } from '../../stores/message-store'
import { useSettingsStore } from '../../stores/settings-store'
import { installMockElectron, uninstallMockElectron } from '../../__test-utils__/mock-electron'
import type { MockElectronAPI } from '../../__test-utils__/mock-electron'
import { DEFAULT_APP_PREFERENCES } from '@common/defaults'

let mockElectron: MockElectronAPI

describe('useSessionActions', () => {
  beforeEach(() => {
    mockElectron = installMockElectron()
    useSessionStore.setState({
      sessions: [],
      currentSessionId: null,
      sessionStatus: 'idle',
      currentError: null,
      projectPath: '/test/project',
      sessionStates: {},
      openTabs: [],
      scrollPositions: {},
    })
    useMessageStore.setState({ messages: {} })
    useSettingsStore.setState({
      settings: { ...DEFAULT_APP_PREFERENCES, defaultProjectPath: '/test/project' },
    })
  })

  afterEach(() => {
    uninstallMockElectron()
  })

  it('switchSession — calls IPC and updates store', async () => {
    mockElectron.switchSession.mockResolvedValueOnce({
      success: true,
      session: { id: 'sess-2', name: 'Session 2', projectPath: '/test', runtime: 'claude', permissionMode: 'default', createdAt: 1, updatedAt: 1 },
      messages: [{ id: 'msg-1', sessionId: 'sess-2', role: 'user', type: 'text', content: 'Hi', timestamp: 1 }],
    })

    useSessionStore.setState({
      sessions: [{ id: 'sess-1', name: 'S1', projectPath: '/test', runtime: 'claude', permissionMode: 'default', createdAt: 1, updatedAt: 1 }],
      currentSessionId: 'sess-1',
    })

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.switchSession('sess-2')
    })

    expect(mockElectron.switchSession).toHaveBeenCalledWith('sess-2')
    expect(useSessionStore.getState().currentSessionId).toBe('sess-2')
    expect(useMessageStore.getState().messages['sess-2']).toHaveLength(1)
  })

  it('switchSession — skips if already on the target session', async () => {
    useSessionStore.setState({ currentSessionId: 'sess-1' })

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.switchSession('sess-1')
    })

    expect(mockElectron.switchSession).not.toHaveBeenCalled()
  })

  it('createSession — calls IPC and adds tab', async () => {
    const mockSession = {
      id: 'new-sess',
      name: 'New Session',
      projectPath: '/test',
      runtime: 'claude' as const,
      permissionMode: 'default' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    mockElectron.createSession.mockResolvedValueOnce(mockSession)

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.createSession({
        name: 'New Session',
        projectPath: '/test',
        permissionMode: 'default',
      })
    })

    expect(mockElectron.createSession).toHaveBeenCalled()
    expect(mockElectron.resumeSession).toHaveBeenCalledWith('new-sess')
    expect(useSessionStore.getState().currentSessionId).toBe('new-sess')
    expect(useSessionStore.getState().openTabs).toHaveLength(1)
  })

  it('deleteSession — calls IPC and removes from store', async () => {
    useSessionStore.setState({
      sessions: [{ id: 'sess-1', name: 'S1', projectPath: '/test', runtime: 'claude', permissionMode: 'default', createdAt: 1, updatedAt: 1 }],
    })

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.deleteSession('sess-1')
    })

    expect(mockElectron.deleteSession).toHaveBeenCalledWith('sess-1')
    expect(useSessionStore.getState().sessions).toHaveLength(0)
  })

  it('closeSessionTab — removes tab and calls IPC', async () => {
    useSessionStore.setState({
      openTabs: [{ sessionId: 'sess-1', name: 'S1', status: 'idle' }],
    })

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.closeSessionTab('sess-1')
    })

    expect(useSessionStore.getState().openTabs).toHaveLength(0)
    expect(mockElectron.closeSessionTab).toHaveBeenCalledWith('sess-1')
  })

  it('quickCreateSession — creates session with defaults', async () => {
    const mockSession = {
      id: 'quick-sess',
      name: 'New Session',
      projectPath: '/test/project',
      runtime: 'claude' as const,
      permissionMode: 'default' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    mockElectron.createSession.mockResolvedValueOnce(mockSession)

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.quickCreateSession()
    })

    expect(mockElectron.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/test/project', permissionMode: 'default' }),
    )
  })

  it('quickCreateSession — returns null when no project path', async () => {
    useSessionStore.setState({ projectPath: null })
    useSettingsStore.setState({
      settings: { ...DEFAULT_APP_PREFERENCES, defaultProjectPath: undefined },
    })

    const { result } = renderHook(() => useSessionActions())

    let returnValue: unknown
    await act(async () => {
      returnValue = await result.current.quickCreateSession()
    })

    expect(returnValue).toBeNull()
    expect(mockElectron.createSession).not.toHaveBeenCalled()
  })

  it('refreshSessions — fetches fresh session list', async () => {
    const freshSessions = [
      { id: 's1', name: 'S1', projectPath: '/test', runtime: 'claude' as const, permissionMode: 'default' as const, createdAt: 1, updatedAt: 1 },
    ]
    mockElectron.getSessions.mockResolvedValueOnce(freshSessions)

    const { result } = renderHook(() => useSessionActions())

    await act(async () => {
      await result.current.refreshSessions()
    })

    expect(mockElectron.getSessions).toHaveBeenCalledWith('/test/project')
    expect(useSessionStore.getState().sessions).toHaveLength(1)
  })
})
