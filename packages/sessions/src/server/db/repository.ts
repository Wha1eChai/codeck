import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, desc, asc, like, and, gte, lte, sql } from 'drizzle-orm'
import { join } from 'path'
import { mkdirSync } from 'fs'
import * as schema from './schema.js'

export type DB = ReturnType<typeof createDb>

export function createDb(dbPath?: string): ReturnType<typeof drizzle<typeof schema>> {
  const path = dbPath ?? join(process.cwd(), 'data', 'sessions.db')
  mkdirSync(join(path, '..'), { recursive: true })

  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('cache_size = -32000') // 32MB cache

  const db = drizzle(sqlite, { schema })
  applyMigrations(sqlite)
  return db
}

function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      session_count INTEGER NOT NULL DEFAULT 0,
      total_file_size INTEGER NOT NULL DEFAULT 0,
      has_sessions_index INTEGER NOT NULL DEFAULT 0,
      last_synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_mtime_ms INTEGER NOT NULL DEFAULT 0,
      first_prompt TEXT,
      summary TEXT,
      git_branch TEXT,
      permission_mode TEXT,
      model_primary TEXT,
      cwd TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      user_msg_count INTEGER NOT NULL DEFAULT 0,
      assistant_msg_count INTEGER NOT NULL DEFAULT 0,
      tool_use_count INTEGER NOT NULL DEFAULT 0,
      subagent_count INTEGER NOT NULL DEFAULT 0,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      total_cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      session_started_at INTEGER,
      session_ended_at INTEGER,
      duration_seconds INTEGER,
      parse_status TEXT NOT NULL DEFAULT 'pending',
      parse_error TEXT,
      parsed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS sessions_project_idx ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS sessions_started_idx ON sessions(session_started_at);
    CREATE INDEX IF NOT EXISTS sessions_cost_idx ON sessions(estimated_cost_usd);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      parent_uuid TEXT,
      type TEXT NOT NULL,
      role TEXT NOT NULL,
      timestamp INTEGER,
      is_sidechain INTEGER NOT NULL DEFAULT 0,
      line_number INTEGER NOT NULL DEFAULT 0,
      content TEXT,
      tool_name TEXT,
      tool_use_id TEXT,
      is_error INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      model TEXT
    );

    CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id);
    CREATE INDEX IF NOT EXISTS messages_uuid_idx ON messages(uuid);
    CREATE INDEX IF NOT EXISTS messages_type_idx ON messages(type);

    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_use_id TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      tool_name TEXT NOT NULL,
      input_json TEXT,
      output_text TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      line_number INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS tool_calls_session_idx ON tool_calls(session_id);
    CREATE INDEX IF NOT EXISTS tool_calls_tool_name_idx ON tool_calls(tool_name);

    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      file_path TEXT NOT NULL,
      backup_file TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      backup_time INTEGER,
      snapshot_message_id TEXT
    );

    CREATE INDEX IF NOT EXISTS file_changes_session_idx ON file_changes(session_id);
    CREATE INDEX IF NOT EXISTS file_changes_path_idx ON file_changes(file_path);

    CREATE TABLE IF NOT EXISTS subagents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_use_id TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      tool_name TEXT NOT NULL,
      trigger_prompt TEXT,
      progress_event_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS subagents_session_idx ON subagents(session_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts
    USING fts5(
      session_id UNINDEXED,
      first_prompt,
      summary,
      content=sessions,
      content_rowid=rowid
    );
  `)

  // Additive migrations: ALTER TABLE for columns added after initial schema creation.
  // SQLite does not support IF NOT EXISTS on ALTER TABLE, so we try/catch each one.
  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    } catch {
      // Column already exists — safe to ignore
    }
  }

  addColumnIfMissing('sessions', 'conversation_root', 'TEXT')
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

export async function getProjects(db: DB): Promise<schema.Project[]> {
  return db.select().from(schema.projects).orderBy(desc(schema.projects.lastSyncedAt))
}

export interface SessionsFilter {
  projectId?: string
  search?: string
  sortBy?: 'date' | 'cost' | 'messages'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function getSessions(
  db: DB,
  filter: SessionsFilter = {},
): Promise<schema.Session[]> {
  const conditions = []

  if (filter.projectId) {
    conditions.push(eq(schema.sessions.projectId, filter.projectId))
  }

  if (filter.search) {
    conditions.push(
      like(schema.sessions.firstPrompt, `%${filter.search}%`),
    )
  }

  const orderCol =
    filter.sortBy === 'cost'
      ? schema.sessions.estimatedCostUsd
      : filter.sortBy === 'messages'
        ? schema.sessions.messageCount
        : schema.sessions.sessionStartedAt

  const order = filter.sortOrder === 'asc' ? asc(orderCol) : desc(orderCol)

  return db
    .select()
    .from(schema.sessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(order)
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0)
}

export async function getSessionById(db: DB, id: string): Promise<schema.Session | undefined> {
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id))
  return rows[0]
}

export async function getSessionMessages(
  db: DB,
  sessionId: string,
  options: { type?: string; limit?: number; offset?: number } = {},
): Promise<schema.Message[]> {
  const conditions = [eq(schema.messages.sessionId, sessionId)]
  if (options.type) conditions.push(eq(schema.messages.type, options.type))

  return db
    .select()
    .from(schema.messages)
    .where(and(...conditions))
    .orderBy(asc(schema.messages.timestamp))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0)
}

export async function getSessionToolCalls(db: DB, sessionId: string): Promise<schema.ToolCallRecord[]> {
  return db.select().from(schema.toolCalls).where(eq(schema.toolCalls.sessionId, sessionId))
}

export async function getSessionFileChanges(db: DB, sessionId: string): Promise<schema.FileChange[]> {
  return db.select().from(schema.fileChanges).where(eq(schema.fileChanges.sessionId, sessionId))
}

export async function getSessionSubagents(db: DB, sessionId: string): Promise<schema.Subagent[]> {
  return db.select().from(schema.subagents).where(eq(schema.subagents.sessionId, sessionId))
}

export async function getOverviewStats(db: DB) {
  const [projectCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.projects)
  const [sessionCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.sessions)
  const [tokenStats] = await db.select({
    totalInput: sql<number>`sum(total_input_tokens)`,
    totalOutput: sql<number>`sum(total_output_tokens)`,
    totalCost: sql<number>`sum(estimated_cost_usd)`,
  }).from(schema.sessions)

  return {
    projectCount: projectCount?.count ?? 0,
    sessionCount: sessionCount?.count ?? 0,
    totalInputTokens: tokenStats?.totalInput ?? 0,
    totalOutputTokens: tokenStats?.totalOutput ?? 0,
    totalCostUsd: tokenStats?.totalCost ?? 0,
  }
}

export async function getDailyStats(db: DB, fromMs: number, toMs: number) {
  return db
    .select({
      date: sql<string>`strftime('%Y-%m-%d', session_started_at / 1000, 'unixepoch')`,
      sessions: sql<number>`count(*)`,
      inputTokens: sql<number>`sum(total_input_tokens)`,
      outputTokens: sql<number>`sum(total_output_tokens)`,
      costUsd: sql<number>`sum(estimated_cost_usd)`,
    })
    .from(schema.sessions)
    .where(and(
      gte(schema.sessions.sessionStartedAt, fromMs),
      lte(schema.sessions.sessionStartedAt, toMs),
    ))
    .groupBy(sql`strftime('%Y-%m-%d', session_started_at / 1000, 'unixepoch')`)
    .orderBy(sql`1`)
}

// ─── History API (cc-desk HistoryEntry compatible) ────────────────────────────

// Re-export from shared api-types so consumers only import from one place
export type { HistoryEntry } from '../../shared/api-types.js'
import type { HistoryEntry } from '../../shared/api-types.js'

function sessionToHistoryEntry(
  session: schema.Session,
  projectPath: string,
): HistoryEntry {
  return {
    sessionId: session.id,
    title: session.summary ?? session.firstPrompt ?? '',
    projectPath,
    sessionFile: session.filePath,
    lastActiveAt: session.fileMtimeMs,
    messageCount: session.messageCount,
    conversationRoot: session.conversationRoot ?? undefined,
  }
}

export async function getHistoryEntries(db: DB): Promise<HistoryEntry[]> {
  const rows = await db
    .select({
      session: schema.sessions,
      projectPath: schema.projects.projectPath,
    })
    .from(schema.sessions)
    .innerJoin(schema.projects, eq(schema.sessions.projectId, schema.projects.id))
    .where(eq(schema.sessions.parseStatus, 'parsed'))
    .orderBy(desc(schema.sessions.fileMtimeMs))

  return rows.map((r) => sessionToHistoryEntry(r.session, r.projectPath))
}

export async function searchHistoryEntries(db: DB, query: string): Promise<HistoryEntry[]> {
  const pattern = `%${query}%`
  const rows = await db
    .select({
      session: schema.sessions,
      projectPath: schema.projects.projectPath,
    })
    .from(schema.sessions)
    .innerJoin(schema.projects, eq(schema.sessions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.sessions.parseStatus, 'parsed'),
        sql`(${schema.sessions.firstPrompt} LIKE ${pattern}
          OR ${schema.sessions.summary} LIKE ${pattern}
          OR ${schema.projects.projectPath} LIKE ${pattern})`,
      ),
    )
    .orderBy(desc(schema.sessions.fileMtimeMs))

  return rows.map((r) => sessionToHistoryEntry(r.session, r.projectPath))
}
