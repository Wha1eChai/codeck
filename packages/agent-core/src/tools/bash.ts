import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import { z } from 'zod'
import type { ToolDefinition, ToolResult } from './types.js'

const parameters = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout: z.number().int().min(1).optional().describe('Timeout in milliseconds (default: 120000)'),
})

type BashParams = z.infer<typeof parameters>

const DEFAULT_TIMEOUT_MS = 120_000

const COMMON_GIT_BASH_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
]

function findGitBash(): string | undefined {
  const envPath = process.env['CLAUDE_CODE_GIT_BASH_PATH']
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }
  for (const candidate of COMMON_GIT_BASH_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

function buildShellArgs(): { shell: string | true } {
  if (process.platform === 'win32') {
    const gitBash = findGitBash()
    if (gitBash) {
      return { shell: gitBash }
    }
  }
  return { shell: true }
}

/** Kill a process and its entire tree. On Windows, uses taskkill /T. */
function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      childProcess.execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(-pid, 'SIGTERM')
    }
  } catch {
    // Process may have already exited
  }
}

export const bashTool: ToolDefinition<typeof parameters> = {
  name: 'Bash',
  description:
    'Execute a shell command. On Windows, attempts to use Git Bash if available. ' +
    'Returns combined stdout and stderr output.',
  parameters,

  async execute(params: BashParams, ctx): Promise<ToolResult> {
    const timeout = params.timeout ?? DEFAULT_TIMEOUT_MS
    const shellArgs = buildShellArgs()

    return new Promise<ToolResult>((resolve) => {
      const chunks: Buffer[] = []
      let killed = false
      let resolved = false

      const doResolve = (result: ToolResult): void => {
        if (resolved) return
        resolved = true
        resolve(result)
      }

      const proc = childProcess.spawn(params.command, [], {
        ...shellArgs,
        cwd: ctx.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
        // On non-Windows, use detached for process group killing
        ...(process.platform !== 'win32' ? { detached: true } : {}),
      })

      const killProc = (): void => {
        killed = true
        if (proc.pid !== undefined) {
          killProcessTree(proc.pid)
        } else {
          proc.kill('SIGTERM')
        }
      }

      const timer = setTimeout(() => {
        killProc()
        // Force-resolve after a grace period if close event hasn't fired
        setTimeout(() => {
          const output = Buffer.concat(chunks).toString('utf-8')
          doResolve({
            output: output || 'Process was killed (timeout)',
            isError: true,
            metadata: { exitCode: -1, killed: true },
          })
        }, 3000)
      }, timeout)

      const onAbort = (): void => {
        killProc()
        // Force-resolve after a grace period if close event hasn't fired
        setTimeout(() => {
          const output = Buffer.concat(chunks).toString('utf-8')
          doResolve({
            output: output || 'Process was killed (abort)',
            isError: true,
            metadata: { exitCode: -1, killed: true },
          })
        }, 3000)
      }
      ctx.abortSignal.addEventListener('abort', onAbort, { once: true })

      if (proc.stdout) {
        proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      }
      if (proc.stderr) {
        proc.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
      }

      proc.on('error', (err) => {
        clearTimeout(timer)
        ctx.abortSignal.removeEventListener('abort', onAbort)
        doResolve({
          output: `Error spawning process: ${err.message}`,
          isError: true,
          metadata: { exitCode: -1 },
        })
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        ctx.abortSignal.removeEventListener('abort', onAbort)

        const output = Buffer.concat(chunks).toString('utf-8')

        if (killed) {
          doResolve({
            output: output || 'Process was killed (timeout or abort)',
            isError: true,
            metadata: { exitCode: code ?? -1, killed: true },
          })
          return
        }

        doResolve({
          output,
          isError: code !== 0,
          metadata: { exitCode: code ?? 0 },
        })
      })
    })
  },
}
