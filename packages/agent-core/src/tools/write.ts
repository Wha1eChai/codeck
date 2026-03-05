import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { z } from 'zod'
import type { ToolDefinition, ToolResult } from './types.js'

const parameters = z.object({
  file_path: z.string().describe('Absolute or relative path to the file to write'),
  content: z.string().describe('The content to write to the file'),
})

type WriteParams = z.infer<typeof parameters>

export const writeTool: ToolDefinition<typeof parameters> = {
  name: 'Write',
  description:
    'Write content to a file. Creates parent directories if they do not exist. ' +
    'Uses atomic write (temp file + rename) to prevent partial writes.',
  parameters,

  async execute(params: WriteParams, ctx): Promise<ToolResult> {
    const filePath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.resolve(ctx.cwd, params.file_path)

    const dir = path.dirname(filePath)

    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (err: unknown) {
      return {
        output: `Error creating directory ${dir}: ${(err as Error).message}`,
        isError: true,
      }
    }

    // Atomic write: write to temp file in same directory, then rename
    const tempName = `.codeck-write-${crypto.randomBytes(8).toString('hex')}.tmp`
    const tempPath = path.join(dir, tempName)

    try {
      await fs.writeFile(tempPath, params.content, 'utf-8')
      await fs.rename(tempPath, filePath)
    } catch (err: unknown) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      return {
        output: `Error writing file ${filePath}: ${(err as Error).message}`,
        isError: true,
      }
    }

    const bytes = Buffer.byteLength(params.content, 'utf-8')
    return {
      output: `Successfully wrote ${bytes} bytes to ${filePath}`,
      metadata: { bytes, filePath },
    }
  },
}
