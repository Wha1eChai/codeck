import type { AssistantToolStep } from './conversation-reducer'

interface ToolGroup {
  readonly name: string
  readonly count: number
  readonly singleTarget?: string
}

const TOOL_LABELS: Record<string, (count: number, target?: string) => string> = {
  Read: (n, t) => n === 1 && t ? `Read ${t}` : `Read ${n} files`,
  Edit: (n, t) => n === 1 && t ? `Edit ${t}` : `Edit ${n} files`,
  MultiEdit: (n, t) => n === 1 && t ? `Edit ${t}` : `Edit ${n} files`,
  Write: (n, t) => n === 1 && t ? `Write ${t}` : `Write ${n} files`,
  Bash: (n, t) => n === 1 && t ? `Run: ${t}` : `Run ${n} commands`,
  Grep: (n) => n === 1 ? 'Search codebase' : `Search codebase (${n}x)`,
  Glob: (n) => n === 1 ? 'Find files' : `Find files (${n}x)`,
  Task: (n) => n === 1 ? 'Run subagent' : `Run ${n} subagents`,
  WebFetch: (n) => n === 1 ? 'Fetch URL' : `Fetch ${n} URLs`,
  WebSearch: (n) => n === 1 ? 'Web search' : `Web search (${n}x)`,
}

const MAX_DISPLAY_GROUPS = 3

function extractTarget(step: AssistantToolStep): string | undefined {
  const input = step.useMessage?.toolInput
  if (!input) return undefined

  // file_path for Read/Edit/Write
  if (typeof input.file_path === 'string') {
    return input.file_path.split(/[/\\]/).pop() ?? undefined
  }
  // command for Bash (truncate)
  if (typeof input.command === 'string') {
    const cmd = input.command.trim()
    return cmd.length > 30 ? `${cmd.slice(0, 30)}...` : cmd
  }
  return undefined
}

function formatMcpToolName(toolName: string): string {
  // mcp__server__tool → "server: tool"
  const parts = toolName.split('__')
  if (parts.length >= 3 && parts[0] === 'mcp') {
    return `${parts[1]}: ${parts.slice(2).join('_')}`
  }
  return toolName
}

/**
 * Generate a semantic summary of tool steps for display in the FlowSection title.
 * Groups tools by name and generates human-readable descriptions.
 */
export function semanticToolSummary(steps: AssistantToolStep[]): string {
  if (steps.length === 0) return ''

  const groups = new Map<string, ToolGroup>()

  for (const step of steps) {
    const name = step.toolName
    const existing = groups.get(name)
    if (existing) {
      groups.set(name, { ...existing, count: existing.count + 1, singleTarget: undefined })
    } else {
      groups.set(name, { name, count: 1, singleTarget: extractTarget(step) })
    }
  }

  const entries = Array.from(groups.values())
  const displayed = entries.slice(0, MAX_DISPLAY_GROUPS)
  const remaining = entries.length - MAX_DISPLAY_GROUPS

  const parts = displayed.map(g => {
    const labelFn = TOOL_LABELS[g.name]
    if (labelFn) return labelFn(g.count, g.singleTarget)

    // MCP or unknown tools
    const display = formatMcpToolName(g.name)
    return g.count === 1 ? display : `${display} (${g.count}x)`
  })

  if (remaining > 0) {
    parts.push(`+${remaining} more`)
  }

  return parts.join(', ')
}

/**
 * Generate a statistical suffix like "2 done, 1 failed" for secondary display.
 */
export function statisticalSuffix(steps: AssistantToolStep[]): string {
  let completed = 0
  let failed = 0
  let running = 0

  for (const step of steps) {
    if (step.status === 'completed') completed += 1
    else if (step.status === 'failed') failed += 1
    else running += 1
  }

  const parts: string[] = []
  if (completed > 0) parts.push(`${completed} done`)
  if (failed > 0) parts.push(`${failed} failed`)
  if (running > 0) parts.push(`${running} running`)

  return parts.join(', ')
}
