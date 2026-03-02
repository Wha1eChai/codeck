import { beforeEach, describe, expect, it } from 'vitest'
import {
  useUIStore,
  permissionToPendingInteraction,
  askUserQuestionToPendingInteraction,
  exitPlanModeToPendingInteraction,
} from '../ui-store'
import type { PermissionRequest, AskUserQuestionRequest, ExitPlanModeRequest } from '@common/types'

describe('ui-store', () => {
  beforeEach(() => {
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
  })

  // ── Sidebar ──

  it('setActiveSidebarPanel — sets panel', () => {
    useUIStore.getState().setActiveSidebarPanel('files')
    expect(useUIStore.getState().activeSidebarPanel).toBe('files')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('setActiveSidebarPanel — null collapses sidebar', () => {
    useUIStore.getState().setActiveSidebarPanel(null)
    expect(useUIStore.getState().activeSidebarPanel).toBeNull()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
  })

  it('toggleSidebarPanel — toggles same panel to null', () => {
    useUIStore.getState().toggleSidebarPanel('sessions')
    expect(useUIStore.getState().activeSidebarPanel).toBeNull()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
  })

  it('toggleSidebarPanel — switches to different panel', () => {
    useUIStore.getState().toggleSidebarPanel('files')
    expect(useUIStore.getState().activeSidebarPanel).toBe('files')
  })

  it('toggleSidebarPanel — exits settings and opens panel', () => {
    useUIStore.setState({ activeView: 'settings' })
    useUIStore.getState().toggleSidebarPanel('history')
    const state = useUIStore.getState()
    expect(state.activeView).toBe('chat')
    expect(state.activeSidebarPanel).toBe('history')
  })

  it('toggleSidebar — collapses when open', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().activeSidebarPanel).toBeNull()
  })

  it('toggleSidebar — opens when collapsed', () => {
    useUIStore.setState({ activeSidebarPanel: null })
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().activeSidebarPanel).toBe('sessions')
  })

  it('setSidebarCollapsed — collapses/expands', () => {
    useUIStore.getState().setSidebarCollapsed(true)
    expect(useUIStore.getState().activeSidebarPanel).toBeNull()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)

    useUIStore.getState().setSidebarCollapsed(false)
    expect(useUIStore.getState().activeSidebarPanel).toBe('sessions')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  // ── Timeline ──

  it('toggleTimeline — toggles per-session timeline state', () => {
    useUIStore.getState().toggleTimeline('sess-1')
    expect(useUIStore.getState().isTimelineOpen('sess-1')).toBe(true)

    useUIStore.getState().toggleTimeline('sess-1')
    expect(useUIStore.getState().isTimelineOpen('sess-1')).toBe(false)
  })

  it('setTimelineOpen — explicitly sets timeline state', () => {
    useUIStore.getState().setTimelineOpen('sess-1', true)
    expect(useUIStore.getState().isTimelineOpen('sess-1')).toBe(true)

    useUIStore.getState().setTimelineOpen('sess-1', false)
    expect(useUIStore.getState().isTimelineOpen('sess-1')).toBe(false)
  })

  // ── Interactions ──

  it('setPendingInteraction — sets per-session interaction', () => {
    const interaction = permissionToPendingInteraction({
      id: 'req-1',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
      description: 'Run ls',
      risk: 'low',
    })

    useUIStore.getState().setPendingInteraction(interaction, 'sess-1')
    const state = useUIStore.getState()
    expect(state.pendingInteractions['sess-1']).toBeDefined()
    expect(state.pendingInteraction).toBeDefined()
  })

  it('clearPendingInteraction — clears per-session interaction', () => {
    const interaction = permissionToPendingInteraction({
      id: 'req-1',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
      description: 'Run ls',
      risk: 'low',
    })

    useUIStore.getState().setPendingInteraction(interaction, 'sess-1')
    useUIStore.getState().clearPendingInteraction('sess-1')

    const state = useUIStore.getState()
    expect(state.pendingInteractions['sess-1']).toBeUndefined()
    expect(state.pendingInteraction).toBeNull()
  })

  it('getInteractionForSession — returns interaction by sessionId', () => {
    const interaction = permissionToPendingInteraction({
      id: 'req-1',
      toolName: 'Read',
      toolInput: { file_path: '/a.ts' },
      description: 'Read file',
      risk: 'low',
    })

    useUIStore.getState().setPendingInteraction(interaction, 'sess-1')
    expect(useUIStore.getState().getInteractionForSession('sess-1')).toBeDefined()
    expect(useUIStore.getState().getInteractionForSession('sess-2')).toBeNull()
  })

  it('advanceAskUserQuestion — advances to next question', () => {
    const req: AskUserQuestionRequest = {
      id: 'ask-1',
      toolUseId: 'tu-1',
      questions: [
        {
          question: 'Q1?',
          header: 'H1',
          options: [{ label: 'A', description: 'desc A' }],
          multiSelect: false,
        },
        {
          question: 'Q2?',
          header: 'H2',
          options: [{ label: 'B', description: 'desc B' }],
          multiSelect: true,
        },
      ],
    }

    const interaction = askUserQuestionToPendingInteraction(req)
    useUIStore.getState().setPendingInteraction(interaction, 'sess-1')

    useUIStore.getState().advanceAskUserQuestion(1, 'sess-1')
    const advanced = useUIStore.getState().pendingInteractions['sess-1']
    expect(advanced.questionIndex).toBe(1)
    expect(advanced.title).toBe('H2')
    expect(advanced.multiSelect).toBe(true)
  })

  it('advanceAskUserQuestion — clears when past last question', () => {
    const req: AskUserQuestionRequest = {
      id: 'ask-1',
      toolUseId: 'tu-1',
      questions: [
        {
          question: 'Q1?',
          header: 'H1',
          options: [{ label: 'A', description: 'desc A' }],
          multiSelect: false,
        },
      ],
    }

    const interaction = askUserQuestionToPendingInteraction(req)
    useUIStore.getState().setPendingInteraction(interaction, 'sess-1')

    useUIStore.getState().advanceAskUserQuestion(1, 'sess-1')
    expect(useUIStore.getState().pendingInteractions['sess-1']).toBeUndefined()
  })

  // ── View routing ──

  it('setActiveView — switches to settings and back', () => {
    useUIStore.getState().setActiveView('settings')
    let state = useUIStore.getState()
    expect(state.activeView).toBe('settings')
    expect(state.activeSidebarPanel).toBeNull()
    expect(state.priorSidebarPanel).toBe('sessions')

    useUIStore.getState().setActiveView('chat')
    state = useUIStore.getState()
    expect(state.activeView).toBe('chat')
    expect(state.activeSidebarPanel).toBe('sessions')
  })

  it('toggleSettings — toggles settings view', () => {
    useUIStore.getState().toggleSettings()
    expect(useUIStore.getState().activeView).toBe('settings')

    useUIStore.getState().toggleSettings()
    expect(useUIStore.getState().activeView).toBe('chat')
  })

  it('setSettingsSection — switches settings section', () => {
    useUIStore.getState().setSettingsSection('models')
    expect(useUIStore.getState().settingsSection).toBe('models')
  })

  // ── Dialog / misc ──

  it('setProjectSelectorOpen — toggles project selector', () => {
    useUIStore.getState().setProjectSelectorOpen(true)
    expect(useUIStore.getState().isProjectSelectorOpen).toBe(true)
  })

  it('setDraftInput — stores draft', () => {
    useUIStore.getState().setDraftInput('hello world')
    expect(useUIStore.getState().draftInput).toBe('hello world')
  })

  it('setChatScrollContainer — stores element reference', () => {
    const el = {} as HTMLElement
    useUIStore.getState().setChatScrollContainer(el)
    expect(useUIStore.getState().chatScrollContainer).toBe(el)
  })
})

