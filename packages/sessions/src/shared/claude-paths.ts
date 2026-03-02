import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'

export const CLAUDE_HOME = join(homedir(), '.claude')
export const CLAUDE_PROJECTS_DIR = join(CLAUDE_HOME, 'projects')
export const CLAUDE_FILE_HISTORY_DIR = join(CLAUDE_HOME, 'file-history')

export function getProjectsDir(): string {
  return CLAUDE_PROJECTS_DIR
}

export function getFileHistoryDir(): string {
  return CLAUDE_FILE_HISTORY_DIR
}

export function getProjectDir(projectDirName: string): string {
  return join(CLAUDE_PROJECTS_DIR, projectDirName)
}

export function getSessionFile(projectDirName: string, sessionId: string): string {
  return join(CLAUDE_PROJECTS_DIR, projectDirName, `${sessionId}.jsonl`)
}

export function getSessionsIndexFile(projectDirName: string): string {
  return join(CLAUDE_PROJECTS_DIR, projectDirName, 'sessions-index.json')
}

export function getFileHistorySessionDir(sessionId: string): string {
  return join(CLAUDE_FILE_HISTORY_DIR, sessionId)
}

export function claudeHomeExists(): boolean {
  return existsSync(CLAUDE_HOME)
}
