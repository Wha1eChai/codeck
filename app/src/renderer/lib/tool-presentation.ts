import type { Message } from '@common/types'

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit'])
const WRITE_TOOLS = new Set(['Write'])
const SUMMARY_MAX_LENGTH = 60

export type ToolBlockStatus = 'running' | 'completed' | 'failed'
export type ToolBlockContentKind = 'diff' | 'write' | 'json' | 'none'

export interface ToolBlockViewModel {
  readonly toolName: string
  readonly displayName: string
  readonly summary?: string
  readonly status: ToolBlockStatus
  readonly contentKind: ToolBlockContentKind
  readonly input?: Record<string, unknown>
  readonly filePath?: string
  readonly hasDiff: boolean
  readonly oldStr?: string
  readonly newStr?: string
  readonly writeContent?: string
  readonly hasExpandableContent: boolean
}

export function buildToolBlockViewModel(
  useMessage: Message,
  resultMessage?: Message,
): ToolBlockViewModel {
  const toolName = useMessage.toolName || 'Tool'
  const input = isRecord(useMessage.toolInput) ? useMessage.toolInput : undefined

  const status = getToolStatus(resultMessage)
  const filePath = readString(input?.file_path)
  const displayName = toolName

  const resultSummary = summarizeToolResult(resultMessage)
  const inputSummary = summarizeToolInput(toolName, input)
  const summary = resultSummary ?? inputSummary

  const isEditTool = EDIT_TOOLS.has(toolName)
  const isWriteTool = WRITE_TOOLS.has(toolName)
  const oldStr = isEditTool ? readString(input?.old_str) : undefined
  const newStr = isEditTool ? readString(input?.new_str) : undefined
  const hasDiff = oldStr !== undefined && newStr !== undefined
  const writeContent = isWriteTool ? readString(input?.content) : undefined
  const contentKind = selectToolBlockContentKind({
    hasDiff,
    writeContent,
    input,
  })
  const hasExpandableContent = contentKind !== 'none'

  return {
    toolName,
    displayName,
    summary,
    status,
    contentKind,
    input,
    filePath,
    hasDiff,
    oldStr,
    newStr,
    writeContent,
    hasExpandableContent,
  }
}

export function selectToolBlockContentKind(input: {
  hasDiff: boolean
  writeContent?: string
  input?: Record<string, unknown>
}): ToolBlockContentKind {
  if (input.hasDiff) return 'diff'
  if (input.writeContent !== undefined) return 'write'
  if (input.input !== undefined) return 'json'
  return 'none'
}

function getToolStatus(resultMessage?: Message): ToolBlockStatus {
  if (!resultMessage) return 'running'
  return resultMessage.success === false ? 'failed' : 'completed'
}

function summarizeToolResult(resultMessage?: Message): string | undefined {
  if (!resultMessage) return undefined
  const raw = resultMessage.toolResult ?? resultMessage.content
  const text = toDisplayText(raw)
  return text ? truncate(text, SUMMARY_MAX_LENGTH) : undefined
}

function summarizeToolInput(
  toolName: string,
  input?: Record<string, unknown>,
): string | undefined {
  if (!input) return undefined

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit': {
      return readString(input.file_path)
    }

    case 'Bash': {
      return truncate(readString(input.command), SUMMARY_MAX_LENGTH)
    }

    case 'Grep': {
      const pattern = readString(input.pattern)
      if (!pattern) return undefined
      const path = readString(input.path) || '.'
      return `"${pattern}" in ${path}`
    }

    case 'Glob': {
      return readString(input.pattern)
    }

    case 'WebSearch': {
      return readString(input.query)
    }

    case 'WebFetch': {
      return readString(input.url)
    }

    default: {
      return truncate(JSON.stringify(input), SUMMARY_MAX_LENGTH)
    }
  }
}

function toDisplayText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
