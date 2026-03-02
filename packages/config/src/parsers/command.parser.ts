import path from 'node:path'
import { safeReadFile, safeListDirEntries } from '../utils/file-io.js'
import { parseFrontmatter } from '../utils/frontmatter.js'
import type {
  CommandFile,
  CommandFrontmatter,
  CommandScope,
  CommandTokens,
} from '../schemas/command.schema.js'

/**
 * Compute slashName from file path relative to base dir.
 * commands/ccs/continue.md → "ccs:continue"
 */
function computeSlashName(filePath: string, baseDir: string): string {
  const rel = path.relative(baseDir, filePath)
  return rel
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/\//g, ':')
}

/**
 * Extract special tokens from command body.
 */
function extractTokens(body: string): CommandTokens {
  const hasArguments = body.includes('$ARGUMENTS')
  const hasPluginRoot = body.includes('${CLAUDE_PLUGIN_ROOT}')

  const shellRegex = /!`([^`]+)`/g
  const shellTokens: string[] = []
  let match: RegExpExecArray | null
  while ((match = shellRegex.exec(body)) !== null) {
    if (match[1]) shellTokens.push(match[1])
  }

  return { hasArguments, shellTokens, hasPluginRoot }
}

export async function parseCommandFile(
  filePath: string,
  baseDir: string,
  scope: CommandScope,
  pluginId?: string,
): Promise<CommandFile | null> {
  const content = await safeReadFile(filePath)
  if (content === null) return null

  const { metadata, body } = parseFrontmatter(content)
  const slashName = computeSlashName(filePath, baseDir)
  const tokens = extractTokens(body)

  return {
    slashName,
    filePath,
    scope,
    pluginId,
    frontmatter: metadata as unknown as CommandFrontmatter,
    body,
    tokens,
  }
}

export async function scanCommandsDir(
  dirPath: string,
  scope: CommandScope,
  pluginId?: string,
): Promise<readonly CommandFile[]> {
  const results: CommandFile[] = []
  await scanDirRecursive(dirPath, dirPath, scope, pluginId, results)
  return results
}

async function scanDirRecursive(
  currentDir: string,
  baseDir: string,
  scope: CommandScope,
  pluginId: string | undefined,
  results: CommandFile[],
): Promise<void> {
  const entries = await safeListDirEntries(currentDir)

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      await scanDirRecursive(fullPath, baseDir, scope, pluginId, results)
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      const cmd = await parseCommandFile(fullPath, baseDir, scope, pluginId)
      if (cmd) results.push(cmd)
    }
  }
}
