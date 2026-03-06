import { create } from 'zustand'
import { Session, SessionStatus, SessionState } from '@common/types'
import type { SessionMetadata } from '@common/types'
import type { ActiveSessionState, SessionTab, MultiSessionManagerState } from '@common/multi-session-types'

const EMPTY_SESSION_STATES: Readonly<Record<string, ActiveSessionState>> = {}
const EMPTY_TABS: readonly SessionTab[] = []
const EMPTY_METADATA_MAP: Readonly<Record<string, SessionMetadata>> = {}

interface SessionStore {
  sessions: Session[]
  currentSessionId: string | null
  sessionStatus: SessionStatus
  currentError: string | null
  projectPath: string | null

  // Multi-session state
  sessionStates: Readonly<Record<string, ActiveSessionState>>
  openTabs: readonly SessionTab[]
  scrollPositions: Readonly<Record<string, number>>

  // Session metadata (from SDK system/init)
  sessionMetadataMap: Readonly<Record<string, SessionMetadata>>
  globalMetadata: SessionMetadata | null

  setSessions: (sessions: Session[]) => void
  setCurrentSession: (id: string | null) => void
  setProjectPath: (path: string) => void
  syncStatus: (state: SessionState) => void
  removeSession: (id: string) => void
  updateSession: (id: string, partial: Partial<Session>) => void

  // Multi-session actions
  syncMultiSessionState: (state: MultiSessionManagerState) => void
  addTab: (tab: SessionTab) => void
  removeTab: (sessionId: string) => void
  setFocusedTab: (sessionId: string) => void
  reorderTabs: (tabs: readonly SessionTab[]) => void
  updateTabStatus: (sessionId: string, status: SessionStatus) => void
  saveScrollPosition: (sessionId: string, position: number) => void

  // Session metadata actions
  setSessionMetadata: (sessionId: string, metadata: SessionMetadata) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  currentSessionId: null,
  sessionStatus: 'idle',
  currentError: null,
  projectPath: null,

  // Multi-session initial state
  sessionStates: EMPTY_SESSION_STATES,
  openTabs: EMPTY_TABS,
  scrollPositions: {},
  sessionMetadataMap: EMPTY_METADATA_MAP,
  globalMetadata: null,

  setSessions: (sessions) => set({ sessions }),

  setProjectPath: (path) => set({
    projectPath: path,
    globalMetadata: null,
    sessionMetadataMap: EMPTY_METADATA_MAP,
  }),

  setCurrentSession: (id) => set({
    currentSessionId: id,
    sessionStatus: 'idle',
    currentError: null
  }),

  syncStatus: (state) => set((store) => {
    const updates: Partial<SessionStore> = {}

    // Update focused session status
    if (store.currentSessionId === state.sessionId) {
      updates.sessionStatus = state.status
      updates.currentError = state.error || null
    }

    // Update multi-session state map
    const existing = store.sessionStates[state.sessionId]
    if (existing) {
      updates.sessionStates = {
        ...store.sessionStates,
        [state.sessionId]: {
          ...existing,
          status: state.status,
          error: state.error || null,
        },
      }
    }

    // Update tab status
    if (store.openTabs.some(t => t.sessionId === state.sessionId)) {
      updates.openTabs = store.openTabs.map(t =>
        t.sessionId === state.sessionId ? { ...t, status: state.status } : t,
      )
    }

    return updates
  }),

  removeSession: (id) => set((state) => {
    const { [id]: _, ...restStates } = state.sessionStates
    const { [id]: _meta, ...restMetadata } = state.sessionMetadataMap
    return {
      sessions: state.sessions.filter(s => s.id !== id),
      currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
      openTabs: state.openTabs.filter(t => t.sessionId !== id),
      sessionStates: restStates,
      sessionMetadataMap: restMetadata,
    }
  }),

  updateSession: (id, partial) => set((state) => ({
    sessions: state.sessions.map(s => s.id === id ? { ...s, ...partial } : s),
    openTabs: state.openTabs.map(t =>
      t.sessionId === id && partial.name ? { ...t, name: partial.name } : t,
    ),
  })),

  // ── Multi-session actions ──

  syncMultiSessionState: (state) => set((store) => {
    // Auto-create tabs for active sessions that don't have tabs yet
    const existingTabIds = new Set(store.openTabs.map(t => t.sessionId))
    const newTabs: SessionTab[] = []
    for (const [sessionId, activeState] of Object.entries(state.activeSessions)) {
      if (!existingTabIds.has(sessionId)) {
        const session = store.sessions.find(s => s.id === sessionId)
        newTabs.push({
          sessionId,
          name: session?.name ?? sessionId.slice(0, 8),
          status: activeState.status,
        })
      }
    }
    const updatedTabs = newTabs.length > 0
      ? [...store.openTabs, ...newTabs]
      : store.openTabs

    return {
      sessionStates: state.activeSessions,
      currentSessionId: state.focusedSessionId,
      projectPath: state.currentProjectPath,
      openTabs: updatedTabs,
      // Derive focused session status from the map
      sessionStatus: state.focusedSessionId
        ? state.activeSessions[state.focusedSessionId]?.status ?? 'idle'
        : store.sessionStatus,
      currentError: state.focusedSessionId
        ? state.activeSessions[state.focusedSessionId]?.error ?? null
        : store.currentError,
    }
  }),

  addTab: (tab) => set((state) => {
    // Don't duplicate
    if (state.openTabs.some(t => t.sessionId === tab.sessionId)) {
      return {}
    }
    return { openTabs: [...state.openTabs, tab] }
  }),

  removeTab: (sessionId) => set((state) => {
    const filtered = state.openTabs.filter(t => t.sessionId !== sessionId)
    const updates: Partial<SessionStore> = { openTabs: filtered }

    // If removing the focused tab, focus the last remaining tab
    if (state.currentSessionId === sessionId && filtered.length > 0) {
      const lastTab = filtered[filtered.length - 1]
      updates.currentSessionId = lastTab.sessionId
    } else if (filtered.length === 0) {
      updates.currentSessionId = null
    }

    return updates
  }),

  setFocusedTab: (sessionId) => set((state) => {
    if (state.currentSessionId === sessionId) return {}
    const matchingState = state.sessionStates[sessionId]
    return {
      currentSessionId: sessionId,
      sessionStatus: matchingState?.status ?? 'idle',
      currentError: matchingState?.error ?? null,
    }
  }),

  reorderTabs: (tabs) => set({ openTabs: tabs }),

  updateTabStatus: (sessionId, status) => set((state) => ({
    openTabs: state.openTabs.map(t =>
      t.sessionId === sessionId ? { ...t, status } : t,
    ),
  })),

  saveScrollPosition: (sessionId, position) => set((state) => ({
    scrollPositions: { ...state.scrollPositions, [sessionId]: position },
  })),

  // ── Session metadata ──

  setSessionMetadata: (sessionId, metadata) => set((state) => ({
    sessionMetadataMap: { ...state.sessionMetadataMap, [sessionId]: metadata },
    globalMetadata: metadata,
  })),
}))
