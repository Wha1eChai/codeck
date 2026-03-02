import { create } from 'zustand'
import { PermissionRequest, AskUserQuestionRequest, AskUserQuestionItem, ExitPlanModeRequest } from '@common/types'
import type { SidebarPanel } from '@common/multi-session-types'
import type { SettingsSection } from '../components/settings/types'

type ActiveView = 'chat' | 'settings'

// ── Unified Interaction Model ──
// Frontend-only model; not an IPC type. Created by mapping IPC payloads.

export interface InteractionOption {
  label: string
  description?: string
  highlighted?: boolean
}

export interface PendingInteraction {
  kind: 'permission' | 'askUserQuestion' | 'exitPlanMode'
  requestId: string
  toolUseId?: string

  // Display
  title: string
  description?: string
  options: InteractionOption[]
  allowCustomInput: boolean
  multiSelect: boolean

  // AskUserQuestion multi-step state
  questionIndex?: number
  totalQuestions?: number
  allQuestions?: AskUserQuestionItem[]

  // ExitPlanMode
  allowedPrompts?: { tool: string; prompt: string }[]

  // Permission-specific
  risk?: 'low' | 'medium' | 'high'
  rememberLabel?: string
}

// ── Mappers: IPC payload → PendingInteraction ──

export function permissionToPendingInteraction(req: PermissionRequest): PendingInteraction {
  return {
    kind: 'permission',
    requestId: req.id,
    toolUseId: req.toolUseId,
    title: `Use ${req.toolName}?`,
    description: req.description,
    options: [
      { label: 'Allow', highlighted: req.risk !== 'high' },
      { label: 'Deny', highlighted: req.risk === 'high' },
    ],
    allowCustomInput: false,
    multiSelect: false,
    risk: req.risk,
    rememberLabel: req.risk === 'high'
      ? `Remember: allow this exact ${req.toolName} input this session`
      : `Remember: allow all ${req.toolName} calls this session`,
  }
}

function buildAskUserQuestionStep(
  req: AskUserQuestionRequest,
  questionIndex: number,
): PendingInteraction {
  const item = req.questions[questionIndex]
  return {
    kind: 'askUserQuestion',
    requestId: req.id,
    toolUseId: req.toolUseId,
    title: item.header || item.question,
    description: item.header ? item.question : undefined,
    options: item.options.map(o => ({ label: o.label, description: o.description })),
    allowCustomInput: false,
    multiSelect: item.multiSelect,
    questionIndex,
    totalQuestions: req.questions.length,
    allQuestions: req.questions as AskUserQuestionItem[],
  }
}

export function askUserQuestionToPendingInteraction(req: AskUserQuestionRequest): PendingInteraction {
  return buildAskUserQuestionStep(req, 0)
}

export function exitPlanModeToPendingInteraction(req: ExitPlanModeRequest): PendingInteraction {
  return {
    kind: 'exitPlanMode',
    requestId: req.id,
    toolUseId: req.toolUseId,
    title: 'Accept this plan?',
    options: [
      { label: 'Yes, compact & execute', description: 'Compress context then implement', highlighted: true },
      { label: 'Yes, and auto-accept', description: 'Implement with auto file edits' },
      { label: 'Yes, manually approve', description: 'Implement step by step' },
      { label: 'No, keep planning', description: 'Stay in plan mode' },
    ],
    allowCustomInput: false,
    multiSelect: false,
    allowedPrompts: req.allowedPrompts as { tool: string; prompt: string }[] | undefined,
  }
}

// ── Store ──

interface UIStore {
  // Sidebar — new Activity Bar + Panel model
  activeSidebarPanel: SidebarPanel
  /** Saved panel before entering settings, restored on exit */
  priorSidebarPanel: SidebarPanel
  /** Backward compat: true when activeSidebarPanel === null */
  sidebarCollapsed: boolean

  // Per-session pending interactions
  pendingInteractions: Readonly<Record<string, PendingInteraction>>
  /** Backward compat: interaction for focused session (set explicitly on change) */
  pendingInteraction: PendingInteraction | null

  /** Per-session timeline panel open state (pure frontend, not synced from backend). */
  timelineOpenSessions: ReadonlySet<string>

  // View routing
  activeView: ActiveView
  settingsSection: SettingsSection

  // Dialog visibility states
  isProjectSelectorOpen: boolean

  // Sidebar panel controls
  setActiveSidebarPanel: (panel: SidebarPanel) => void
  toggleSidebarPanel: (panel: 'sessions' | 'files' | 'history') => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void

  toggleTimeline: (sessionId: string) => void
  setTimelineOpen: (sessionId: string, open: boolean) => void
  isTimelineOpen: (sessionId: string) => boolean

  // Interaction management (session-scoped)
  setPendingInteraction: (interaction: PendingInteraction | null, sessionId?: string) => void
  clearPendingInteraction: (sessionId: string) => void
  advanceAskUserQuestion: (nextIndex: number, sessionId?: string) => void
  /** Get interaction for a specific session */
  getInteractionForSession: (sessionId: string) => PendingInteraction | null

  setActiveView: (view: ActiveView) => void
  toggleSettings: () => void
  setSettingsSection: (section: SettingsSection) => void
  setProjectSelectorOpen: (open: boolean) => void

  draftInput: string
  setDraftInput: (input: string) => void

