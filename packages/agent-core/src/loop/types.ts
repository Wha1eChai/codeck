export interface StepUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
}

export interface TotalUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly reasoningTokens: number
  readonly steps: number
}

export type AgentEvent =
  | { readonly type: 'text_start' }
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'text_end'; readonly text: string }
  | { readonly type: 'thinking_start' }
  | { readonly type: 'thinking_delta'; readonly text: string }
  | { readonly type: 'thinking_end'; readonly text: string }
  | { readonly type: 'tool_call_start'; readonly toolCallId: string; readonly toolName: string }
  | { readonly type: 'tool_call_args'; readonly toolCallId: string; readonly args: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly toolCallId: string; readonly toolName: string; readonly result: string; readonly isError: boolean }
  | { readonly type: 'step_end'; readonly step: number; readonly finishReason: string; readonly usage: StepUsage }
  | { readonly type: 'error'; readonly error: string }
  | { readonly type: 'child_events'; readonly toolCallId: string; readonly events: readonly AgentEvent[] }
  | { readonly type: 'done'; readonly totalUsage: TotalUsage }
