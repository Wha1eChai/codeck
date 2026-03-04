import crypto from 'node:crypto';
import type { Message } from '@common/types';
import type { RawJsonlEntry } from './types';
import {
  createSDKMessageParser,
  parseSDKMessage,
} from '../sdk-adapter';
import type { SDKMessageParser } from '../sdk-adapter';

type MessageRole = Message['role'];

const SDK_ENTRY_TYPES = new Set([
  'assistant',
  'user',
  'result',
  'system',
  'stream_event',
  'tool_progress',
  'tool_use_summary',
  'auth_status',
]);

interface MapJsonlEntryOptions {
  readonly sdkParser?: SDKMessageParser;
}

export interface SessionJsonlMapper {
  mapEntry: (entry: RawJsonlEntry) => Message[];
  reset: () => void;
}

/**
 * Create a stateful JSONL mapper for one session replay.
 * Keeps SDK parser context across lines so tool_use -> tool_result linkage is preserved.
 */
export function createSessionJsonlMapper(sessionId: string): SessionJsonlMapper {
  const sdkParser = createSDKMessageParser({
    includeUserMessages: true,
    includeStreamEvents: false,
  });

  return {
    mapEntry: (entry: RawJsonlEntry) =>
      mapJsonlEntryToMessages(entry, sessionId, { sdkParser }),
    reset: () => sdkParser.reset(),
  };
}

/**
 * Map a JSONL entry to internal Message type.
 * Kept for compatibility with existing callers that expect a single message.
 */
export function mapJsonlEntry(entry: RawJsonlEntry, sessionId: string): Message | null {
  const messages = mapJsonlEntryToMessages(entry, sessionId);
  return messages[0] ?? null;
}

/**
 * Map a JSONL entry to one or more internal messages.
 * Native Claude rows may fan out into multiple blocks.
 */
