import type { Message } from '@common/types';

/**
 * Map internal Message to JSONL entry for persistence.
 */
export function mapMessageToJsonl(message: Message): Record<string, unknown> {
  const base = {
    id: message.id,
    timestamp: message.timestamp,
  };

  switch (message.type) {
    case 'text':
      return {
        ...base,
        type: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      };
    case 'thinking':
      return {
        ...base,
        type: 'thinking',
        content: message.content,
      };
    case 'tool_use':
      return {
        ...base,
        type: 'tool_use',
        tool_name: message.toolName,
        tool_input: message.toolInput,
      };
    case 'tool_result':
      return {
        ...base,
        type: 'tool_result',
        tool_name: message.toolName,
        tool_use_id: message.toolUseId,
        content: message.toolResult,
        success: message.success,
      };
    case 'tool_progress':
      return {
        ...base,
        type: 'tool_progress',
        tool_name: message.toolName,
        content: message.content,
      };
    case 'usage':
      return {
        ...base,
        type: 'usage',
        input_tokens: message.usage?.inputTokens,
        output_tokens: message.usage?.outputTokens,
        cache_read_tokens: message.usage?.cacheReadTokens,
      };
    case 'error':
      return {
        ...base,
        type: 'error',
        content: message.content,
      };
    default:
      return {
        ...base,
        type: 'unknown',
        content: message.content,
      };
  }
}
