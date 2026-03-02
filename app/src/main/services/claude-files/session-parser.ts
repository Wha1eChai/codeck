import crypto from 'node:crypto';
import type { Message, PermissionMode, RuntimeProvider } from '@common/types';
import type { RawJsonlEntry, SessionFileMetadata, SessionParseResult } from './types';
import {
  createSDKMessageParser,
  parseSDKMessage,
} from '../sdk-adapter';
import type { SDKMessageParser } from '../sdk-adapter';

type MessageRole = Message['role'];

const MAX_NAME_LENGTH = 50;
const DEFAULT_RUNTIME: RuntimeProvider = 'claude';
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
 * Parse session name from a JSONL file.
 * Kept for backward compatibility with existing callers.
 */
export async function extractSessionName(
  readFile: (path: string, encoding: 'utf-8') => Promise<string>,
  filePath: string,
): Promise<string | null> {
  const metadata = await extractSessionMetadata(readFile, filePath);
  return metadata.name ?? null;
}

/**
 * Extract structured session metadata from JSONL session header/content.
 * Includes SDK session ID for resume capability.
 */
export async function extractSessionMetadata(
  readFile: (path: string, encoding: 'utf-8') => Promise<string>,
  filePath: string,
): Promise<SessionFileMetadata> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const metadata: SessionFileMetadata = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry = JSON.parse(trimmed) as RawJsonlEntry;
        if (entry.isSidechain === true) continue;

        if (!metadata.sdkSessionId) {
          const sdkSessionId = extractSdkSessionId(entry);
          if (sdkSessionId) {
            metadata.sdkSessionId = sdkSessionId;
          }
        }

        if (entry.type === 'session_meta') {
          if (!metadata.name && typeof entry.name === 'string' && entry.name.trim()) {
            metadata.name = entry.name.trim();
          }
          if (!metadata.permissionMode) {
            metadata.permissionMode = parsePermissionMode(entry.permission_mode ?? entry.permissionMode);
          }
          if (!metadata.runtime) {
            metadata.runtime = parseRuntimeProvider(entry.runtime ?? entry.runtime_provider);
          }
          continue;
        }

        if (!metadata.permissionMode) {
          metadata.permissionMode = parsePermissionMode(entry.permissionMode ?? entry.permission_mode);
        }

        if (!metadata.name) {
          const inferred = inferSessionName(entry);
          if (inferred) {
            metadata.name = inferred;
          }
        }
      } catch {
        continue;
      }
    }

    return metadata;
  } catch {
    return {};
  }
}

/**
 * Parse detailed session info including message count.
 */
export async function parseSessionDetails(
  readFile: (path: string, encoding: 'utf-8') => Promise<string>,
  statFile: (path: string) => Promise<{ birthtimeMs: number; mtimeMs: number }>,
  filePath: string,
  sessionId: string,
  projectPath: string,
): Promise<SessionParseResult | null> {
  try {
    const stats = await statFile(filePath);
    const content = await readFile(filePath, 'utf-8');

    let messageCount = 0;
    let lastTimestamp = stats.mtimeMs;

    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as RawJsonlEntry;
        const messages = mapJsonlEntryToMessages(entry, sessionId);
        messageCount += messages.length;
        if (entry.timestamp && entry.timestamp > lastTimestamp) {
          lastTimestamp = entry.timestamp;
        }
      } catch {
        // Skip malformed lines
      }
    }

    const metadata = await extractSessionMetadata(readFile, filePath);

    return {
      session: {
        id: sessionId,
        name: metadata.name || `Session ${sessionId.substring(0, 6)}`,
        projectPath,
        runtime: metadata.runtime || DEFAULT_RUNTIME,
        permissionMode: metadata.permissionMode || 'default',
        createdAt: stats.birthtimeMs,
        updatedAt: stats.mtimeMs,
      },
      messageCount,
      lastActivity: lastTimestamp,
    };
  } catch {
    return null;
  }
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

function inferSessionName(entry: RawJsonlEntry): string | null {
  if (
    (entry.type === 'user' || entry.type === 'user_message') &&
    typeof entry.content === 'string' &&
    entry.content.trim()
  ) {
    return toSessionName(entry.content.trim());
  }

  const envelope = extractMessageEnvelope(entry);
  if (entry.type === 'user' && envelope?.content && Array.isArray(envelope.content)) {
    const text = envelope.content
      .filter((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
      .map((block) => String((block as Record<string, unknown>).text))
      .join('\n')
      .trim();
    if (text) return toSessionName(text);
  }

  if (typeof entry.prompt === 'string' && entry.prompt.trim()) {
    return toSessionName(entry.prompt.trim());
  }

  return null;
}

function extractSdkSessionId(entry: RawJsonlEntry): string | null {
  if (entry.type === 'session_runtime') {
    const fromRuntime = entry.sdk_session_id ?? entry.session_id;
    return typeof fromRuntime === 'string' && fromRuntime ? fromRuntime : null;
  }

  if (entry.type === 'system' && entry.subtype === 'init') {
    return typeof entry.session_id === 'string' && entry.session_id ? entry.session_id : null;
  }

  if (typeof entry.sessionId === 'string' && entry.sessionId) {
    return entry.sessionId;
  }

  if (typeof entry.session_id === 'string' && entry.session_id) {
    return entry.session_id;
  }

  return null;
}

function extractMessageEnvelope(entry: RawJsonlEntry): { content?: unknown; usage?: unknown; id?: unknown } | null {
  if (!isRecord(entry.message)) return null;
  return {
    content: entry.message.content,
    usage: entry.message.usage,
    id: entry.message.id,
  };
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

function toSessionName(raw: string): string {
  return raw.length > MAX_NAME_LENGTH ? `${raw.substring(0, MAX_NAME_LENGTH)}...` : raw;
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

function extractTimestamp(entry: RawJsonlEntry): number {
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

function parsePermissionMode(value: unknown): PermissionMode | undefined {
  return value === 'default' ||
    value === 'plan' ||
    value === 'acceptEdits' ||
    value === 'dontAsk' ||
    value === 'bypassPermissions'
    ? value
    : undefined;
}

function parseRuntimeProvider(value: unknown): RuntimeProvider | undefined {
  return value === 'claude' || value === 'codex' || value === 'opencode' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}
