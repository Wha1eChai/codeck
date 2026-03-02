import { eq } from 'drizzle-orm'
import type { DB } from '../db/repository.js'
import * as schema from '../db/schema.js'
import { scanProjects, type ScannedSession } from './scanner.js'
import { readJsonlFile } from '../../core/jsonl-reader.js'
import { classifyEntry } from '../../core/classifier.js'
import { aggregateTokens } from '../../core/token-aggregator.js'
import { pairToolCalls } from '../../core/tool-tracker.js'
import { extractFileChanges } from '../../core/file-tracker.js'
import { findSubagentInvocations, countSubagents } from '../../core/subagent-linker.js'
import { SQLITE_BATCH_SIZE, MAX_MESSAGE_CONTENT, MAX_FIRST_PROMPT } from '../../core/constants.js'
import type { ParsedMessage } from '../../core/types.js'

export interface SyncResult {
  newProjects: number
  updatedSessions: number
  newSessions: number
  skippedSessions: number
  errors: string[]
  durationMs: number
}

/**
 * Incremental sync: only parse sessions whose mtime has changed.
 * Pass force=true to re-parse all sessions regardless of mtime.
 */
export async function incrementalSync(db: DB, force = false): Promise<SyncResult> {
  const startMs = Date.now()
  const result: SyncResult = {
    newProjects: 0,
    updatedSessions: 0,
    newSessions: 0,
    skippedSessions: 0,
    errors: [],
    durationMs: 0,
  }

  const projects = scanProjects()

  for (const project of projects) {
    // Upsert project
    const existing = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, project.dirName))

    if (existing.length === 0) {
      await db.insert(schema.projects).values({
        id: project.dirName,
        projectPath: project.projectPath,
        sessionCount: project.sessions.length,
        totalFileSize: project.sessions.reduce((s, ss) => s + ss.fileSize, 0),
        hasSessionsIndex: project.hasSessionsIndex,
        lastSyncedAt: Date.now(),
      })
      result.newProjects++
    } else {
      await db
        .update(schema.projects)
        .set({
          sessionCount: project.sessions.length,
          totalFileSize: project.sessions.reduce((s, ss) => s + ss.fileSize, 0),
          hasSessionsIndex: project.hasSessionsIndex,
          lastSyncedAt: Date.now(),
        })
        .where(eq(schema.projects.id, project.dirName))
    }

    // Process each session
    for (const session of project.sessions) {
      const existingSession = await db
        .select({ id: schema.sessions.id, fileMtimeMs: schema.sessions.fileMtimeMs })
        .from(schema.sessions)
        .where(eq(schema.sessions.id, session.sessionId))

      if (
        !force &&
        existingSession.length > 0 &&
        existingSession[0]!.fileMtimeMs === session.fileMtimeMs
      ) {
        result.skippedSessions++
        continue
      }

      const isNew = existingSession.length === 0

      try {
        await parseAndStoreSession(db, session, project.dirName)
        if (isNew) result.newSessions++
        else result.updatedSessions++
      } catch (err) {
        result.errors.push(`${session.sessionId}: ${String(err)}`)
        // Store error state
        if (isNew) {
          await db.insert(schema.sessions).values({
            id: session.sessionId,
            projectId: project.dirName,
            filePath: session.filePath,
            fileSize: session.fileSize,
            fileMtimeMs: session.fileMtimeMs,
            parseStatus: 'error',
            parseError: String(err),
          }).onConflictDoUpdate({
            target: schema.sessions.id,
            set: {
              parseStatus: 'error',
              parseError: String(err),
              fileMtimeMs: session.fileMtimeMs,
            },
          })
        }
      }
    }
  }

  result.durationMs = Date.now() - startMs
  return result
}

