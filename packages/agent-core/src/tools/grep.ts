import * as childProcess from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import fg from 'fast-glob'
import { z } from 'zod'
import type { ToolDefinition, ToolResult } from './types.js'

const parameters = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  path: z.string().optional().describe('File or directory to search in (defaults to cwd)'),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts")'),
  include_line_numbers: z.boolean().optional().describe('Include line numbers in output'),
})

type GrepParams = z.infer<typeof parameters>

function tryRipgrep(
  params: GrepParams,
  searchPath: string,
): Promise<ToolResult | undefined> {
  return new Promise((resolve) => {
    const args = ['--no-heading', '--color', 'never']

    if (params.include_line_numbers) {
      args.push('-n')
    }

    if (params.glob) {
      args.push('--glob', params.glob)
    }

    args.push(params.pattern, searchPath)

    const proc = childProcess.spawn('rg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('error', () => {
      // rg not found, fall back to Node.js implementation
      resolve(undefined)
    })

    proc.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8')

      if (code === 0) {
        resolve({ output: stdout.trimEnd(), metadata: { engine: 'ripgrep' } })
      } else if (code === 1) {
        // rg exit code 1 = no matches
        resolve({ output: 'No matches found.', metadata: { engine: 'ripgrep', matchCount: 0 } })
      } else {
        // rg failed for some other reason, fall back
        resolve(undefined)
      }
    })
  })
}

async function nodeFallbackGrep(
  params: GrepParams,
  searchPath: string,
): Promise<ToolResult> {
  let regex: RegExp
  try {
    regex = new RegExp(params.pattern)
  } catch (err: unknown) {
    return {
      output: `Error: Invalid regex pattern: ${(err as Error).message}`,
      isError: true,
    }
  }

  // Determine if searchPath is a file or directory
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(searchPath)
  } catch (err: unknown) {
    return {
      output: `Error: Path not found: ${searchPath}`,
      isError: true,
    }
  }

  let filePaths: string[]
  if (stat.isFile()) {
    filePaths = [searchPath]
  } else {
    const globPattern = params.glob ?? '**/*'
    try {
      const entries = await fg(globPattern, {
        cwd: searchPath,
        onlyFiles: true,
        dot: false,
        followSymbolicLinks: false,
        suppressErrors: true,
      })
      filePaths = entries.map((e) => path.resolve(searchPath, e))
    } catch (err: unknown) {
      return {
        output: `Error listing files: ${(err as Error).message}`,
        isError: true,
      }
    }
  }

  const results: string[] = []
  let matchCount = 0

  for (const filePath of filePaths) {
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      // Skip unreadable files (binary, permission errors, etc.)
      continue
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line !== undefined && regex.test(line)) {
        matchCount++
        const relativePath = path.relative(searchPath, filePath)
        const displayPath = stat.isFile() ? path.basename(filePath) : relativePath
        if (params.include_line_numbers) {
          results.push(`${displayPath}:${i + 1}:${line}`)
        } else {
          results.push(`${displayPath}:${line}`)
        }
      }
    }
  }

  if (results.length === 0) {
    return { output: 'No matches found.', metadata: { engine: 'node', matchCount: 0 } }
  }

  return {
    output: results.join('\n'),
    metadata: { engine: 'node', matchCount },
  }
}

export const grepTool: ToolDefinition<typeof parameters> = {
  name: 'Grep',
  description:
    'Search for a regex pattern in files. Tries ripgrep (rg) first for speed, ' +
    'falls back to a Node.js implementation if rg is not available.',
  parameters,

  async execute(params: GrepParams, ctx): Promise<ToolResult> {
    const searchPath = params.path
      ? path.isAbsolute(params.path)
        ? params.path
        : path.resolve(ctx.cwd, params.path)
      : ctx.cwd

    // Try ripgrep first
    const rgResult = await tryRipgrep(params, searchPath)
    if (rgResult !== undefined) {
      return rgResult
    }

    // Fall back to Node.js implementation
    return nodeFallbackGrep(params, searchPath)
  },
}
