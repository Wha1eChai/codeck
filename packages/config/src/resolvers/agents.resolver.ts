import type { AgentFile } from '../schemas/agent.schema.js'

interface AgentsResolverInput {
  readonly globalAgents: readonly AgentFile[]
  readonly projectAgents: readonly AgentFile[]
  readonly pluginAgents: readonly AgentFile[]
}

/**
 * Aggregate agents from global + project + plugins.
 * Project overrides global by name. Plugin agents added alongside.
 */
export function resolveAgents(input: AgentsResolverInput): readonly AgentFile[] {
  const byName = new Map<string, AgentFile>()

  for (const agent of input.globalAgents) {
    byName.set(agent.name, agent)
  }

  for (const agent of input.projectAgents) {
    byName.set(agent.name, agent)
  }

  const result = [...byName.values()]
  for (const agent of input.pluginAgents) {
    if (!byName.has(agent.name)) {
      result.push(agent)
      byName.set(agent.name, agent)
    }
  }

  return result
}
