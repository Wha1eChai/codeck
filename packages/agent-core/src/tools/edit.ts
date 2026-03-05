import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import type { ToolDefinition, ToolResult } from './types.js'

const parameters = z.object({
  file_path: z.string().describe('Absolute or relative path to the file to edit'),
  old_string: z.string().describe('The exact string to find and replace'),
  new_string: z.string().describe('The replacement string'),
  replace_all: z.boolean().optional().describe('Replace all occurrences instead of requiring uniqueness'),
})

type EditParams = z.infer<typeof parameters>

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while (true) {
    const idx = haystack.indexOf(needle, pos)
    if (idx === -1) break
    count++
    pos = idx + 1
  }
  return count
}

export const editTool: ToolDefinition<typeof parameters> = {
  name: 'Edit',
  description:
    'Perform exact string replacement in a file. By default, the old_string must appear ' +
    'exactly once (unique match). Use replace_all to replace all occurrences.',
  parameters,

  async execute(params: EditParams, ctx): Promise<ToolResult> {
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
      return {
        output: `Error reading file: ${(err as Error).message}`,
        isError: true,
      }
    }

    const occurrences = countOccurrences(content, params.old_string)

    if (occurrences === 0) {
      return {
        output: `Error: old_string not found in ${filePath}`,
        isError: true,
      }
    }

    const replaceAll = params.replace_all ?? false
    if (!replaceAll && occurrences > 1) {
      return {
        output: `Error: old_string is not unique in ${filePath} (found ${occurrences} occurrences). Use replace_all to replace all, or provide a more specific string.`,
        isError: true,
      }
    }

    let newContent: string
    let replacementCount: number
    if (replaceAll) {
      newContent = content.split(params.old_string).join(params.new_string)
      replacementCount = occurrences
    } else {
      // Replace only the first (and only) occurrence
      const idx = content.indexOf(params.old_string)
      newContent =
        content.slice(0, idx) +
        params.new_string +
        content.slice(idx + params.old_string.length)
      replacementCount = 1
    }

    try {
      await fs.writeFile(filePath, newContent, 'utf-8')
    } catch (err: unknown) {
      return {
        output: `Error writing file: ${(err as Error).message}`,
        isError: true,
      }
    }

    return {
      output: `Successfully replaced ${replacementCount} occurrence${replacementCount > 1 ? 's' : ''} in ${filePath}`,
      metadata: { replacementCount, filePath },
    }
  },
}
