// ============================================================
// Stream Parse State — mutable state for stateful stream parsing
// ============================================================

export type StreamBlockState =
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

export interface StreamParseState {
  activeMessageId: string | null
  streamedMessageIds: Set<string>
  blocks: Map<number, StreamBlockState>
  toolUseNames: Map<string, string>
}

export function createStreamParseState(): StreamParseState {
  return {
    activeMessageId: null,
    streamedMessageIds: new Set<string>(),
    blocks: new Map<number, StreamBlockState>(),
    toolUseNames: new Map<string, string>(),
  }
}

export function resetStreamParseState(state: StreamParseState): void {
  state.activeMessageId = null
  state.streamedMessageIds.clear()
  state.blocks.clear()
  state.toolUseNames.clear()
}
