// ============================================================
// Message Parser - SDKMessage -> ParseResult
// ============================================================
//
// This module is the public entry point. Individual message-type
// parsers live in ./parsers/*-parser.ts; shared helpers and
// stream state live in ./parse-helpers.ts and ./stream-state.ts.
// ============================================================

import type { SessionMetadata } from './sdk-types'
import { createLogger } from '../logger'
import { createStreamParseState, resetStreamParseState } from './stream-state'
import type { StreamParseState } from './stream-state'
import { parseAssistant, parseAssistantWithStreamAwareness } from './parsers/assistant-parser'
import { parseUser } from './parsers/user-parser'
import { parseResult } from './parsers/result-parser'
import { parseSystem } from './parsers/system-parser'
import { parseStreamEvent, parseStreamEventWithState } from './parsers/stream-event-parser'
import { parseToolProgress, parseToolUseSummary } from './parsers/tool-parser'

const logger = createLogger('sdk-parser')

export interface ParseResult {
  readonly messages: readonly import('@common/types').Message[]
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
        logger.warn(`Unknown SDK message type: ${type}`)
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
        logger.warn(`Unknown SDK message type: ${type}`)
      }
      return { messages: [] }
  }
}

// -- Helpers -----------------------------------------------------------------

function normalizeParseOptions(options?: ParseOptions): NormalizedParseOptions {
  return {
    includeUserMessages: options?.includeUserMessages ?? DEFAULT_PARSE_OPTIONS.includeUserMessages,
    includeStreamEvents: options?.includeStreamEvents ?? DEFAULT_PARSE_OPTIONS.includeStreamEvents,
  }
}
