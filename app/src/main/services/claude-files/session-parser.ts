import type { PermissionMode, RuntimeProvider } from '@common/types';
import type { RawJsonlEntry, SessionFileMetadata, SessionParseResult } from './types';
import { mapJsonlEntryToMessages } from './jsonl-to-messages';

// Re-export sub-module public API so external callers don't need to change imports.
export { mapJsonlEntry, mapJsonlEntryToMessages, createSessionJsonlMapper } from './jsonl-to-messages';
export type { SessionJsonlMapper } from './jsonl-to-messages';
export { mapMessageToJsonl } from './messages-to-jsonl';

const MAX_NAME_LENGTH = 50;
const DEFAULT_RUNTIME: RuntimeProvider = 'claude';

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

// ---------------------------------------------------------------------------
// Internal helpers (metadata extraction, not message mapping)
// ---------------------------------------------------------------------------

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

function toSessionName(raw: string): string {
  return raw.length > MAX_NAME_LENGTH ? `${raw.substring(0, MAX_NAME_LENGTH)}...` : raw;
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
  return value === 'claude' || value === 'codex' || value === 'opencode' || value === 'kernel' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}
