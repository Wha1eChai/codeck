// ============================================================
// Message Parser - SDKMessage -> ParseResult
// ============================================================

import crypto from 'crypto'
import type { Message } from '@common/types'
import type { SessionMetadata, SDKContentBlock } from './sdk-types'
import { parseContentBlocks, mapUsage, normalizeContent } from './content-block-parser'

export interface ParseResult {
  readonly messages: readonly Message[]
  readonly metadata?: SessionMetadata
}

export interface ParseOptions {
  /** Include user text messages. Kept off for live stream (optimistic rendering), on for history replay. */
  readonly includeUserMessages?: boolean
  /** Include raw stream_event deltas. Kept on for live stream, off for history replay. */
  readonly includeStreamEvents?: boolean
}

export interface SDKMessageParser {
  parse: (sdkMsg: unknown, sessionId: string) => ParseResult
  reset: () => void
}

interface NormalizedParseOptions {
  includeUserMessages: boolean
  includeStreamEvents: boolean
}

const DEFAULT_PARSE_OPTIONS: NormalizedParseOptions = {
  includeUserMessages: false,
  includeStreamEvents: true,
}

type StreamBlockState =
  | {
    kind: 'text'
    text: string
  }
  | {
    kind: 'thinking'
    thinking: string
  }
  | {
    kind: 'tool_use'
    toolName: string
    toolUseId?: string
    toolInput: Record<string, unknown>
    partialInputJson: string
  }

interface StreamParseState {
  activeMessageId: string | null
  streamedMessageIds: Set<string>
  blocks: Map<number, StreamBlockState>
  toolUseNames: Map<string, string>
}

export function createSDKMessageParser(options?: ParseOptions): SDKMessageParser {
  const state = createStreamParseState()
  const parseOptions = normalizeParseOptions(options)

  return {
    parse: (sdkMsg: unknown, sessionId: string) =>
      parseSDKMessageWithState(sdkMsg, sessionId, state, parseOptions),
    reset: () => resetStreamParseState(state),
  }
}

/**
 * Stateless parser kept for compatibility and unit tests.
 */
export function parseSDKMessage(
  sdkMsg: unknown,
  sessionId: string,
  options?: ParseOptions,
): ParseResult {
  const parseOptions = normalizeParseOptions(options)
  if (!sdkMsg || typeof sdkMsg !== 'object') {
    return { messages: [] }
  }

  const msg = sdkMsg as Record<string, unknown>
  const type = msg.type as string | undefined

  switch (type) {
    case 'assistant':
      return parseAssistant(msg, sessionId)

    case 'user':
      return parseUser(msg, sessionId, undefined, parseOptions.includeUserMessages)

    case 'result':
      return parseResult(msg, sessionId)

    case 'system':
      return parseSystem(msg, sessionId)

    case 'stream_event':
      if (!parseOptions.includeStreamEvents) {
        return { messages: [] }
      }
      return parseStreamEvent(msg, sessionId)

    case 'tool_progress':
      return parseToolProgress(msg, sessionId)

    case 'tool_use_summary':
      return parseToolUseSummary(msg, sessionId)

    case 'auth_status':
      return { messages: [] }

    default:
      if (typeof type === 'string') {
        console.warn(`[sdk-adapter] Unknown SDK message type: ${type}`)
      }
      return { messages: [] }
  }
}

