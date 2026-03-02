// ============================================================
// Permission Adapter - canUseTool bidirectional mapping
// ============================================================

import crypto from 'crypto'
import type { PermissionRequest, PermissionResponse, SessionStatus, AskUserQuestionRequest, AskUserQuestionResponse, ExitPlanModeRequest, ExitPlanModeResponse } from '@common/types'
import type { SDKCanUseToolCallback, SDKCanUseToolOptions, SDKPermissionResult } from './sdk-types'

// Risk Assessment

const LOW_RISK_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'])
const MEDIUM_RISK_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

export function assessToolRisk(toolName: string): 'low' | 'medium' | 'high' {
  if (LOW_RISK_TOOLS.has(toolName)) return 'low'
  if (MEDIUM_RISK_TOOLS.has(toolName)) return 'medium'
  return 'high'
}

/**
 * Create a human-readable summary of tool input for the permission dialog.
 */
export function summarizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Read':
      return String(toolInput.file_path ?? '')
    case 'Write':
    case 'Edit':
      return String(toolInput.file_path ?? '')
    case 'Bash':
      return String(toolInput.command ?? '').substring(0, 120)
    case 'Glob':
      return String(toolInput.pattern ?? '')
    case 'Grep':
      return String(toolInput.pattern ?? '')
    default:
      return JSON.stringify(toolInput).substring(0, 100)
  }
}

// SDK -> Internal conversion

export function toPermissionRequest(
  toolName: string,
  toolInput: Record<string, unknown>,
  sdkOptions: SDKCanUseToolOptions,
): PermissionRequest {
  return {
    id: crypto.randomUUID(),
    toolName,
    toolInput,
    description: `${toolName}: ${summarizeToolInput(toolName, toolInput)}`,
    risk: assessToolRisk(toolName),
    toolUseId: sdkOptions.toolUseID,
    agentId: sdkOptions.agentID,
    suggestions: sdkOptions.suggestions,
    decisionReason: sdkOptions.decisionReason,
  }
}