async function parseAndStoreSession(
  db: DB,
  session: ScannedSession,
  projectDirName: string,
): Promise<void> {
  const messages: ParsedMessage[] = []

  for await (const { entry, lineNo } of readJsonlFile(session.filePath)) {
    const classified = classifyEntry(entry, lineNo)
    messages.push(...classified)
  }

  // Extract statistics
  const userMessages = messages.filter((m) => m.role === 'user' && m.type === 'text')
  const assistantMessages = messages.filter((m) => m.role === 'assistant')
  const toolUseMessages = messages.filter((m) => m.type === 'tool_use')

  const tokenAgg = aggregateTokens(messages)
  const subagentCount = countSubagents(messages)
  const subagentInfos = findSubagentInvocations(messages)
  const { paired: toolCallPairs } = pairToolCalls(messages)
  const fileChanges = extractFileChanges(messages)

  // Determine primary model (most common in assistant messages)
  const modelCounts: Record<string, number> = {}
  for (const m of assistantMessages) {
    if (m.model) modelCounts[m.model] = (modelCounts[m.model] ?? 0) + 1
  }
  const modelPrimary = Object.entries(modelCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0]

  // Timing from first/last message timestamps
  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is number => typeof t === 'number' && t > 0)
  const sessionStartedAt = timestamps.length > 0 ? Math.min(...timestamps) : undefined
  const sessionEndedAt = timestamps.length > 0 ? Math.max(...timestamps) : undefined

  // Context from first user message (real user input)
  const firstUserMsg = userMessages[0]
  const firstPrompt = firstUserMsg?.text?.slice(0, MAX_FIRST_PROMPT)

  // gitBranch/cwd/permissionMode are entry-level fields attached to the opening message
  // (which may be system-injected). Scan all text messages and take the first with each field.
  const allTextMessages = messages.filter((m) => m.type === 'text')
  const gitBranch = allTextMessages.find((m) => m.gitBranch)?.gitBranch
  const permissionMode = allTextMessages.find((m) => m.permissionMode)?.permissionMode
  const cwd = allTextMessages.find((m) => m.cwd)?.cwd

  // Summary from summary-type message
  const summaryMsg = messages.find((m) => m.type === 'summary')
  const summary = summaryMsg?.text

  // conversationRoot: UUID of the first real user message with no parent (chain root).
  // Used by cc-desk to deduplicate sessions that continue the same conversation.
  const conversationRoot = userMessages.find((m) => m.parentUuid === null)?.uuid

  // Upsert session
  const sessionValues = {
    firstPrompt,
    summary: summary ?? session.indexData?.summary,
    gitBranch: gitBranch ?? session.indexData?.gitBranch,
    permissionMode,
    modelPrimary,
    cwd,
    conversationRoot,
    messageCount: userMessages.length + assistantMessages.length,
    userMsgCount: userMessages.length,
    assistantMsgCount: assistantMessages.length,
    toolUseCount: toolUseMessages.length,
    subagentCount,
    totalInputTokens: tokenAgg.totalInputTokens,
    totalOutputTokens: tokenAgg.totalOutputTokens,
    totalCacheCreationTokens: tokenAgg.totalCacheCreationTokens,
    totalCacheReadTokens: tokenAgg.totalCacheReadTokens,
    estimatedCostUsd: tokenAgg.estimatedCostUsd,
    sessionStartedAt,
    sessionEndedAt,
    durationSeconds:
      sessionStartedAt && sessionEndedAt
        ? Math.round((sessionEndedAt - sessionStartedAt) / 1000)
        : undefined,
    parseStatus: 'parsed' as const,
    parsedAt: Date.now(),
  }

  await db.insert(schema.sessions).values({
    id: session.sessionId,
    projectId: projectDirName,
    filePath: session.filePath,
    fileSize: session.fileSize,
    fileMtimeMs: session.fileMtimeMs,
    ...sessionValues,
  }).onConflictDoUpdate({
    target: schema.sessions.id,
    set: {
      fileSize: session.fileSize,
      fileMtimeMs: session.fileMtimeMs,
      ...sessionValues,
    },
  })

  // Clear old messages/tool_calls/file_changes/subagents for this session
  await db.delete(schema.messages).where(eq(schema.messages.sessionId, session.sessionId))
  await db.delete(schema.toolCalls).where(eq(schema.toolCalls.sessionId, session.sessionId))
  await db.delete(schema.fileChanges).where(eq(schema.fileChanges.sessionId, session.sessionId))
  await db.delete(schema.subagents).where(eq(schema.subagents.sessionId, session.sessionId))

  // Insert messages in batches (exclude progress noise)
  const storableMessages = messages.filter(
    (m) => m.type !== 'progress' && m.uuid,
  )

  for (let i = 0; i < storableMessages.length; i += SQLITE_BATCH_SIZE) {
    const batch = storableMessages.slice(i, i + SQLITE_BATCH_SIZE)
    await db.insert(schema.messages).values(
      batch.map((m) => ({
        uuid: m.uuid,
        sessionId: session.sessionId,
        parentUuid: m.parentUuid ?? undefined,
        type: m.type,
        role: m.role,
        timestamp: m.timestamp,
        isSidechain: m.isSidechain,
        lineNumber: m.lineNumber,
        content: (m.text ?? m.toolResultContent ?? '')?.slice(0, MAX_MESSAGE_CONTENT),
        toolName: m.toolName,
        toolUseId: m.toolUseId,
        isError: m.isError,
        inputTokens: m.usage?.inputTokens,
        outputTokens: m.usage?.outputTokens,
        model: m.model,
      })),
    )
  }

  // Insert tool calls in batches
  if (toolCallPairs.length > 0) {
    for (let i = 0; i < toolCallPairs.length; i += SQLITE_BATCH_SIZE) {
      const batch = toolCallPairs.slice(i, i + SQLITE_BATCH_SIZE)
      await db.insert(schema.toolCalls).values(
        batch.map((tc) => ({
          toolUseId: tc.toolUseId,
          sessionId: session.sessionId,
          toolName: tc.toolName,
          inputJson: tc.inputJson,
          outputText: tc.outputText,
          success: tc.success,
          lineNumber: tc.lineNumber,
        })),
      )
    }
  }

  // Insert file changes (skip entries with missing backupFileName)
  const validFileChanges = fileChanges.filter((fc) => fc.backupFileName && fc.filePath)
  if (validFileChanges.length > 0) {
    for (let i = 0; i < validFileChanges.length; i += SQLITE_BATCH_SIZE) {
      const batch = validFileChanges.slice(i, i + SQLITE_BATCH_SIZE)
      await db.insert(schema.fileChanges).values(
        batch.map((fc) => ({
          sessionId: session.sessionId,
          filePath: fc.filePath,
          backupFileName: fc.backupFileName,
          version: fc.version,
          backupTime: fc.backupTime,
          snapshotMessageId: fc.snapshotMessageId,
        })),
      )
    }
  }

  // Insert subagents
  if (subagentInfos.length > 0) {
    await db.insert(schema.subagents).values(
      subagentInfos.map((s) => ({
        toolUseId: s.toolUseId,
        sessionId: session.sessionId,
        toolName: s.toolName,
        triggerPrompt: s.triggerPrompt,
        progressEventCount: s.progressEventCount,
      })),
    )
  }
}
