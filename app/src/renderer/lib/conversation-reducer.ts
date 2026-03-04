import type { Message } from '@common/types'

const AI_GROUP_TYPES = new Set([
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

export type AssistantFlowStep = AssistantThinkingStep | AssistantTextStep | AssistantToolStep

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
  flowSteps: AssistantFlowStep[]
  lastMessage: Message | null
}

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
  }
  | {
    kind: 'system'
    key: string
    messages: Message[]
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

    flushAiGroup()

    if (msg.role === 'user' && msg.type === 'text') {
      groups.push({
        kind: 'user',
        key: msg.id,
        messages: [msg],
      })
    } else if (msg.hookName) {
      // Merge consecutive hook messages into one system group
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.kind === 'system' && lastGroup.messages.some(m => m.hookName)) {
        lastGroup.messages.push(msg)
      } else {
        groups.push({
          kind: 'system',
          key: msg.id,
          messages: [msg],
        })
      }
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

function isAssistantContentMessage(msg: Message): boolean {
  return (msg.role === 'assistant' || msg.role === 'tool') && AI_GROUP_TYPES.has(msg.type)
}

function buildAssistantGroupView(messages: Message[]): AssistantMessageGroupView {
  const thinking: Message[] = []
  const text: Message[] = []
  const toolPairs: AssistantToolPair[] = []
  const other: Message[] = []
  const thinkingSteps: AssistantThinkingStep[] = []
  const textSteps: AssistantTextStep[] = []
  const toolSteps: AssistantToolStep[] = []
  const pendingByToolUseId = new Map<string, AssistantToolPair>()
  const pendingByToolName = new Map<string, AssistantToolPair[]>()
  const pendingToolStepsByToolUseId = new Map<string, AssistantToolStep>()
  const pendingToolStepsByToolName = new Map<string, AssistantToolStep[]>()
  const pairToToolStep = new Map<AssistantToolPair, AssistantToolStep>()

  for (let index = 0; index < messages.length; index++) {
    const msg = messages[index]
    switch (msg.type) {
      case 'thinking': {
        thinking.push(msg)
        thinkingSteps.push({
          id: `thinking:${msg.id}`,
          kind: 'thinking',
          messages: [msg],
          content: normalizeMessageContent(msg.content),
          order: index,
          startedAt: msg.timestamp,
          updatedAt: msg.timestamp,
          isStreaming: Boolean(msg.isStreamDelta),
        })
        break
      }

      case 'text': {
        text.push(msg)
        textSteps.push({
          id: `text:${msg.id}`,
          kind: 'text',
          messages: [msg],
          content: normalizeMessageContent(msg.content),
          order: index,
          startedAt: msg.timestamp,
          updatedAt: msg.timestamp,
          isStreaming: Boolean(msg.isStreamDelta),
        })
        break
      }

      case 'tool_use': {
        const pair: AssistantToolPair = { use: msg }
        toolPairs.push(pair)
        const toolStep = createToolStepFromUseMessage(msg, index)
        toolSteps.push(toolStep)
        pairToToolStep.set(pair, toolStep)

        if (msg.toolUseId) {
          pendingByToolUseId.set(msg.toolUseId, pair)
          pendingToolStepsByToolUseId.set(msg.toolUseId, toolStep)
        }
        enqueuePendingByName(pendingByToolName, msg.toolName, pair)
        enqueuePendingToolStepByName(pendingToolStepsByToolName, msg.toolName, toolStep)
        break
      }

      case 'tool_result': {
        const matchedPair = findPendingPairForResult(msg, pendingByToolUseId, pendingByToolName)
        if (matchedPair) {
          matchedPair.result = msg
          const matchedStep = pairToToolStep.get(matchedPair)
          if (matchedStep) {
            completeToolStep(matchedStep, msg, pendingToolStepsByToolUseId, pendingToolStepsByToolName)
          }
        } else {
          // Keep orphan tool_result visible as a standalone row.
          const orphanPair: AssistantToolPair = { use: msg, result: msg }
          toolPairs.push(orphanPair)
          toolSteps.push(createToolStepFromOrphanResult(msg, index))
        }
        break
      }

      case 'tool_progress': {
        other.push(msg)
        const matchedToolStep = findPendingToolStepForProgress(
          msg,
          pendingToolStepsByToolUseId,
          pendingToolStepsByToolName,
          toolSteps,
        )
        if (matchedToolStep) {
          appendToolProgress(matchedToolStep, msg)
        }
        break
      }

      default:
        other.push(msg)
    }
  }

  // ── Post-processing: nest sub-agent messages as childSteps ──

  // Collect messages with parentToolUseId grouped by parent
  const childMessagesByParent = new Map<string, Message[]>()
  for (const msg of messages) {
    if (msg.parentToolUseId) {
      const existing = childMessagesByParent.get(msg.parentToolUseId)
      if (existing) {
        existing.push(msg)
      } else {
        childMessagesByParent.set(msg.parentToolUseId, [msg])
      }
    }
  }

  // Attach child steps to matching parent tool steps
  if (childMessagesByParent.size > 0) {
    for (const step of toolSteps) {
      if (step.toolUseId && childMessagesByParent.has(step.toolUseId)) {
        const childMsgs = childMessagesByParent.get(step.toolUseId)!
        step.childSteps = buildChildFlowSteps(childMsgs)
      }
    }
  }

  // Collect IDs of all child messages to exclude from top-level
  const childIds = new Set<string>()
  for (const msgs of childMessagesByParent.values()) {
    for (const m of msgs) childIds.add(m.id)
  }

  // Filter child messages from top-level step arrays
  const topThinkingSteps = childIds.size > 0
    ? thinkingSteps.filter(s => s.messages.every(m => !childIds.has(m.id)))
    : thinkingSteps
  const topTextSteps = childIds.size > 0
    ? textSteps.filter(s => s.messages.every(m => !childIds.has(m.id)))
    : textSteps
  const topToolSteps = childIds.size > 0
    ? toolSteps.filter(s => !s.toolUseId || !childIds.has(s.useMessage?.id ?? ''))
    : toolSteps

  const lastMessage = messages[messages.length - 1] ?? null
  const flowSteps = [...topThinkingSteps, ...topTextSteps, ...topToolSteps].sort((a, b) => a.order - b.order)

  return {
    key: messages[0]?.id ?? 'assistant-empty',
    messages,
    thinking,
    text,
    toolPairs,
    other,
    thinkingSteps: topThinkingSteps,
    textSteps: topTextSteps,
    toolSteps: topToolSteps,
    flowSteps,
    lastMessage,
  }
}

function buildChildFlowSteps(childMessages: Message[]): AssistantFlowStep[] {
  const steps: AssistantFlowStep[] = []
  const pendingTools = new Map<string, AssistantToolStep>()

  for (let i = 0; i < childMessages.length; i++) {
    const msg = childMessages[i]
    switch (msg.type) {
      case 'thinking':
        steps.push({
          id: `thinking:${msg.id}`,
          kind: 'thinking',
          messages: [msg],
          content: normalizeMessageContent(msg.content),
          order: i,
          startedAt: msg.timestamp,
          updatedAt: msg.timestamp,
          isStreaming: Boolean(msg.isStreamDelta),
        })
        break

      case 'text':
        steps.push({
          id: `text:${msg.id}`,
          kind: 'text',
          messages: [msg],
          content: normalizeMessageContent(msg.content),
          order: i,
          startedAt: msg.timestamp,
          updatedAt: msg.timestamp,
          isStreaming: Boolean(msg.isStreamDelta),
        })
        break

      case 'tool_use': {
        const toolStep = createToolStepFromUseMessage(msg, i)
        steps.push(toolStep)
        if (msg.toolUseId) {
          pendingTools.set(msg.toolUseId, toolStep)
        }
        break
      }

      case 'tool_result': {
        if (msg.toolUseId) {
          const matchedStep = pendingTools.get(msg.toolUseId)
          if (matchedStep) {
            matchedStep.resultMessage = msg
            matchedStep.status = msg.success === false ? 'failed' : 'completed'
            matchedStep.updatedAt = Math.max(matchedStep.updatedAt, msg.timestamp)
            pendingTools.delete(msg.toolUseId)
            break
          }
        }
        // Orphan result
        steps.push(createToolStepFromOrphanResult(msg, i))
        break
      }

      case 'tool_progress': {
        if (msg.toolUseId) {
          const matchedStep = pendingTools.get(msg.toolUseId)
          if (matchedStep) {
            appendToolProgress(matchedStep, msg)
          }
        }
        break
      }
    }
  }

  return steps
}

function enqueuePendingByName(
  pendingByToolName: Map<string, AssistantToolPair[]>,
  toolName: string | undefined,
  pair: AssistantToolPair,
): void {
  if (!toolName) return
  const queue = pendingByToolName.get(toolName)
  if (queue) {
    queue.push(pair)
    return
  }
  pendingByToolName.set(toolName, [pair])
}

function findPendingPairForResult(
  resultMessage: Message,
  pendingByToolUseId: Map<string, AssistantToolPair>,
  pendingByToolName: Map<string, AssistantToolPair[]>,
): AssistantToolPair | undefined {
  if (resultMessage.toolUseId) {
    const pair = pendingByToolUseId.get(resultMessage.toolUseId)
    if (pair) {
      pendingByToolUseId.delete(resultMessage.toolUseId)
      removePendingByName(pendingByToolName, pair)
      return pair
    }
  }

  if (!resultMessage.toolName) {
    return undefined
  }

  const queue = pendingByToolName.get(resultMessage.toolName)
  if (!queue || queue.length === 0) {
    return undefined
  }

  const pair = queue.shift()
  if (!pair) {
    return undefined
  }

  if (queue.length === 0) {
    pendingByToolName.delete(resultMessage.toolName)
  }

  const toolUseId = pair.use.toolUseId
  if (toolUseId) {
    pendingByToolUseId.delete(toolUseId)
  }
  return pair
}

function removePendingByName(
  pendingByToolName: Map<string, AssistantToolPair[]>,
  pair: AssistantToolPair,
): void {
  const toolName = pair.use.toolName
  if (!toolName) return

  const queue = pendingByToolName.get(toolName)
  if (!queue || queue.length === 0) return

  const index = queue.indexOf(pair)
  if (index >= 0) {
    queue.splice(index, 1)
  }
  if (queue.length === 0) {
    pendingByToolName.delete(toolName)
  }
}

function normalizeMessageContent(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

function createToolStepFromUseMessage(message: Message, order: number): AssistantToolStep {
  return {
    id: `tool:${message.toolUseId ?? message.id}`,
    kind: 'tool',
    toolUseId: message.toolUseId,
    toolName: message.toolName || 'Tool',
    useMessage: message,
    progressMessages: [],
    status: 'running',
    latestProgressMessage: undefined,
    order,
    startedAt: message.timestamp,
    updatedAt: message.timestamp,
    isStreaming: Boolean(message.isStreamDelta),
  }
}

function createToolStepFromOrphanResult(message: Message, order: number): AssistantToolStep {
  return {
    id: `tool-orphan:${message.toolUseId ?? message.id}`,
    kind: 'tool',
    toolUseId: message.toolUseId,
    toolName: message.toolName || 'Tool',
    useMessage: undefined,
    resultMessage: message,
    progressMessages: [],
    latestProgressMessage: undefined,
    status: message.success === false ? 'failed' : 'completed',
    order,
    startedAt: message.timestamp,
    updatedAt: message.timestamp,
    isStreaming: Boolean(message.isStreamDelta),
  }
}

function enqueuePendingToolStepByName(
  pendingByToolName: Map<string, AssistantToolStep[]>,
  toolName: string | undefined,
  step: AssistantToolStep,
): void {
  if (!toolName) return
  const queue = pendingByToolName.get(toolName)
  if (queue) {
    queue.push(step)
    return
  }
  pendingByToolName.set(toolName, [step])
}

function completeToolStep(
  step: AssistantToolStep,
  resultMessage: Message,
  pendingByToolUseId: Map<string, AssistantToolStep>,
  pendingByToolName: Map<string, AssistantToolStep[]>,
): void {
  step.resultMessage = resultMessage
  step.status = resultMessage.success === false ? 'failed' : 'completed'
  step.updatedAt = Math.max(step.updatedAt, resultMessage.timestamp)
  step.isStreaming = step.isStreaming || Boolean(resultMessage.isStreamDelta)

  if (step.toolUseId) {
    pendingByToolUseId.delete(step.toolUseId)
  }
  removePendingToolStepByName(pendingByToolName, step)
}

function removePendingToolStepByName(
  pendingByToolName: Map<string, AssistantToolStep[]>,
  step: AssistantToolStep,
): void {
  const queue = pendingByToolName.get(step.toolName)
  if (!queue || queue.length === 0) return

  const index = queue.indexOf(step)
  if (index >= 0) {
    queue.splice(index, 1)
  }
  if (queue.length === 0) {
    pendingByToolName.delete(step.toolName)
  }
}

function findPendingToolStepForProgress(
  progressMessage: Message,
  pendingByToolUseId: Map<string, AssistantToolStep>,
  pendingByToolName: Map<string, AssistantToolStep[]>,
  toolSteps: AssistantToolStep[],
): AssistantToolStep | undefined {
  if (progressMessage.toolUseId) {
    const stepById = pendingByToolUseId.get(progressMessage.toolUseId)
    if (stepById) {
      return stepById
    }
  }

  if (!progressMessage.toolName) {
    if (progressMessage.toolUseId) {
      return findLatestToolStepByUseId(progressMessage.toolUseId, toolSteps)
    }
    return undefined
  }

  const queue = pendingByToolName.get(progressMessage.toolName)
  if (!queue || queue.length === 0) {
    if (progressMessage.toolUseId) {
      const stepByUseId = findLatestToolStepByUseId(progressMessage.toolUseId, toolSteps)
      if (stepByUseId) {
        return stepByUseId
      }
    }
    return findLatestToolStepByName(progressMessage.toolName, toolSteps)
  }

  return queue[0]
}

function appendToolProgress(step: AssistantToolStep, progressMessage: Message): void {
  step.progressMessages.push(progressMessage)
  step.latestProgressMessage = progressMessage
  step.updatedAt = Math.max(step.updatedAt, progressMessage.timestamp)
  step.isStreaming = step.isStreaming || Boolean(progressMessage.isStreamDelta)
}

function findLatestToolStepByUseId(
  toolUseId: string,
  toolSteps: AssistantToolStep[],
): AssistantToolStep | undefined {
  for (let i = toolSteps.length - 1; i >= 0; i--) {
    if (toolSteps[i].toolUseId === toolUseId) {
      return toolSteps[i]
    }
  }
  return undefined
}

function findLatestToolStepByName(
  toolName: string,
  toolSteps: AssistantToolStep[],
): AssistantToolStep | undefined {
  for (let i = toolSteps.length - 1; i >= 0; i--) {
    if (toolSteps[i].toolName === toolName) {
      return toolSteps[i]
    }
  }
  return undefined
}
