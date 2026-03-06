import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '../session-store'
import type { Session } from '@common/types'
import type { ActiveSessionState, MultiSessionManagerState, SessionTab } from '@common/multi-session-types'

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: overrides?.id ?? 'sess-1',
    name: overrides?.name ?? 'Test Session',
    projectPath: '/test/project',
    runtime: 'claude',
    permissionMode: 'default',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeActiveState(overrides?: Partial<ActiveSessionState>): ActiveSessionState {
  return {
    sessionId: 'sess-1',
    projectPath: '/test/project',
    sdkSessionId: null,
    status: 'idle',
    error: null,
    ...overrides,
  }
}

function makeTab(overrides?: Partial<SessionTab>): SessionTab {
  return {
    sessionId: 'sess-1',
    name: 'Tab 1',
    status: 'idle',
    ...overrides,
  }
}

describe('session-store', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      currentSessionId: null,
      sessionStatus: 'idle',
      currentError: null,
      projectPath: null,
      sessionStates: {},
      openTabs: [],
      scrollPositions: {},
      sessionMetadataMap: {},
    })
  })

  // ── Basic state ──

  it('setSessions — sets session list', () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })]
    useSessionStore.getState().setSessions(sessions)
    expect(useSessionStore.getState().sessions).toHaveLength(2)
  })

  it('setCurrentSession — sets current session ID and resets status', () => {
    useSessionStore.setState({ sessionStatus: 'streaming', currentError: 'old error' })
    useSessionStore.getState().setCurrentSession('sess-1')
    const state = useSessionStore.getState()
    expect(state.currentSessionId).toBe('sess-1')
    expect(state.sessionStatus).toBe('idle')
    expect(state.currentError).toBeNull()
  })

  it('setProjectPath — sets project path', () => {
    useSessionStore.getState().setProjectPath('/new/path')
    expect(useSessionStore.getState().projectPath).toBe('/new/path')
  })

  it('setProjectPath — clears metadata to prevent cross-project pollution', () => {
    const { setSessionMetadata, setProjectPath } = useSessionStore.getState()
    setSessionMetadata('s1', { sessionId: 's1', slashCommands: ['compact'] })
    expect(useSessionStore.getState().globalMetadata).not.toBeNull()

    setProjectPath('/different/project')
    const state = useSessionStore.getState()
    expect(state.globalMetadata).toBeNull()
    expect(state.sessionMetadataMap).toEqual({})
  })

  // ── syncStatus ──

  it('syncStatus — updates focused session status', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStates: { 'sess-1': makeActiveState() },
      openTabs: [makeTab()],
    })

    useSessionStore.getState().syncStatus({ sessionId: 'sess-1', status: 'streaming' })
    const state = useSessionStore.getState()
    expect(state.sessionStatus).toBe('streaming')
    expect(state.sessionStates['sess-1'].status).toBe('streaming')
    expect(state.openTabs[0].status).toBe('streaming')
  })

  it('syncStatus — ignores non-focused session for top-level status', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'idle',
    })

    useSessionStore.getState().syncStatus({ sessionId: 'other', status: 'streaming' })
    expect(useSessionStore.getState().sessionStatus).toBe('idle')
  })

  // ── removeSession ──

  it('removeSession — removes from sessions, tabs, and states', () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: 'sess-1' }), makeSession({ id: 'sess-2' })],
      currentSessionId: 'sess-1',
      openTabs: [makeTab({ sessionId: 'sess-1' }), makeTab({ sessionId: 'sess-2', name: 'Tab 2' })],
      sessionStates: {
        'sess-1': makeActiveState({ sessionId: 'sess-1' }),
        'sess-2': makeActiveState({ sessionId: 'sess-2' }),
      },
    })

    useSessionStore.getState().removeSession('sess-1')
    const state = useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.currentSessionId).toBeNull()
    expect(state.openTabs).toHaveLength(1)
    expect(state.sessionStates['sess-1']).toBeUndefined()
  })

  // ── updateSession ──

  it('updateSession — updates session properties and syncs tab name', () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: 'sess-1', name: 'Old Name' })],
      openTabs: [makeTab({ sessionId: 'sess-1', name: 'Old Name' })],
    })

    useSessionStore.getState().updateSession('sess-1', { name: 'New Name' })
    const state = useSessionStore.getState()
    expect(state.sessions[0].name).toBe('New Name')
    expect(state.openTabs[0].name).toBe('New Name')
  })

  // ── syncMultiSessionState ──

  it('syncMultiSessionState — syncs backend state and auto-creates tabs', () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: 'sess-1', name: 'Session 1' })],
    })

    const multiState: MultiSessionManagerState = {
      activeSessions: {
        'sess-1': makeActiveState({ sessionId: 'sess-1', status: 'streaming' }),
      },
      focusedSessionId: 'sess-1',
      currentProjectPath: '/test/project',
    }

    useSessionStore.getState().syncMultiSessionState(multiState)
    const state = useSessionStore.getState()
    expect(state.currentSessionId).toBe('sess-1')
    expect(state.sessionStatus).toBe('streaming')
    expect(state.openTabs).toHaveLength(1)
    expect(state.openTabs[0].sessionId).toBe('sess-1')
  })

  it('syncMultiSessionState — does not duplicate existing tabs', () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: 'sess-1' })],
      openTabs: [makeTab({ sessionId: 'sess-1' })],
    })

    const multiState: MultiSessionManagerState = {
      activeSessions: { 'sess-1': makeActiveState({ sessionId: 'sess-1' }) },
      focusedSessionId: 'sess-1',
      currentProjectPath: '/test/project',
    }

    useSessionStore.getState().syncMultiSessionState(multiState)
    expect(useSessionStore.getState().openTabs).toHaveLength(1)
  })

  // ── Tab management ──

  it('addTab — adds tab and prevents duplicates', () => {
    const tab = makeTab({ sessionId: 'sess-1' })
    useSessionStore.getState().addTab(tab)
    useSessionStore.getState().addTab(tab) // duplicate
    expect(useSessionStore.getState().openTabs).toHaveLength(1)
  })

  it('removeTab — removes tab and focuses last remaining', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      openTabs: [
        makeTab({ sessionId: 'sess-1' }),
        makeTab({ sessionId: 'sess-2', name: 'Tab 2' }),
      ],
    })

    useSessionStore.getState().removeTab('sess-1')
    const state = useSessionStore.getState()
    expect(state.openTabs).toHaveLength(1)
    expect(state.currentSessionId).toBe('sess-2')
  })

  it('removeTab — sets null when no tabs remain', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      openTabs: [makeTab({ sessionId: 'sess-1' })],
    })

    useSessionStore.getState().removeTab('sess-1')
    expect(useSessionStore.getState().currentSessionId).toBeNull()
  })

  it('setFocusedTab — switches focused session and derives status', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStates: {
        'sess-2': makeActiveState({ sessionId: 'sess-2', status: 'streaming', error: 'test error' }),
      },
    })

    useSessionStore.getState().setFocusedTab('sess-2')
    const state = useSessionStore.getState()
    expect(state.currentSessionId).toBe('sess-2')
    expect(state.sessionStatus).toBe('streaming')
    expect(state.currentError).toBe('test error')
  })

  it('reorderTabs — reorders tabs', () => {
    const tabs = [
      makeTab({ sessionId: 'sess-1' }),
      makeTab({ sessionId: 'sess-2', name: 'Tab 2' }),
    ]
    useSessionStore.setState({ openTabs: tabs })

    const reversed = [...tabs].reverse()
    useSessionStore.getState().reorderTabs(reversed)
    expect(useSessionStore.getState().openTabs[0].sessionId).toBe('sess-2')
  })

  it('updateTabStatus — updates specific tab status', () => {
    useSessionStore.setState({
      openTabs: [makeTab({ sessionId: 'sess-1', status: 'idle' })],
    })

    useSessionStore.getState().updateTabStatus('sess-1', 'streaming')
    expect(useSessionStore.getState().openTabs[0].status).toBe('streaming')
  })

  // ── Scroll positions ──

  it('saveScrollPosition — saves and can be read', () => {
    useSessionStore.getState().saveScrollPosition('sess-1', 500)
    expect(useSessionStore.getState().scrollPositions['sess-1']).toBe(500)
  })

  // ── Session metadata ──

  it('should store and retrieve session metadata', () => {
    const { setSessionMetadata } = useSessionStore.getState()
    const metadata = { sessionId: 'test-1', model: 'claude-opus-4-6', tools: ['Read', 'Write'], slashCommands: ['/compact', '/clear'] }
    setSessionMetadata('test-1', metadata)
    expect(useSessionStore.getState().sessionMetadataMap['test-1']).toEqual(metadata)
  })

  it('should store metadata for multiple sessions independently', () => {
    const { setSessionMetadata } = useSessionStore.getState()
    setSessionMetadata('s1', { sessionId: 's1', model: 'opus' })
    setSessionMetadata('s2', { sessionId: 's2', model: 'sonnet' })
    const state = useSessionStore.getState()
    expect(state.sessionMetadataMap['s1']?.model).toBe('opus')
    expect(state.sessionMetadataMap['s2']?.model).toBe('sonnet')
  })

  // ── globalMetadata cache ──

  describe('globalMetadata cache', () => {
    it('should update globalMetadata when setSessionMetadata is called', () => {
      const { setSessionMetadata } = useSessionStore.getState()
      setSessionMetadata('s1', { sessionId: 's1', slashCommands: ['compact', 'model'] })
      expect(useSessionStore.getState().globalMetadata?.slashCommands).toEqual(['compact', 'model'])
    })

    it('should always reflect the latest session metadata', () => {
      const { setSessionMetadata } = useSessionStore.getState()
      setSessionMetadata('s1', { sessionId: 's1', slashCommands: ['compact'] })
      setSessionMetadata('s2', { sessionId: 's2', slashCommands: ['compact', 'model', 'debug'] })
      expect(useSessionStore.getState().globalMetadata?.sessionId).toBe('s2')
    })

    it('should persist after session removal', () => {
      useSessionStore.setState({
        sessions: [{ id: 's1', name: 'Test', projectPath: '/test', runtime: 'claude', permissionMode: 'default', createdAt: Date.now(), updatedAt: Date.now() }],
      })
      const { setSessionMetadata, removeSession } = useSessionStore.getState()
      setSessionMetadata('s1', { sessionId: 's1', slashCommands: ['compact', 'model'] })
      removeSession('s1')
      expect(useSessionStore.getState().globalMetadata).not.toBeNull()
    })
  })
})
