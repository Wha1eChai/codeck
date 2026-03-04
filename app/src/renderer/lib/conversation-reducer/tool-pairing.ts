import type { Message } from '@common/types'
import type { AssistantToolPair, AssistantToolStep } from './types'
import { findLatestToolStepByUseId, findLatestToolStepByName } from './utils'

// ── Pair-level helpers (legacy toolPairs) ──

export function enqueuePendingByName(
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

export function findPendingPairForResult(
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

// ── Step-level helpers (AssistantToolStep) ──

export function enqueuePendingToolStepByName(
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

export function completeToolStep(
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

export function createToolStepFromUseMessage(message: Message, order: number): AssistantToolStep {
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

export function createToolStepFromOrphanResult(message: Message, order: number): AssistantToolStep {
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

export function findPendingToolStepForProgress(
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

export function appendToolProgress(step: AssistantToolStep, progressMessage: Message): void {
  step.progressMessages.push(progressMessage)
  step.latestProgressMessage = progressMessage
  step.updatedAt = Math.max(step.updatedAt, progressMessage.timestamp)
  step.isStreaming = step.isStreaming || Boolean(progressMessage.isStreamDelta)
}
