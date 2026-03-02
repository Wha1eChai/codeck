/**
 * Decode a project directory name back to the original project path.
 * Copied from app history-service.ts decodeProjectDirName logic.
 */
export function decodeProjectDirName(dirName: string): string {
  // URL-encoded (macOS/Linux): %2F → /
  if (dirName.includes('%')) {
    try {
      return decodeURIComponent(dirName)
    } catch {
      return dirName
    }
  }

  // Windows drive letter format: D--coding-programs → D:\coding\programs
  if (/^[A-Za-z]--/.test(dirName)) {
    const drive = `${dirName[0]}:`
    const rest = dirName.slice(3).replace(/-/g, '\\')
    return `${drive}\\${rest}`
  }

  return dirName
}

/**
 * Encode a project path to a directory name.
 */
export function encodeProjectPath(projectPath: string): string {
  // Windows path: D:\coding\programs → D--coding-programs
  if (/^[A-Za-z]:\\/.test(projectPath)) {
    const drive = projectPath[0]
    const rest = projectPath.slice(3).replace(/\\/g, '-')
    return `${drive}--${rest}`
  }
  // Unix path: URL-encode
  return encodeURIComponent(projectPath)
}
