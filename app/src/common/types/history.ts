// ── 项目与历史 ──

/** Info about a discovered project directory. */
export interface ProjectInfo {
  readonly path: string
  readonly sessionCount: number
  readonly lastAccessed: number
}

/** A session entry discovered from ~/.claude/projects/ JSONL files. */
export interface HistoryEntry {
  /** Session ID (JSONL filename without extension). */
  readonly sessionId: string
  /** Human-readable title (inferred from first user message). */
  readonly title: string
  /** Decoded project path this session belongs to. */
  readonly projectPath: string
  /** Absolute path to the .jsonl file on disk. */
  readonly sessionFile: string
  /** Timestamp of last modification (mtimeMs). */
  readonly lastActiveAt: number
  /** Number of real user+assistant messages (excludes tool_result, system). */
  readonly messageCount: number
  /** UUID of first user message with parentUuid===null. Used to dedup resumed sessions. */
  readonly conversationRoot?: string
}

// ── 会话元数据（SDK system/init → 渲染进程） ──

/** Metadata from SDK system/init — pushed to renderer after session starts */
export interface SessionMetadata {
  readonly sessionId: string
  readonly model?: string
  readonly tools?: readonly string[]
  readonly cwd?: string
  readonly permissionMode?: string
  readonly claudeCodeVersion?: string
  readonly apiKeySource?: string
  readonly mcpServers?: readonly unknown[]
  readonly slashCommands?: readonly string[]
  readonly agents?: readonly string[]
  readonly skills?: readonly string[]
  readonly plugins?: readonly unknown[]
  readonly fastModeState?: string
}

// ── Checkpoint ──

/** Result of a rewindFiles() operation. */
export interface RewindFilesResult {
  readonly canRewind: boolean
  readonly error?: string
  readonly filesChanged?: readonly string[]
  readonly insertions?: number
  readonly deletions?: number
}

// ── 文件管理器 ──

export interface FileEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly size?: number
}

// ── 结构化输出（Structured Output） ──

export interface StructuredOutputConfig {
  readonly enabled: boolean
  readonly name: string
  readonly description?: string
  /** JSON Schema string (serialized for storage, parsed on use) */
  readonly schema: string
}