// ── Mapper functions ──

describe('permissionToPendingInteraction', () => {
  it('creates permission interaction with risk-based defaults', () => {
    const req: PermissionRequest = {
      id: 'req-1',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf /' },
      description: 'Delete everything',
      risk: 'high',
    }

    const result = permissionToPendingInteraction(req)
    expect(result.kind).toBe('permission')
    expect(result.title).toBe('Use Bash?')
    expect(result.risk).toBe('high')
    expect(result.options[0].highlighted).toBe(false) // Allow not highlighted for high risk
    expect(result.options[1].highlighted).toBe(true)  // Deny highlighted for high risk
  })

  it('highlights Allow for low risk', () => {
    const req: PermissionRequest = {
      id: 'req-1',
      toolName: 'Read',
      toolInput: { file_path: '/a.ts' },
      description: 'Read file',
      risk: 'low',
    }

    const result = permissionToPendingInteraction(req)
    expect(result.options[0].highlighted).toBe(true)  // Allow highlighted
    expect(result.options[1].highlighted).toBe(false)
  })
})

describe('askUserQuestionToPendingInteraction', () => {
  it('creates first question step', () => {
    const req: AskUserQuestionRequest = {
      id: 'ask-1',
      toolUseId: 'tu-1',
      questions: [
        {
          question: 'Which framework?',
          header: 'Framework',
          options: [
            { label: 'React', description: 'A library' },
            { label: 'Vue', description: 'Another library' },
          ],
          multiSelect: false,
        },
      ],
    }

    const result = askUserQuestionToPendingInteraction(req)
    expect(result.kind).toBe('askUserQuestion')
    expect(result.questionIndex).toBe(0)
    expect(result.totalQuestions).toBe(1)
    expect(result.options).toHaveLength(2)
  })
})

describe('exitPlanModeToPendingInteraction', () => {
  it('creates plan mode interaction with 4 options', () => {
    const req: ExitPlanModeRequest = {
      id: 'plan-1',
      toolUseId: 'tu-1',
    }

    const result = exitPlanModeToPendingInteraction(req)
    expect(result.kind).toBe('exitPlanMode')
    expect(result.options).toHaveLength(4)
    expect(result.options[0].label).toContain('compact')
  })
})
