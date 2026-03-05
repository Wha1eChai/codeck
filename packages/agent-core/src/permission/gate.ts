import crypto from 'crypto'
import type {
  PermissionCallback,
  PermissionRequest,
  PermissionResponse,
} from './types.js'
import type { PermissionMemoryStore } from './memory-store.js'
import { assessToolRisk, summarizeToolInput } from './risk-assessor.js'
import { buildInputKey, buildToolKey } from './memory-store.js'

export interface PermissionGateOptions {
  readonly store: PermissionMemoryStore
  readonly onPermissionRequest: PermissionCallback
}

export interface PermissionGate {
  check(toolName: string, toolInput: Record<string, unknown>): Promise<PermissionResponse>
  clearCache(): void
}

function cachedResponse(key: string, allowed: boolean, reason: string | undefined): PermissionResponse {
  return reason !== undefined
    ? { requestId: `cached:${key}`, allowed, reason }
    : { requestId: `cached:${key}`, allowed }
}

export function createPermissionGate(options: PermissionGateOptions): PermissionGate {
  const { store, onPermissionRequest } = options

  return {
    async check(
      toolName: string,
      toolInput: Record<string, unknown>,
    ): Promise<PermissionResponse> {
      // Check tool-level cache first (coarser)
      const toolKey = buildToolKey(toolName)
      const toolDecision = store.get(toolKey)
      if (toolDecision) {
        return cachedResponse(toolKey, toolDecision.allowed, toolDecision.reason)
      }

      // Check exact-input cache
      const inputKey = buildInputKey(toolName, toolInput)
      const inputDecision = store.get(inputKey)
      if (inputDecision) {
        return cachedResponse(inputKey, inputDecision.allowed, inputDecision.reason)
      }

      // Cache miss — ask the user
      const risk = assessToolRisk(toolName)
      const request: PermissionRequest = {
        id: crypto.randomUUID(),
        toolName,
        toolInput,
        description: `${toolName}: ${summarizeToolInput(toolName, toolInput)}`,
        risk,
      }

      const response = await onPermissionRequest(request)

      // Store decision if user chose to remember
      if (response.rememberForSession) {
        const defaultScope = risk === 'high' ? 'input' : 'tool'
        const scope = response.rememberScope ?? defaultScope
        const storeKey = scope === 'tool' ? toolKey : inputKey
        const decision = response.reason !== undefined
          ? { allowed: response.allowed, reason: response.reason, scope }
          : { allowed: response.allowed, scope }
        store.set(storeKey, decision)
      }

      return response
    },

    clearCache(): void {
      store.clear()
    },
  }
}
