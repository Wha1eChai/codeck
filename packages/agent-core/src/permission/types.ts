export type RiskLevel = 'low' | 'medium' | 'high'

export type PermissionScope = 'input' | 'tool'

export interface PermissionRequest {
  readonly id: string
  readonly toolName: string
  readonly toolInput: Record<string, unknown>
  readonly description: string
  readonly risk: RiskLevel
}

export interface PermissionResponse {
  readonly requestId: string
  readonly allowed: boolean
  readonly reason?: string
  readonly rememberForSession?: boolean
  readonly rememberScope?: PermissionScope
}

export interface PermissionDecision {
  readonly allowed: boolean
  readonly reason?: string
  readonly scope: PermissionScope
}

/**
 * Callback invoked when a tool requires user approval.
 * Returns a PermissionResponse after the user makes a decision.
 */
export type PermissionCallback = (request: PermissionRequest) => Promise<PermissionResponse>