function parseSDKMessageWithState(
  sdkMsg: unknown,
  sessionId: string,
  streamState: StreamParseState,
  parseOptions: NormalizedParseOptions,
): ParseResult {
  if (!sdkMsg || typeof sdkMsg !== 'object') {
    return { messages: [] }
  }

  const msg = sdkMsg as Record<string, unknown>
  const type = msg.type as string | undefined

  switch (type) {
    case 'assistant':
      return parseAssistantWithStreamAwareness(msg, sessionId, streamState)

    case 'user':
      return parseUser(
        msg,
        sessionId,
        (toolUseId) => (toolUseId ? streamState.toolUseNames.get(toolUseId) : undefined),
        parseOptions.includeUserMessages,
      )

    case 'result': {
      const result = parseResult(msg, sessionId)
      // Each query() invocation is one turn; result marks stream completion.
      resetStreamParseState(streamState)
      return result
    }

    case 'system':
      return parseSystem(msg, sessionId)

    case 'stream_event':
      if (!parseOptions.includeStreamEvents) {
        return { messages: [] }
      }
      return parseStreamEventWithState(msg, sessionId, streamState)

    case 'tool_progress':
      return parseToolProgress(msg, sessionId)

    case 'tool_use_summary':
      return parseToolUseSummary(msg, sessionId)

    case 'auth_status':
      return { messages: [] }

    default:
      if (typeof type === 'string') {
        console.warn(`[sdk-adapter] Unknown SDK message type: ${type}`)
      }
      return { messages: [] }
  }
}

// -- Parsers -----------------------------------------------------------------

function parseAssistant(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const uuid = (msg.uuid as string) ?? crypto.randomUUID()
  const betaMessage = msg.message as Record<string, unknown> | undefined

  if (!betaMessage) {
    return { messages: [] }
  }

  // P1: SDK-level error classification (authentication_failed, rate_limit, etc.)
  const assistantError = msg.error as string | undefined
  if (assistantError) {
    const errorLabels: Record<string, string> = {
      authentication_failed: 'Authentication failed',
      billing_error: 'Billing error',
      rate_limit: 'Rate limit exceeded',
      invalid_request: 'Invalid request',
      server_error: 'Server error',
      max_output_tokens: 'Max output tokens reached',
      unknown: 'Unknown error',
    }
    const label = errorLabels[assistantError] ?? assistantError
    // Still parse content blocks — the assistant may have partial output before the error
    const blocks = (betaMessage.content as readonly SDKContentBlock[]) ?? []
    const contentMessages = parseContentBlocks(blocks, sessionId, uuid)
    return {
      messages: [
        ...contentMessages,
        {
          id: `${uuid}_error`,
          sessionId,
          role: 'system' as const,
          type: 'error' as const,
          content: label,
          timestamp: Date.now(),
        },
      ],
    }
  }

  const blocks = (betaMessage.content as readonly SDKContentBlock[]) ?? []
  const messages = parseContentBlocks(blocks, sessionId, uuid)

  const sdkUsage = betaMessage.usage as Record<string, unknown> | undefined
  const usage = mapUsage(
    sdkUsage
      ? {
        input_tokens: (sdkUsage.input_tokens as number) ?? 0,
        output_tokens: (sdkUsage.output_tokens as number) ?? 0,
        cache_read_input_tokens: sdkUsage.cache_read_input_tokens as number | undefined,
        cache_creation_input_tokens: sdkUsage.cache_creation_input_tokens as number | undefined,
      }
      : undefined,
  )

  if (usage && messages.length > 0) {
    const lastIdx = messages.length - 1
    const enriched = [...messages]
    enriched[lastIdx] = { ...enriched[lastIdx], usage }
    return { messages: enriched }
  }

  return { messages }
}

function parseAssistantWithStreamAwareness(
  msg: Record<string, unknown>,
  sessionId: string,
  streamState: StreamParseState,
): ParseResult {
  const betaMessage = msg.message as Record<string, unknown> | undefined
  const assistantMessageId = betaMessage?.id

  const contentBlocks = Array.isArray(betaMessage?.content)
    ? (betaMessage?.content as readonly Record<string, unknown>[])
    : []
  for (const block of contentBlocks) {
    if (block.type === 'tool_use') {
      rememberToolUse(
        streamState,
        typeof block.id === 'string' ? block.id : undefined,
        typeof block.name === 'string' ? block.name : undefined,
      )
    }
  }

  if (typeof assistantMessageId === 'string' && streamState.streamedMessageIds.has(assistantMessageId)) {
    // stream_event already emitted stable blocks for this assistant message.
    return { messages: [] }
  }

  return parseAssistant(msg, sessionId)
}

