import type { Message } from '@common/types'
import { AI_GROUP_TYPES } from './conversation-reducer/types'
import type { ConversationGroupView, UserGroupSubtype, FlowRun, AssistantFlowStep } from './conversation-reducer/types'
import { buildAssistantGroupView } from './conversation-reducer/assistant-group-builder'

// ── Re-exports: preserve the public API surface ──

export type {
  AssistantToolPair,
  AssistantThinkingStep,
  AssistantTextStep,
  AssistantToolStepStatus,
  AssistantToolStep,
  AssistantHookStep,
  AssistantFlowStep,
  FlowRun,
  AssistantMessageGroupView,
  UserGroupSubtype,
  ConversationGroupView,
} from './conversation-reducer/types'

// ── Public API ──

export function groupFlowStepsIntoRuns(steps: AssistantFlowStep[]): FlowRun[] {
  if (steps.length === 0) return []
  const runs: FlowRun[] = []
  let currentRun: FlowRun = { kind: steps[0].kind, steps: [steps[0]] }
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].kind === currentRun.kind) {
      currentRun.steps.push(steps[i])
    } else {
      runs.push(currentRun)
      currentRun = { kind: steps[i].kind, steps: [steps[i]] }
    }
  }
  runs.push(currentRun)
  return runs
}

export function reduceConversation(messages: Message[]): ConversationGroupView[] {
  const groups: ConversationGroupView[] = []
  let currentAiGroup: Message[] | null = null

  const flushAiGroup = (): void => {
    if (!currentAiGroup || currentAiGroup.length === 0) return
    const assistant = buildAssistantGroupView(currentAiGroup)
    groups.push({
      kind: 'assistant',
      key: assistant.key,
      messages: currentAiGroup,
      assistant,
    })
    currentAiGroup = null
  }

  for (const msg of messages) {
    if (isAssistantContentMessage(msg)) {
      if (!currentAiGroup) currentAiGroup = []
      currentAiGroup.push(msg)
      continue
    }

    // Absorb hook messages into the current or a new assistant group
    if (msg.hookName) {
      if (!currentAiGroup) currentAiGroup = []
      currentAiGroup.push(msg)
      continue
    }

    flushAiGroup()

    if (msg.role === 'user' && msg.type === 'text') {
      groups.push({
        kind: 'user',
        key: msg.id,
        messages: [msg],
        userSubtype: classifyUserMessage(msg),
      })
    } else {
      groups.push({
        kind: 'system',
        key: msg.id,
        messages: [msg],
      })
    }
  }

  flushAiGroup()
  return groups
}

// ── Internal helpers ──

function isAssistantContentMessage(msg: Message): boolean {
  return (msg.role === 'assistant' || msg.role === 'tool') && AI_GROUP_TYPES.has(msg.type)
}

function classifyUserMessage(msg: Message): UserGroupSubtype {
  const content = typeof msg.content === 'string' ? msg.content : ''

  if (content.includes('[Request interrupted by user]')) return 'interrupted'
  if (content.includes('<system-reminder>')) return 'hidden'
  if (
    content.startsWith('<command-message>') ||
    content.startsWith('<command-name>') ||
    content.startsWith('Base directory for this skill:')
  ) return 'system-injection'

  return 'real'
}