export function mapJsonlEntryToMessages(
  entry: RawJsonlEntry,
  sessionId: string,
  options?: MapJsonlEntryOptions,
): Message[] {
  const type = entry.type;

  // Skip metadata/control rows.
  if (
    entry.isSidechain === true ||
    type === 'session_meta' ||
    type === 'session_runtime' ||
    type === 'system_init' ||
    type === 'queue-operation'
  ) {
    return [];
  }

  const sdkMessages = parseSdkHistoryEntry(entry, sessionId, options?.sdkParser);
  if (sdkMessages !== null) {
    return sdkMessages;
  }

  const entryRole: MessageRole = (entry.role as MessageRole) || inferRoleFromType(type);
  const entryType = normalizeMessageType(type, entry);

  switch (entryType) {
    case 'text':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: entryRole || 'assistant',
          type: 'text',
          content: extractLegacyText(entry),
          timestamp: extractTimestamp(entry),
        },
      ];

    case 'thinking':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: 'assistant',
          type: 'thinking',
          content: String(entry.content ?? entry.thinking ?? ''),
          timestamp: extractTimestamp(entry),
        },
      ];

    case 'tool_use':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: 'assistant',
          type: 'tool_use',
          content: '',
          timestamp: extractTimestamp(entry),
          toolName: entry.tool_name || entry.tool,
          toolInput: entry.tool_input || entry.input,
        },
      ];

    case 'tool_result':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: 'tool',
          type: 'tool_result',
          content: String(entry.content ?? entry.output ?? ''),
          timestamp: extractTimestamp(entry),
          toolName: typeof entry.tool_name === 'string' ? entry.tool_name : undefined,
          toolResult: String(entry.content ?? entry.output ?? entry.result ?? ''),
          toolUseId: typeof entry.tool_use_id === 'string' ? entry.tool_use_id : undefined,
          success: inferSuccess(entry),
        },
      ];

    case 'tool_progress':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: 'tool',
          type: 'tool_progress',
          content: String(entry.content ?? ''),
          timestamp: extractTimestamp(entry),
          toolName: typeof entry.tool_name === 'string' ? entry.tool_name : undefined,
          toolUseId: typeof entry.tool_use_id === 'string' ? entry.tool_use_id : undefined,
        },
      ];

    case 'usage':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: 'system',
          type: 'usage',
          content: '',
          timestamp: extractTimestamp(entry),
          usage: {
            inputTokens: entry.input_tokens || entry.inputTokens || 0,
            outputTokens: entry.output_tokens || entry.outputTokens || 0,
            cacheReadTokens: entry.cache_read_tokens || entry.cacheReadTokens,
          },
        },
      ];

    case 'error':
      return [
        {
          id: entry.id || crypto.randomUUID(),
          sessionId,
          role: 'system',
          type: 'error',
          content: String(entry.content ?? entry.error ?? extractLegacyText(entry) ?? 'Unknown error'),
          timestamp: extractTimestamp(entry),
        },
      ];

    default: {
      const fallbackText = extractLegacyText(entry);
      if (fallbackText) {
        return [
          {
            id: entry.id || crypto.randomUUID(),
            sessionId,
            role: entryRole || 'assistant',
            type: 'text',
            content: fallbackText,
            timestamp: extractTimestamp(entry),
          },
        ];
      }
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseSdkHistoryEntry(
  entry: RawJsonlEntry,
  sessionId: string,
  sdkParser?: SDKMessageParser,
): Message[] | null {
  if (!entry.type || !SDK_ENTRY_TYPES.has(entry.type)) {
    return null;
  }
  if (!isSdkNativeShape(entry)) {
    return null;
  }

  const parsed = sdkParser
    ? sdkParser.parse(entry, sessionId)
    : parseSDKMessage(entry, sessionId, {
      includeUserMessages: true,
      includeStreamEvents: false,
    });

  const timestamp = extractTimestamp(entry);
  return parsed.messages.map((message) => ({
    ...message,
    timestamp,
  }));
}

function isSdkNativeShape(entry: RawJsonlEntry): boolean {
  switch (entry.type) {
    case 'assistant':
    case 'user':
      return isRecord(entry.message);

    case 'result':
    case 'system':
      return typeof entry.subtype === 'string';

    case 'stream_event':
      return isRecord(entry.event);

    case 'tool_progress':
      return typeof entry.tool_name === 'string' || typeof entry.tool_use_id === 'string';

    case 'tool_use_summary':
      return typeof entry.summary === 'string';

    case 'auth_status':
      return true;

    default:
      return false;
  }
}

function extractLegacyText(entry: RawJsonlEntry): string {
  const value =
    typeof entry.content === 'string'
      ? entry.content
      : typeof entry.prompt === 'string'
        ? entry.prompt
        : typeof entry.message === 'string'
          ? entry.message
          : '';
  return String(value);
}

function inferRoleFromType(type: string | undefined): MessageRole {
  switch (type) {
    case 'user':
    case 'user_message':
      return 'user';
    case 'assistant':
    case 'assistant_message':
    case 'ai':
      return 'assistant';
    case 'tool_use':
    case 'tool_result':
    case 'tool':
      return 'tool';
    default:
      return 'assistant';
  }
}

function normalizeMessageType(type: string | undefined, entry: RawJsonlEntry): string {
  if (type === 'thinking' || type === 'reasoning' || entry.thinking) {
    return 'thinking';
  }
  if (type?.startsWith('tool_') || type === 'tool') {
    return type;
  }
  if (type === 'usage' || type === 'tokens' || entry.input_tokens || entry.inputTokens) {
    return 'usage';
  }
  if (type === 'error' || entry.error || entry.is_error) {
    return 'error';
  }
  return 'text';
}

export function extractTimestamp(entry: RawJsonlEntry): number {
  const ts = entry.timestamp ?? entry.ts ?? entry.time ?? entry.created_at ?? entry.createdAt;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime() || Date.now();
  return Date.now();
}

function inferSuccess(entry: RawJsonlEntry): boolean | undefined {
  if (entry.success !== undefined) return Boolean(entry.success);
  if (entry.is_success !== undefined) return Boolean(entry.is_success);
  if (entry.is_error !== undefined) return !entry.is_error;
  if (entry.error) return false;
  if (entry.exit_code !== undefined) return entry.exit_code === 0;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}