export function toSDKPermissionResult(
  response: PermissionResponse,
  toolUseID: string,
): SDKPermissionResult {
  if (response.allowed) {
    return { behavior: 'allow', toolUseID }
  }
  return {
    behavior: 'deny',
    message: response.reason ?? 'User denied permission',
    toolUseID,
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

export function buildPermissionDecisionKey(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  return `${toolName}:${stableStringify(toolInput)}`
}

/**
 * Build a coarser key that covers ALL invocations of a given tool.
 * Used when the user selects "Remember for this tool" (tool-level scope).
 */
export function buildToolLevelKey(toolName: string): string {
  return `tool:${toolName}`
}

export interface PermissionDecisionSnapshot {
  readonly allowed: boolean
  readonly reason?: string
  /** 'input' = exact match (default); 'tool' = any invocation of this tool. */
  readonly scope?: 'input' | 'tool'
}

export interface PermissionDecisionStore {
  get(key: string): PermissionDecisionSnapshot | undefined
  set(key: string, decision: PermissionDecisionSnapshot): void
  load?(): Promise<void>
  save?(): Promise<void>
  clear?(): void
}

// Permission Handler Factory

export interface PermissionHandlerDeps {
  readonly sendToRenderer: (request: PermissionRequest) => void
  readonly waitForResponse: () => Promise<PermissionResponse>
  readonly onStatusChange: (status: SessionStatus) => void
  readonly isWindowDestroyed: () => boolean
  readonly decisionStore?: PermissionDecisionStore
  /** Optional: handle AskUserQuestion interactively in the GUI */
  readonly sendAskUserQuestion?: (request: AskUserQuestionRequest) => void
  readonly waitForAskUserQuestion?: () => Promise<AskUserQuestionResponse>
  /** Optional: handle ExitPlanMode plan approval in the GUI */
  readonly sendExitPlanMode?: (request: ExitPlanModeRequest) => void
  readonly waitForExitPlanMode?: () => Promise<ExitPlanModeResponse>
}

export function createPermissionHandler(deps: PermissionHandlerDeps): SDKCanUseToolCallback {
  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
    sdkOptions: SDKCanUseToolOptions,
  ): Promise<SDKPermissionResult> => {
    if (deps.isWindowDestroyed()) {
      return { behavior: 'deny', message: 'Window closed', toolUseID: sdkOptions.toolUseID }
    }

    // ── AskUserQuestion special handling ──
    if (toolName === 'AskUserQuestion' && deps.sendAskUserQuestion && deps.waitForAskUserQuestion) {
      const request: AskUserQuestionRequest = {
        id: crypto.randomUUID(),
        toolUseId: sdkOptions.toolUseID,
        questions: (toolInput.questions as AskUserQuestionRequest['questions']) ?? [],
      }
      deps.sendAskUserQuestion(request)
      deps.onStatusChange('waiting_permission')
      const response = await deps.waitForAskUserQuestion()
      deps.onStatusChange('streaming')

      if (response.cancelled) {
        return { behavior: 'deny', message: 'User cancelled', toolUseID: sdkOptions.toolUseID }
      }
      // Pass answers back to the CLI tool via updatedInput so AskUserQuestion can return them
      return {
        behavior: 'allow',
        updatedInput: { ...toolInput, answers: response.answers },
        toolUseID: sdkOptions.toolUseID,
      }
    }

    // ── ExitPlanMode special handling ──
    if (toolName === 'ExitPlanMode' && deps.sendExitPlanMode && deps.waitForExitPlanMode) {
      const request: ExitPlanModeRequest = {
        id: crypto.randomUUID(),
        toolUseId: sdkOptions.toolUseID,
        allowedPrompts: toolInput.allowedPrompts as ExitPlanModeRequest['allowedPrompts'],
      }
      deps.sendExitPlanMode(request)
      deps.onStatusChange('waiting_permission')
      const response = await deps.waitForExitPlanMode()
      deps.onStatusChange('streaming')

      if (!response.allowed) {
        return {
          behavior: 'deny',
          message: response.feedback ?? 'User chose to keep planning',
          toolUseID: sdkOptions.toolUseID,
        }
      }
      return { behavior: 'allow', toolUseID: sdkOptions.toolUseID }
    }

    // Check tool-level decisions first, then exact-input decisions.
    const toolKey = buildToolLevelKey(toolName)
    const toolDecision = deps.decisionStore?.get(toolKey)
    if (toolDecision) {
      return toSDKPermissionResult(
        {
          requestId: `remembered:${toolKey}`,
          allowed: toolDecision.allowed,
          reason: toolDecision.reason,
        },
        sdkOptions.toolUseID,
      )
    }

    const decisionKey = buildPermissionDecisionKey(toolName, toolInput)
    const rememberedDecision = deps.decisionStore?.get(decisionKey)
    if (rememberedDecision) {
      return toSDKPermissionResult(
        {
          requestId: `remembered:${decisionKey}`,
          allowed: rememberedDecision.allowed,
          reason: rememberedDecision.reason,
        },
        sdkOptions.toolUseID,
      )
    }

    const request = toPermissionRequest(toolName, toolInput, sdkOptions)
    deps.sendToRenderer(request)
    deps.onStatusChange('waiting_permission')

    const response = await deps.waitForResponse()
    if (response.rememberForSession) {
      // Default scope is risk-based, matching SDK's own permission philosophy:
      // - High-risk tools (Bash etc.): 'input' scope — only remember the exact command
      // - Medium/low-risk tools (Edit, Read etc.): 'tool' scope — remember the whole tool type
      const defaultScope = assessToolRisk(toolName) === 'high' ? 'input' : 'tool'
      const scope = response.rememberScope ?? defaultScope
      const storeKey = scope === 'tool' ? toolKey : decisionKey
      deps.decisionStore?.set(storeKey, {
        allowed: response.allowed,
        reason: response.reason,
        scope,
      })
    }
    deps.onStatusChange('streaming')

    return toSDKPermissionResult(response, sdkOptions.toolUseID)
  }
}
