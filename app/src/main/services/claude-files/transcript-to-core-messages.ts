import type { Message } from '@common/types';

function canReplaceInTranscript(message: Message): boolean {
  return message.type === 'text' || message.type === 'thinking' || message.type === 'tool_use';
}

function compactTranscript(messages: readonly Message[]): Message[] {
  const compacted: Message[] = [];
  const replaceableIndexes = new Map<string, number>();

  for (const message of messages) {
    if (canReplaceInTranscript(message)) {
      const existingIndex = replaceableIndexes.get(message.id);
      if (existingIndex !== undefined) {
        compacted[existingIndex] = message;
        continue;
      }
      replaceableIndexes.set(message.id, compacted.length);
    }

    compacted.push(message);
  }

  return compacted;
}

type UserContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>;

/**
 * Structural subset of Vercel AI SDK's CoreMessage.
 *
 * We intentionally avoid importing CoreMessage directly because its deeply
 * nested discriminated unions make it impractical to construct from external
 * data. The actual API call validates the message structure, so any mismatch
 * surfaces as an API error rather than silent corruption.
 */
type CoreLikeMessage =
  | { role: 'user'; content: UserContent }
  | { role: 'assistant'; content: AssistantBlock[] }
  | { role: 'tool'; content: ToolResultBlock[] };

function toUserContent(message: Message): string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> {
  if (message.images && message.images.length > 0) {
    return [
      { type: 'text', text: message.content },
      ...message.images.map((image) => ({ type: 'image' as const, image })),
    ];
  }

  return message.content;
}

type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> };

type ToolResultBlock = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: string;
  isError?: boolean;
};

export function reconstructCoreMessages(messages: readonly Message[]): CoreLikeMessage[] {
  const compacted = compactTranscript(messages);
  const coreMessages: CoreLikeMessage[] = [];

  let pendingAssistant: AssistantBlock[] = [];
  let pendingToolResults: ToolResultBlock[] = [];

  const flushAssistant = (): void => {
    if (pendingAssistant.length === 0) {
      return;
    }
    coreMessages.push({
      role: 'assistant',
      content: pendingAssistant,
    });
    pendingAssistant = [];
  };

  const flushToolResults = (): void => {
    if (pendingToolResults.length === 0) {
      return;
    }
    coreMessages.push({
      role: 'tool',
      content: pendingToolResults,
    });
    pendingToolResults = [];
  };

  for (const message of compacted) {
    if (message.role === 'user' && message.type === 'text') {
      flushAssistant();
      flushToolResults();
      coreMessages.push({
        role: 'user',
        content: toUserContent(message),
      });
      continue;
    }

    if (message.role === 'assistant') {
      flushToolResults();

      if (message.type === 'text' && message.content) {
        pendingAssistant.push({ type: 'text', text: message.content });
      } else if (message.type === 'tool_use' && message.toolUseId && message.toolName) {
        pendingAssistant.push({
          type: 'tool-call',
          toolCallId: message.toolUseId,
          toolName: message.toolName,
          args: message.toolInput ?? {},
        });
      }

      continue;
    }

    if (message.role === 'tool' && message.type === 'tool_result' && message.toolUseId && message.toolName) {
      flushAssistant();
      pendingToolResults.push({
        type: 'tool-result',
        toolCallId: message.toolUseId,
        toolName: message.toolName,
        result: message.toolResult ?? message.content,
        ...(message.success === false ? { isError: true } : {}),
      });
    }
  }

  flushAssistant();
  flushToolResults();

  return coreMessages;
}
