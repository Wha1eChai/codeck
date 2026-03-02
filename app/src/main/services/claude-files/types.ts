import type { PermissionMode, RuntimeProvider, Session } from '@common/types';

export interface ProjectInfo {
  hash: string;
  path: string | null;
  lastAccessed: number;
  sessionCount: number;
}

export interface SessionParseResult {
  session: Session;
  messageCount: number;
  lastActivity: number;
}

export interface SessionFileMetadata {
  name?: string;
  permissionMode?: PermissionMode;
  runtime?: RuntimeProvider;
  /** SDK session ID from system/init message (used for resume) */
  sdkSessionId?: string;
}

/**
 * Raw JSONL entry from session file.
 * Supports both our format and Claude CLI's native format.
 */
export interface RawJsonlEntry {
  type?: string;
  subtype?: string;
  id?: string;
  uuid?: string;
  timestamp?: number;
  ts?: number;
  time?: number | string;
  created_at?: number;
  createdAt?: number;

  // Content fields (various formats)
  content?: string;
  prompt?: string;
  thinking?: string;

  // Claude Code native message envelope
  sessionId?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  // SDK/native rows may use "message" as nested object.
  message?: string | Record<string, unknown>;
  tool_use_result?: Record<string, unknown>;

  // Tool fields
  tool_name?: string;
  tool?: string;
  tool_input?: Record<string, unknown>;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  output?: string;
  result?: string;
  success?: boolean;
  is_success?: boolean;
  error?: string;
  is_error?: boolean;
  exit_code?: number;

  // Usage fields
  input_tokens?: number;
  inputTokens?: number;
  output_tokens?: number;
  outputTokens?: number;
  cache_read_tokens?: number;
  cacheReadTokens?: number;

  // Metadata
  role?: string;
  name?: string;
  project_path?: string;
  permission_mode?: string;
  permissionMode?: string;
  runtime?: string;
  runtime_provider?: string;
  session_id?: string;
  sdk_session_id?: string;

  // Catch-all for unknown fields
  [key: string]: unknown;
}
