import type { Message } from '@common/types'
import type {
  AssistantToolPair,
  AssistantThinkingStep,
  AssistantTextStep,
  AssistantToolStep,
  AssistantHookStep,
  AssistantFlowStep,
  AssistantMessageGroupView,
} from './types'
import { normalizeMessageContent, extractHookOutput } from './utils'
import {
  enqueuePendingByName,
  findPendingPairForResult,
  enqueuePendingToolStepByName,
  completeToolStep,
  createToolStepFromUseMessage,
  createToolStepFromOrphanResult,
  findPendingToolStepForProgress,
  appendToolProgress,
} from './tool-pairing'

export function buildAssistantGroupView(messages: Message[]): AssistantMessageGroupView {
  const thinking: Message[] = []
  const text: Message[] = []
  const toolPairs: AssistantToolPair[] = []
  const other: Message[] = []
  const thinkingSteps: AssistantThinkingStep[] = []
  const textSteps: AssistantTextStep[] = []
  const toolSteps: AssistantToolStep[] = []
  const hookSteps: AssistantHookStep[] = []
  const pendingByToolUseId = new Map<string, AssistantToolPair>()
  const pendingByToolName = new Map<string, AssistantToolPair[]>()
  const pendingToolStepsByToolUseId = new Map<string, AssistantToolStep>()
  const pendingToolStepsByToolName = new Map<string, AssistantToolStep[]>()
  const pairToToolStep = new Map<AssistantToolPair, AssistantToolStep>()

  for (let index = 0; index < messages.length; index++) {
    const msg = messages[index]

    // Handle hook messages before the type switch
    if (msg.hookName) {
      const hookStep: AssistantHookStep = {
        id: `hook:${msg.id}`,
        kind: 'hook',
        hookName: msg.hookName,
        hookStatus: msg.hookStatus ?? 'started',
        hookOutput: extractHookOutput(msg.content),
        message: msg,
        order: index,
        startedAt: msg.timestamp,
        updatedAt: msg.timestamp,
        isStreaming: false,
      }
      hookSteps.push(hookStep)
      continue
    }

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
  const flowSteps = [...topThinkingSteps, ...topTextSteps, ...topToolSteps, ...hookSteps].sort((a, b) => a.order - b.order)

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
    hookSteps,
    flowSteps,
    lastMessage,
  }
}

export function buildChildFlowSteps(childMessages: Message[]): AssistantFlowStep[] {
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
