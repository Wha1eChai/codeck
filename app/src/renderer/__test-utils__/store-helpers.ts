// ============================================================
// Store Helpers — test 前重置全部 Zustand store 到初始状态
// ============================================================

import { useMessageStore } from '../stores/message-store'
import { useSessionStore } from '../stores/session-store'
import { useSettingsStore } from '../stores/settings-store'
import { useUIStore } from '../stores/ui-store'
import { DEFAULT_APP_PREFERENCES, DEFAULT_EXECUTION_OPTIONS, DEFAULT_HOOK_SETTINGS } from '@common/defaults'

/**
 * Reset all stores to their initial state.
 * Call this in beforeEach() to ensure test isolation.
 */
export function resetAllStores(): void {
  useMessageStore.setState({ messages: {} })

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

  useSettingsStore.setState({
    settings: DEFAULT_APP_PREFERENCES,
    isLoading: false,
    lastSaved: 0,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
    hookSettings: DEFAULT_HOOK_SETTINGS,
  })

  useUIStore.setState({
    activeSidebarPanel: 'sessions',
    priorSidebarPanel: 'sessions',
    sidebarCollapsed: false,
    pendingInteractions: {},
    pendingInteraction: null,
    timelineOpenSessions: new Set<string>(),
    activeView: 'chat',
    settingsSection: 'general',
    isProjectSelectorOpen: false,
    draftInput: '',
    chatScrollContainer: null,
  })
}
