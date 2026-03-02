import path from 'node:path'

/**
 * Encode a project path into a directory name for ~/.claude/projects/.
 * Ported from app/src/main/services/claude-files.ts
 *
 * Windows: D:\coding\project → D--coding-project
 * Unix: /home/user/project → URL-encoded with / → %2F
 */
export function encodeProjectPath(projectPath: string): string {
  const normalized = path.resolve(projectPath)

  // Windows drive path: C:\foo\bar → C--foo-bar
  if (/^[A-Za-z]:[\\/]/.test(normalized)) {
    const drive = normalized[0]!
    const rest = normalized.slice(3).replace(/[\\/]+/g, '-')
    return `${drive}--${rest}`
  }

  // Unix: URL-encode with / replaced
  return encodeURIComponent(normalized.replace(/\\/g, '/'))
}

/**
 * Decode a project directory name back to the original project path.
 * Returns null if the format is unrecognized.
 */
export function decodeProjectDirName(dirName: string): string | null {
  // URL-encoded format
  if (dirName.includes('%')) {
    try {
      return decodeURIComponent(dirName)
    } catch {
      return null
    }
  }

  // Windows drive format: C--foo-bar → C:\foo\bar
  if (/^[A-Za-z]--/.test(dirName)) {
    const drive = `${dirName[0]!}:`
    const rest = dirName.slice(3).replace(/-/g, '\\')
    return `${drive}\\${rest}`
  }

  return null
}
