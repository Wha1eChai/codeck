import type { AssistantToolStep } from './types'

export function normalizeMessageContent(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

export function findLatestToolStepByUseId(
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

export function findLatestToolStepByName(
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

export function extractHookOutput(content: string | unknown): string | undefined {
  if (typeof content !== 'string') return undefined
  const match = content.match(/^\[Hook: [^\]]+\]\s*(.+)$/)
  return match?.[1] ?? undefined
}
