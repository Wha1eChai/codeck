import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import fg from 'fast-glob'
import { z } from 'zod'
import type { ToolDefinition, ToolResult } from './types.js'

const parameters = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts")'),
  path: z.string().optional().describe('Directory to search in (defaults to cwd)'),
})

type GlobParams = z.infer<typeof parameters>

interface FileWithMtime {
  readonly filePath: string
  readonly mtimeMs: number
}

export const globTool: ToolDefinition<typeof parameters> = {
  name: 'Glob',
  description:
    'Find files matching a glob pattern. Results are sorted by modification time (newest first).',
  parameters,

  async execute(params: GlobParams, ctx): Promise<ToolResult> {
    const searchDir = params.path
      ? path.isAbsolute(params.path)
        ? params.path
        : path.resolve(ctx.cwd, params.path)
      : ctx.cwd

    let entries: string[]
    try {
      entries = await fg(params.pattern, {
        cwd: searchDir,
        dot: false,
        onlyFiles: true,
        followSymbolicLinks: false,
        suppressErrors: true,
      })
    } catch (err: unknown) {
      return {
        output: `Error executing glob: ${(err as Error).message}`,
        isError: true,
      }
    }

    if (entries.length === 0) {
      return {
        output: 'No files matched the pattern.',
        metadata: { count: 0 },
      }
    }

    // Resolve to absolute paths and get mtime for sorting
    const filesWithMtime: FileWithMtime[] = []
    for (const entry of entries) {
      const absPath = path.resolve(searchDir, entry)
      try {
        const stat = await fs.stat(absPath)
        filesWithMtime.push({ filePath: absPath, mtimeMs: stat.mtimeMs })
      } catch {
        // File may have been deleted between glob and stat; skip
        filesWithMtime.push({ filePath: absPath, mtimeMs: 0 })
      }
    }

    // Sort newest first
    filesWithMtime.sort((a, b) => b.mtimeMs - a.mtimeMs)

    const output = filesWithMtime.map((f) => f.filePath).join('\n')

    return {
      output,
      metadata: { count: filesWithMtime.length },
    }
  },
}
