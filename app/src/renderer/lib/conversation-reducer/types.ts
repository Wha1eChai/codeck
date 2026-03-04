import type { Message } from '@common/types'

export const AI_GROUP_TYPES = new Set([
  'thinking',
  'text',
  'tool_use',
  'tool_result',
  'tool_progress',
])

export interface AssistantToolPair {
  use: Message
  result?: Message
}

interface AssistantFlowStepBase {
  id: string
  order: number
  startedAt: number
  updatedAt: number
  isStreaming: boolean
}

export interface AssistantThinkingStep extends AssistantFlowStepBase {
  kind: 'thinking'
  messages: Message[]
  content: string
}

export interface AssistantTextStep extends AssistantFlowStepBase {
  kind: 'text'
  messages: Message[]
  content: string
}

export type AssistantToolStepStatus = 'running' | 'completed' | 'failed'

export interface AssistantToolStep extends AssistantFlowStepBase {
  kind: 'tool'
  toolUseId?: string
  toolName: string
  useMessage?: Message
  resultMessage?: Message
  progressMessages: Message[]
  latestProgressMessage?: Message
  status: AssistantToolStepStatus
  /** Nested steps from sub-agent execution */
  childSteps?: AssistantFlowStep[]
}

export interface AssistantHookStep extends AssistantFlowStepBase {
  kind: 'hook'
  hookName: string
  hookStatus: string
  hookOutput?: string
  message: Message
}

export type AssistantFlowStep = AssistantThinkingStep | AssistantTextStep | AssistantToolStep | AssistantHookStep

export interface FlowRun {
  kind: AssistantFlowStep['kind']
  steps: AssistantFlowStep[]
}

export interface AssistantMessageGroupView {
  key: string
  messages: Message[]
  thinking: Message[]
  text: Message[]
  toolPairs: AssistantToolPair[]
  other: Message[]
  thinkingSteps: AssistantThinkingStep[]
  textSteps: AssistantTextStep[]
  toolSteps: AssistantToolStep[]
  hookSteps: AssistantHookStep[]
  flowSteps: AssistantFlowStep[]
  lastMessage: Message | null
}

export type UserGroupSubtype = 'real' | 'interrupted' | 'system-injection' | 'hidden'

export type ConversationGroupView =
  | {
    kind: 'assistant'
    key: string
    messages: Message[]
    assistant: AssistantMessageGroupView
  }
  | {
    kind: 'user'
    key: string
    messages: Message[]
    userSubtype: UserGroupSubtype
  }
  | {
    kind: 'system'
    key: string
    messages: Message[]
  }