function parseUser(
  msg: Record<string, unknown>,
  sessionId: string,
  resolveToolName?: (toolUseId: string | undefined) => string | undefined,
  includeUserMessages = false,
): ParseResult {
  // P1: Filter replay messages during session resume to avoid duplicate rendering
  if (msg.isReplay === true) {
    return { messages: [] }
  }

  const uuid = (msg.uuid as string) ?? crypto.randomUUID()
  const inner = msg.message as Record<string, unknown> | undefined
  const rawContent = inner?.content
  const toolUseResult = msg.tool_use_result as Record<string, unknown> | undefined

  // SDK user messages come in two forms:
  // 1. Plain text content (actual user input)
  // 2. tool_result array (automatic tool execution results)
  if (Array.isArray(rawContent)) {
    const blocks = rawContent as readonly Record<string, unknown>[]
    const hasToolResult = blocks.some((b) => b.type === 'tool_result')

    if (hasToolResult) {
      const messages: Message[] = blocks
        .filter((b) => b.type === 'tool_result')
        .map((b, i) => {
          const toolUseId = b.tool_use_id as string | undefined
          const isError = b.is_error === true
          const blockContent = normalizeContent(b.content)

          let resultContent = blockContent
          if (toolUseResult) {
            const stdout = toolUseResult.stdout as string | undefined
            const file = toolUseResult.file as Record<string, unknown> | undefined
            if (file?.content) {
              resultContent = file.content as string
            } else if (stdout !== undefined) {
              resultContent = stdout.replace(/\r$/g, '')
            }
          }

          return {
            id: `${uuid}_tool_result_${i}`,
            sessionId,
            role: 'tool' as const,
            type: 'tool_result' as const,
            content: resultContent,
            toolResult: resultContent,
            toolName: resolveToolName?.(toolUseId),
            toolUseId,
            success: !isError,
            timestamp: Date.now(),
          }
        })

      return { messages }
    }

    if (includeUserMessages) {
      const textContent = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n')
        .trim()

      if (textContent) {
        return {
          messages: [
            {
              id: uuid,
              sessionId,
              role: 'user',
              type: 'text',
              content: textContent,
              timestamp: Date.now(),
            },
          ],
        }
      }
    }

    // User prompt echoes are rendered optimistically by the renderer in live mode.
    return { messages: [] }
  }

  if (includeUserMessages && typeof rawContent === 'string' && rawContent.trim()) {
    return {
      messages: [
        {
          id: uuid,
          sessionId,
          role: 'user',
          type: 'text',
          content: rawContent,
          timestamp: Date.now(),
        },
      ],
    }
  }

  // Plain string user input is handled optimistically by renderer in live mode.
  if (typeof rawContent === 'string') {
    return { messages: [] }
  }

  return { messages: [] }
}

function parseResult(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const uuid = (msg.uuid as string) ?? crypto.randomUUID()
  const isError =
    msg.is_error === true ||
    (typeof msg.subtype === 'string' && msg.subtype.startsWith('error'))

  if (isError) {
    const errors = msg.errors as readonly string[] | undefined
    const errorText = (msg.error as string) ?? errors?.join('; ') ?? ''

    // Generate a human-readable fallback from the subtype when no explicit error text
    const subtypeFallbacks: Record<string, string> = {
      error_max_turns: 'Maximum conversation turns reached.',
      error_max_budget_usd: 'Budget limit exceeded.',
      error_during_execution: 'Error during execution.',
      error_max_structured_output_retries: 'Structured output retries exhausted.',
    }
    const finalErrorText = errorText || subtypeFallbacks[msg.subtype as string] || ''

    if (!finalErrorText) {
      return { messages: [] }
    }

    return {
      messages: [
        {
          id: uuid,
          sessionId,
          role: 'system',
          type: 'error',
          content: finalErrorText,
          timestamp: Date.now(),
        },
      ],
    }
  }

  const sdkUsage = msg.usage as Record<string, unknown> | undefined
  const baseUsage = mapUsage(
    sdkUsage
      ? {
        input_tokens: (sdkUsage.input_tokens as number) ?? 0,
        output_tokens: (sdkUsage.output_tokens as number) ?? 0,
        cache_read_input_tokens: sdkUsage.cache_read_input_tokens as number | undefined,
        cache_creation_input_tokens: sdkUsage.cache_creation_input_tokens as number | undefined,
      }
      : undefined,
  )

  const costUsd = msg.total_cost_usd as number | undefined
  const numTurns = msg.num_turns as number | undefined
  const durationMs = msg.duration_ms as number | undefined

  const usage = baseUsage
    ? { ...baseUsage, costUsd, numTurns, durationMs }
    : costUsd !== undefined || numTurns !== undefined || durationMs !== undefined
      ? { inputTokens: 0, outputTokens: 0, costUsd, numTurns, durationMs }
      : undefined

  return {
    messages: [
      {
        id: uuid,
        sessionId,
        role: 'system',
        type: 'usage',
        content: '',
        usage,
        timestamp: Date.now(),
      },
    ],
  }
}

