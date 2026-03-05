import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import type { ToolDefinition, ToolResult } from './types.js'

const parameters = z.object({
  file_path: z.string().describe('Absolute or relative path to the file to read'),
  offset: z.number().int().min(0).optional().describe('0-indexed start line number'),
  limit: z.number().int().min(1).optional().describe('Number of lines to read'),
})

type ReadParams = z.infer<typeof parameters>

export const readTool: ToolDefinition<typeof parameters> = {
  name: 'Read',
  description:
    'Read the contents of a file. Returns lines with line numbers in cat -n format. ' +
    'Supports offset and limit for reading specific line ranges.',
  parameters,

  async execute(params: ReadParams, ctx): Promise<ToolResult> {
    const filePath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.resolve(ctx.cwd, params.file_path)

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return {
          output: `Error: File not found: ${filePath}`,
          isError: true,
        }
      }
      if (code === 'EISDIR') {
        return {
          output: `Error: Path is a directory, not a file: ${filePath}`,
          isError: true,
        }
      }
      return {
        output: `Error reading file: ${(err as Error).message}`,
        isError: true,
      }
    }

    const allLines = content.split('\n')
    const offset = params.offset ?? 0
    const limit = params.limit ?? allLines.length
    const lines = allLines.slice(offset, offset + limit)

    const formatted = lines
      .map((line, i) => {
        const lineNum = String(offset + i + 1).padStart(6, ' ')
        return `${lineNum}\t${line}`
      })
      .join('\n')

    return {
      output: formatted,
      metadata: {
        totalLines: allLines.length,
        linesReturned: lines.length,
        offset,
      },
    }
  },
}
