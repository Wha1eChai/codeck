/**
 * CLI Message Types — discriminated union for structured output from CLI tools.
 *
 * Claude Code CLI `--output-format stream-json` produces JSON-lines with these types.
 * Other CLIs (Codex, OpenCode) may use a subset or different schema.
 */

export interface CliContentBlockText {
  readonly type: 'text'
  readonly text: string
}

export interface CliContentBlockToolUse {
  readonly type: 'tool_use'
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}

export interface CliContentBlockToolResult {
  readonly type: 'tool_result'
  readonly tool_use_id: string
  readonly content: string
  readonly is_error?: boolean
}

export interface CliContentBlockThinking {
  readonly type: 'thinking'
  readonly thinking: string
}

export type CliContentBlock =
  | CliContentBlockText
  | CliContentBlockToolUse
  | CliContentBlockToolResult
  | CliContentBlockThinking

export interface CliUsage {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_input_tokens?: number
  readonly cache_creation_input_tokens?: number
}

/**
 * Discriminated union of all CLI message types.
 *
 * Claude Code CLI stream-json format:
 * - `assistant` — model response (may contain text, tool_use, thinking blocks)
 * - `user` — echoed user input
 * - `result` — final result with usage/cost (subtype: success | error_*)
 * - `system` — system events (init, status)
 */
export type CliMessage =
  | {
      readonly type: 'assistant'
      readonly message: {
        readonly content: readonly CliContentBlock[]
      }
      readonly session_id?: string
    }
  | {
      readonly type: 'user'
      readonly message: {
        readonly content: readonly CliContentBlock[] | string
      }
    }
  | {
      readonly type: 'result'
      readonly subtype: string
      readonly cost_usd?: number
      readonly duration_ms?: number
      readonly duration_api_ms?: number
      readonly is_error?: boolean
      readonly total_cost_usd?: number
      readonly usage?: CliUsage
      readonly result?: string
      readonly session_id?: string
    }
  | {
      readonly type: 'system'
      readonly subtype: string
      readonly session_id?: string
      readonly tools?: readonly string[]
      readonly mcp_servers?: readonly string[]
    }

/**
 * Parsed result from a single CLI JSON line.
 */
export interface CliParseResult {
  readonly messages: readonly import('@common/types').Message[]
  readonly metadata?: CliSessionMetadata
  readonly isDone?: boolean
}

export interface CliSessionMetadata {
  readonly sessionId?: string
  readonly costUsd?: number
  readonly usage?: CliUsage
}
