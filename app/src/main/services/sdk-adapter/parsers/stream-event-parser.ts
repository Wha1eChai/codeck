// ============================================================
// Stream Event Parser — SDK stream_event → ParseResult
// ============================================================

import crypto from 'crypto'
import type { StreamParseState } from '../stream-state'
import {
  readEventIndex,
  buildStreamBlockMessageId,
  buildAssistantStreamMessage,
  isRecord,
  parseToolUseInput,
  rememberToolUse,
} from '../parse-helpers'
import type { ParseResult } from '../message-parser'
import type { StreamBlockState } from '../stream-state'

/**
 * Legacy/stateless stream_event parser.
 */
export function parseStreamEvent(msg: Record<string, unknown>, sessionId: string): ParseResult {
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

export function parseStreamEventWithState(
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
