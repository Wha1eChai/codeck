import type { RiskLevel } from './types.js'

const LOW_RISK_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'])
const MEDIUM_RISK_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

export function assessToolRisk(toolName: string): RiskLevel {
  if (LOW_RISK_TOOLS.has(toolName)) return 'low'
  if (MEDIUM_RISK_TOOLS.has(toolName)) return 'medium'
  return 'high'
}

export function summarizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return String(toolInput['file_path'] ?? '')
    case 'Bash':
      return String(toolInput['command'] ?? '').substring(0, 120)
    case 'Glob':
    case 'Grep':
      return String(toolInput['pattern'] ?? '')
    default:
      return JSON.stringify(toolInput).substring(0, 100)
  }
}