function parseSystem(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const subtype = msg.subtype as string | undefined

  switch (subtype) {
    case 'init': {
      const metadata: SessionMetadata = {
        sessionId: (msg.session_id as string) ?? sessionId,
        model: msg.model as string | undefined,
        tools: msg.tools as readonly string[] | undefined,
        cwd: msg.cwd as string | undefined,
        permissionMode: (msg.permissionMode ?? msg.permission_mode) as string | undefined,
        claudeCodeVersion: msg.claude_code_version as string | undefined,
        apiKeySource: msg.apiKeySource as string | undefined,
        mcpServers: msg.mcp_servers as readonly unknown[] | undefined,
        slashCommands: msg.slash_commands as readonly string[] | undefined,
        agents: msg.agents as readonly string[] | undefined,
        skills: msg.skills as readonly string[] | undefined,
        fastModeState: msg.fast_mode_state as string | undefined,
      }
      return { messages: [], metadata }
    }

    case 'status': {
      const status = (msg.status as string | null) ?? null
      const text = status === 'compacting' ? 'Compacting conversation context...' : ''
      if (!text) return { messages: [] }
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'text',
            content: text,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'compact_boundary': {
      const compactMeta = msg.compact_metadata as Record<string, unknown> | undefined
      const trigger = compactMeta?.trigger as string | undefined
      const preTokens = compactMeta?.pre_tokens as number | undefined
      const parts: string[] = ['Session context compacted.']
      if (trigger) parts.push(`Trigger: ${trigger}.`)
      if (preTokens !== undefined) parts.push(`Pre-compact tokens: ~${preTokens.toLocaleString()}.`)
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'compact',
            content: parts.join(' '),
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'hook_started': {
      const hookName = (msg.hook_name as string) ?? 'unknown'
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'text',
            content: `[Hook: ${hookName}] Started`,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'hook_progress': {
      const hookName = (msg.hook_name as string) ?? 'unknown'
      const output = (msg.output as string) ?? (msg.stdout as string) ?? ''
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'text',
            content: output ? `[Hook: ${hookName}] ${output}` : `[Hook: ${hookName}]`,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'hook_response': {
      const hookName = (msg.hook_name as string) ?? 'unknown'
      const outcome = (msg.outcome as string) ?? ''
      const output = (msg.output as string) ?? (msg.stdout as string) ?? ''
      const label = outcome === 'error' ? 'Failed' : outcome === 'cancelled' ? 'Cancelled' : 'Completed'
      const content = output ? `[Hook: ${hookName}] ${label}: ${output}` : `[Hook: ${hookName}] ${label}`
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: outcome === 'error' ? 'error' : 'text',
            content,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'task_notification': {
      const taskStatus = (msg.status as string) ?? ''
      const summary = (msg.summary as string) ?? ''
      const taskId = (msg.task_id as string) ?? ''
      const label = taskStatus === 'failed' ? 'Task failed' : taskStatus === 'stopped' ? 'Task stopped' : 'Task completed'
      const content = summary ? `${label}: ${summary}` : `${label} (${taskId})`
      return {
        messages: [
          {
            id: (msg.uuid as string) ?? crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: taskStatus === 'failed' ? 'error' : 'text',
            content,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'files_persisted':
      return { messages: [] }

    default:
      return { messages: [] }
  }
}

/**
 * Legacy/stateless stream_event parser.
 */
function parseStreamEvent(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const event = msg.event as Record<string, unknown> | undefined
  if (!event) return { messages: [] }

  const eventType = event.type as string | undefined

  if (eventType !== 'content_block_delta') {
    return { messages: [] }
  }

  const delta = event.delta as Record<string, unknown> | undefined
  if (!delta) return { messages: [] }

  const deltaType = delta.type as string | undefined
  const text = (delta.text as string | undefined) ?? (delta.thinking as string | undefined)

  if (!text) return { messages: [] }

  const msgType = deltaType === 'thinking_delta' ? 'thinking' : 'text'

  return {
    messages: [
      {
        id: (msg.uuid as string) ?? crypto.randomUUID(),
        sessionId,
        role: 'assistant',
        type: msgType,
        content: text,
        isStreamDelta: true,
        timestamp: Date.now(),
      },
    ],
  }
}

function parseStreamEventWithState(
  msg: Record<string, unknown>,
  sessionId: string,
  streamState: StreamParseState,
): ParseResult {
  const event = msg.event as Record<string, unknown> | undefined
  if (!event) return { messages: [] }

  const eventType = event.type as string | undefined

  switch (eventType) {
    case 'message_start':
      return handleMessageStart(event, msg, streamState)

    case 'content_block_start':
      return handleContentBlockStart(event, sessionId, streamState)

    case 'content_block_delta':
      return handleContentBlockDelta(event, msg, sessionId, streamState)

    case 'content_block_stop':
      return handleContentBlockStop(event, sessionId, streamState)

    case 'message_delta':
      return { messages: [] }

    case 'message_stop':
      return handleMessageStop(streamState)

    default:
      return { messages: [] }
  }
}

function handleMessageStart(
  event: Record<string, unknown>,
  msg: Record<string, unknown>,
  streamState: StreamParseState,
): ParseResult {
  const streamMessage = event.message as Record<string, unknown> | undefined
  const streamMessageId =
    typeof streamMessage?.id === 'string' && streamMessage.id.length > 0
      ? streamMessage.id
      : (msg.uuid as string) ?? crypto.randomUUID()

  streamState.activeMessageId = streamMessageId
  streamState.blocks.clear()
  return { messages: [] }
}

function handleContentBlockStart(
  event: Record<string, unknown>,
  sessionId: string,
  streamState: StreamParseState,
): ParseResult {
  if (!streamState.activeMessageId) return { messages: [] }

  const index = readEventIndex(event)
  if (index === null) return { messages: [] }

  const contentBlock = event.content_block as Record<string, unknown> | undefined
  if (!contentBlock) return { messages: [] }

  const blockType = contentBlock.type as string | undefined
  switch (blockType) {
    case 'text': {
      const text = typeof contentBlock.text === 'string' ? contentBlock.text : ''
      streamState.blocks.set(index, { kind: 'text', text })
      if (text) {
        streamState.streamedMessageIds.add(streamState.activeMessageId)
        return {
          messages: [
            buildAssistantStreamMessage({
              id: buildStreamBlockMessageId(streamState.activeMessageId, index),
              sessionId,
              type: 'text',
              content: text,
              isStreamDelta: true,
            }),
          ],
        }
      }
      return { messages: [] }
    }

    case 'thinking': {
      const thinking = typeof contentBlock.thinking === 'string' ? contentBlock.thinking : ''
      streamState.blocks.set(index, { kind: 'thinking', thinking })
      if (thinking) {
        streamState.streamedMessageIds.add(streamState.activeMessageId)
        return {
          messages: [
            buildAssistantStreamMessage({
              id: buildStreamBlockMessageId(streamState.activeMessageId, index),
              sessionId,
              type: 'thinking',
              content: thinking,
              isStreamDelta: true,
            }),
          ],
        }
      }
      return { messages: [] }
    }

    case 'tool_use': {
      const toolInput = isRecord(contentBlock.input) ? contentBlock.input : {}
      streamState.blocks.set(index, {
        kind: 'tool_use',
        toolName: typeof contentBlock.name === 'string' ? contentBlock.name : '',
        toolUseId: typeof contentBlock.id === 'string' ? contentBlock.id : undefined,
        toolInput,
        partialInputJson: '',
      })
      return { messages: [] }
    }

    default:
      return { messages: [] }
  }
}

function handleContentBlockDelta(
  event: Record<string, unknown>,
  msg: Record<string, unknown>,
  sessionId: string,
  streamState: StreamParseState,
): ParseResult {
  if (!streamState.activeMessageId) {
    return parseStreamEvent(msg, sessionId)
  }

  const index = readEventIndex(event)
  if (index === null) {
    return parseStreamEvent(msg, sessionId)
  }

  const delta = event.delta as Record<string, unknown> | undefined
  if (!delta) {
    return parseStreamEvent(msg, sessionId)
  }

  const deltaType = delta.type as string | undefined
  if (!deltaType) return { messages: [] }

  switch (deltaType) {
    case 'text_delta': {
      const chunk = delta.text
      if (typeof chunk !== 'string' || chunk.length === 0) return { messages: [] }

      const existing = streamState.blocks.get(index)
      const currentText = existing && existing.kind === 'text' ? existing.text : ''
      const nextText = `${currentText}${chunk}`
      streamState.blocks.set(index, { kind: 'text', text: nextText })
      streamState.streamedMessageIds.add(streamState.activeMessageId)

      return {
        messages: [
          buildAssistantStreamMessage({
            id: buildStreamBlockMessageId(streamState.activeMessageId, index),
            sessionId,
            type: 'text',
            content: nextText,
            isStreamDelta: true,
          }),
        ],
      }
    }

    case 'thinking_delta': {
      const chunk = delta.thinking
      if (typeof chunk !== 'string' || chunk.length === 0) return { messages: [] }

      const existing = streamState.blocks.get(index)
      const currentThinking = existing && existing.kind === 'thinking' ? existing.thinking : ''
      const nextThinking = `${currentThinking}${chunk}`
      streamState.blocks.set(index, { kind: 'thinking', thinking: nextThinking })
      streamState.streamedMessageIds.add(streamState.activeMessageId)

      return {
        messages: [
          buildAssistantStreamMessage({
            id: buildStreamBlockMessageId(streamState.activeMessageId, index),
            sessionId,
            type: 'thinking',
            content: nextThinking,
            isStreamDelta: true,
          }),
        ],
      }
    }

    case 'input_json_delta': {
      const chunk = delta.partial_json
      if (typeof chunk !== 'string') return { messages: [] }

      const existing = streamState.blocks.get(index)
      const toolUseState: StreamBlockState =
        existing && existing.kind === 'tool_use'
          ? existing
          : {
            kind: 'tool_use',
            toolName: '',
            toolUseId: undefined,
            toolInput: {},
            partialInputJson: '',
          }

      streamState.blocks.set(index, {
        ...toolUseState,
        partialInputJson: `${toolUseState.partialInputJson}${chunk}`,
      })
      streamState.streamedMessageIds.add(streamState.activeMessageId)
      return { messages: [] }
    }

    default:
      return { messages: [] }
  }
}

function handleContentBlockStop(
  event: Record<string, unknown>,
  sessionId: string,
  streamState: StreamParseState,
): ParseResult {
  if (!streamState.activeMessageId) return { messages: [] }

  const index = readEventIndex(event)
  if (index === null) return { messages: [] }

  const block = streamState.blocks.get(index)
  if (!block) return { messages: [] }

  const messageId = buildStreamBlockMessageId(streamState.activeMessageId, index)
  streamState.streamedMessageIds.add(streamState.activeMessageId)
  streamState.blocks.delete(index)

  if (block.kind === 'text') {
    return {
      messages: [
        buildAssistantStreamMessage({
          id: messageId,
          sessionId,
          type: 'text',
          content: block.text,
          isStreamDelta: false,
        }),
      ],
    }
  }

  if (block.kind === 'thinking') {
    return {
      messages: [
        buildAssistantStreamMessage({
          id: messageId,
          sessionId,
          type: 'thinking',
          content: block.thinking,
          isStreamDelta: false,
        }),
      ],
    }
  }

  const toolInput = parseToolUseInput(block.toolInput, block.partialInputJson)
  rememberToolUse(streamState, block.toolUseId, block.toolName)
  return {
    messages: [
      {
        id: messageId,
        sessionId,
        role: 'assistant',
        type: 'tool_use',
        content: '',
        toolName: block.toolName,
        toolUseId: block.toolUseId,
        toolInput,
        isStreamDelta: false,
        timestamp: Date.now(),
      },
    ],
  }
}

function handleMessageStop(streamState: StreamParseState): ParseResult {
  streamState.activeMessageId = null
  streamState.blocks.clear()
  return { messages: [] }
}

function parseToolProgress(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const toolName = (msg.tool_name as string) ?? ''
  const elapsed = msg.elapsed_time_seconds as number | undefined
  const progressText = elapsed !== undefined ? `Running... ${elapsed.toFixed(1)}s` : 'Running...'

  return {
    messages: [
      {
        id: (msg.uuid as string) ?? crypto.randomUUID(),
        sessionId,
        role: 'tool',
        type: 'tool_progress',
        content: progressText,
        toolName,
        toolUseId: msg.tool_use_id as string | undefined,
        timestamp: Date.now(),
      },
    ],
  }
}

function parseToolUseSummary(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const summary = (msg.summary as string) ?? ''
  if (!summary) return { messages: [] }

  return {
    messages: [
      {
        id: (msg.uuid as string) ?? crypto.randomUUID(),
        sessionId,
        role: 'system',
        type: 'text',
        content: summary,
        timestamp: Date.now(),
      },
    ],
  }
}

// -- Helpers -----------------------------------------------------------------

function normalizeParseOptions(options?: ParseOptions): NormalizedParseOptions {
  return {
    includeUserMessages: options?.includeUserMessages ?? DEFAULT_PARSE_OPTIONS.includeUserMessages,
    includeStreamEvents: options?.includeStreamEvents ?? DEFAULT_PARSE_OPTIONS.includeStreamEvents,
  }
}

function createStreamParseState(): StreamParseState {
  return {
    activeMessageId: null,
    streamedMessageIds: new Set<string>(),
    blocks: new Map<number, StreamBlockState>(),
    toolUseNames: new Map<string, string>(),
  }
}

function resetStreamParseState(state: StreamParseState): void {
  state.activeMessageId = null
  state.streamedMessageIds.clear()
  state.blocks.clear()
  state.toolUseNames.clear()
}

function readEventIndex(event: Record<string, unknown>): number | null {
  const index = event.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    return null
  }
  return index
}

function buildStreamBlockMessageId(streamMessageId: string, index: number): string {
  return `${streamMessageId}_block_${index}`
}

function buildAssistantStreamMessage(input: {
  id: string
  sessionId: string
  type: 'text' | 'thinking'
  content: string
  isStreamDelta: boolean
}): Message {
  return {
    id: input.id,
    sessionId: input.sessionId,
    role: 'assistant',
    type: input.type,
    content: input.content,
    isStreamDelta: input.isStreamDelta,
    timestamp: Date.now(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseToolUseInput(
  base: Record<string, unknown>,
  partialInputJson: string,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }

  if (!partialInputJson) {
    return merged
  }

  try {
    const parsed = JSON.parse(partialInputJson)
    if (isRecord(parsed)) {
      return { ...merged, ...parsed }
    }
    return { ...merged, _raw: partialInputJson }
  } catch {
    return { ...merged, _raw: partialInputJson }
  }
}

function rememberToolUse(
  state: StreamParseState,
  toolUseId: string | undefined,
  toolName: string | undefined,
): void {
  if (!toolUseId || !toolName) return
  state.toolUseNames.set(toolUseId, toolName)
}
