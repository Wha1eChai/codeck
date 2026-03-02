// ============================================================
// Agent Mapper — AgentFile[] → SDK Record<string, SDKAgentDefinition>
// ============================================================

import type { AgentFile } from '@codeck/config'
import type { SDKAgentDefinition } from './sdk-types'

/**
 * Convert cc-desk-config AgentFile array to SDK-compatible agents record.
 * Pure function — no side effects.
 */
export function mapAgentsToSDKDefinitions(
  agents: readonly AgentFile[],
): Record<string, SDKAgentDefinition> {
  const result: Record<string, SDKAgentDefinition> = {}

  for (const agent of agents) {
    const fm = agent.frontmatter
    const tools = normalizeTools(fm['allowed-tools'])

    result[agent.name] = {
      description: fm.description || `Agent: ${agent.name}`,
      prompt: agent.body,
      ...(tools.length > 0 ? { tools } : {}),
      ...(fm.model ? { model: fm.model as SDKAgentDefinition['model'] } : {}),
    }
  }

  return result
}

function normalizeTools(raw: string[] | string | undefined): string[] {
  if (!raw) return []
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean)
  return raw
}
