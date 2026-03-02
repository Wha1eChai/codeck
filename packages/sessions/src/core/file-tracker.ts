import type { ParsedMessage, ParsedFileBackup } from './types.js'

export interface FileChange {
  filePath: string
  backupFileName: string
  version: number
  backupTime: number
  sessionId: string
  snapshotMessageId: string
}

/**
 * Extract all file change records from file-history-snapshot messages.
 */
export function extractFileChanges(messages: ParsedMessage[]): FileChange[] {
  const changes: FileChange[] = []

  for (const msg of messages) {
    if (msg.type !== 'file_snapshot' || !msg.fileSnapshot) continue

    const { messageId, files, timestamp: _ts } = msg.fileSnapshot

    for (const backup of files) {
      changes.push({
        filePath: backup.filePath,
        backupFileName: backup.backupFileName,
        version: backup.version,
        backupTime: backup.backupTime,
        sessionId: msg.sessionId,
        snapshotMessageId: messageId,
      })
    }
  }

  return changes
}

/**
 * Build a frequency map of files changed across sessions.
 */
export function buildFileHeatmap(changes: FileChange[]): Map<string, number> {
  const heatmap = new Map<string, number>()

  for (const change of changes) {
    const count = heatmap.get(change.filePath) ?? 0
    heatmap.set(change.filePath, count + 1)
  }

  return heatmap
}

/**
 * Get the latest version of each file (deduplicated by filePath + max version).
 */
export function getLatestVersions(backups: ParsedFileBackup[]): ParsedFileBackup[] {
  const latest = new Map<string, ParsedFileBackup>()

  for (const backup of backups) {
    const existing = latest.get(backup.filePath)
    if (!existing || backup.version > existing.version) {
      latest.set(backup.filePath, backup)
    }
  }

  return Array.from(latest.values())
}