  /** The DOM element for the chat scroll container — set by ChatContainer on mount for timeline sync. */
  chatScrollContainer: HTMLElement | null
  setChatScrollContainer: (el: HTMLElement | null) => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  activeSidebarPanel: 'sessions',
  priorSidebarPanel: 'sessions',
  sidebarCollapsed: false,
  pendingInteractions: {},
  pendingInteraction: null,
  timelineOpenSessions: new Set<string>(),
  activeView: 'chat',
  settingsSection: 'general',
  isProjectSelectorOpen: false,

  setActiveSidebarPanel: (panel) => set({
    activeSidebarPanel: panel,
    sidebarCollapsed: panel === null,
  }),

  toggleSidebarPanel: (panel) => set((state) => {
    if (state.activeView === 'settings') {
      // Exit settings and open the requested panel directly
      return {
        activeView: 'chat',
        activeSidebarPanel: panel,
        priorSidebarPanel: panel,
        sidebarCollapsed: false,
      }
    }
    const next = state.activeSidebarPanel === panel ? null : panel
    return { activeSidebarPanel: next, sidebarCollapsed: next === null }
  }),

  toggleSidebar: () => set((state) => {
    const next = state.activeSidebarPanel === null ? 'sessions' as SidebarPanel : null
    return { activeSidebarPanel: next, sidebarCollapsed: next === null }
  }),

  setSidebarCollapsed: (collapsed) => set({
    activeSidebarPanel: collapsed ? null : 'sessions',
    sidebarCollapsed: collapsed,
  }),

  toggleTimeline: (sessionId) => set((state) => {
    const next = new Set(state.timelineOpenSessions)
    if (next.has(sessionId)) next.delete(sessionId)
    else next.add(sessionId)
    return { timelineOpenSessions: next }
  }),
  setTimelineOpen: (sessionId, open) => set((state) => {
    const next = new Set(state.timelineOpenSessions)
    if (open) next.add(sessionId)
    else next.delete(sessionId)
    return { timelineOpenSessions: next }
  }),
  isTimelineOpen: (sessionId) => get().timelineOpenSessions.has(sessionId),

  setPendingInteraction: (interaction, sessionId?) => {
    if (!sessionId) {
      // Legacy path: set global pendingInteraction directly
      set({ pendingInteraction: interaction })
      return
    }
    if (!interaction) {
      set((state) => {
        const { [sessionId]: _, ...rest } = state.pendingInteractions
        return {
          pendingInteractions: rest,
          // Clear global if it was for this session
          pendingInteraction: state.pendingInteraction?.requestId === _?.requestId ? null : state.pendingInteraction,
        }
      })
    } else {
      set((state) => ({
        pendingInteractions: { ...state.pendingInteractions, [sessionId]: interaction },
        // Also set global for backward compat — focused session gets the slot
        pendingInteraction: interaction,
      }))
    }
  },

  clearPendingInteraction: (sessionId) => set((state) => {
    const cleared = state.pendingInteractions[sessionId]
    const { [sessionId]: _, ...rest } = state.pendingInteractions
    return {
      pendingInteractions: rest,
      pendingInteraction: state.pendingInteraction?.requestId === cleared?.requestId ? null : state.pendingInteraction,
    }
  }),

  advanceAskUserQuestion: (nextIndex: number, sessionId?) => {
    const interactions = get().pendingInteractions
    // Find the right interaction
    let sid = sessionId
    let current: PendingInteraction | undefined | null

    if (sid) {
      current = interactions[sid]
    } else {
      // Legacy path: use the global pendingInteraction
      current = get().pendingInteraction
      if (current) {
        // Find which session this belongs to
        sid = Object.keys(interactions).find(k => interactions[k].requestId === current!.requestId)
      }
    }

    if (!current || current.kind !== 'askUserQuestion' || !current.allQuestions) return

    if (nextIndex >= current.allQuestions.length) {
      if (sid) {
        set((state) => {
          const { [sid!]: _, ...rest } = state.pendingInteractions
          return { pendingInteractions: rest, pendingInteraction: null }
        })
      } else {
        set({ pendingInteraction: null })
      }
      return
    }

    const item = current.allQuestions[nextIndex]
    const updated: PendingInteraction = {
      ...current,
      title: item.header || item.question,
      description: item.header ? item.question : undefined,
      options: item.options.map(o => ({ label: o.label, description: o.description })),
      multiSelect: item.multiSelect,
      questionIndex: nextIndex,
    }

    if (sid) {
      set((state) => ({
        pendingInteractions: { ...state.pendingInteractions, [sid!]: updated },
        pendingInteraction: updated,
      }))
    } else {
      set({ pendingInteraction: updated })
    }
  },

  getInteractionForSession: (sessionId) => {
    return get().pendingInteractions[sessionId] ?? null
  },

  setActiveView: (view) => set((state) => {
    if (view === 'settings') {
      return {
        activeView: view,
        priorSidebarPanel: state.activeSidebarPanel,
        activeSidebarPanel: null,
        sidebarCollapsed: true,
      }
    }
    return {
      activeView: view,
      activeSidebarPanel: state.priorSidebarPanel,
      sidebarCollapsed: state.priorSidebarPanel === null,
    }
  }),
  toggleSettings: () => {
    const { activeView } = get()
    get().setActiveView(activeView === 'settings' ? 'chat' : 'settings')
  },
  setSettingsSection: (section) => set({ settingsSection: section }),
  setProjectSelectorOpen: (open) => set({ isProjectSelectorOpen: open }),

  draftInput: '',
  setDraftInput: (input) => set({ draftInput: input }),

  chatScrollContainer: null,
  setChatScrollContainer: (el) => set({ chatScrollContainer: el }),
}))
