import { spawn, type ChildProcess } from 'child_process'
import { Readable } from 'stream'
import { createLogger } from '../logger'

const logger = createLogger('cli-process-manager')

export interface CliSpawnConfig {
  readonly cliPath: string
  readonly cwd: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

export interface ManagedProcess {
  readonly id: string
  readonly process: ChildProcess
  kill(): void
  write(data: string): void
}

/** Maximum buffer size for a single stdout line (1MB). Prevents OOM on malformed output. */
const MAX_LINE_BUFFER = 1_048_576

/**
 * Manages CLI subprocess lifecycle: spawn, health check, abort, cleanup.
 */
export class CliProcessManager {
  private readonly processes = new Map<string, ManagedProcess>()

  spawn(config: CliSpawnConfig): ManagedProcess {
    const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const proc = spawn(config.cliPath, [...config.args], {
      cwd: config.cwd,
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const managed: ManagedProcess = {
      id,
      process: proc,
      kill() {
        if (!proc.killed) {
          proc.kill('SIGTERM')
          // Force kill after 5s if SIGTERM doesn't work
          setTimeout(() => {
            if (!proc.killed) proc.kill('SIGKILL')
          }, 5000)
        }
      },
      write(data: string) {
        proc.stdin?.write(data)
      },
    }

    proc.on('exit', (code) => {
      logger.info(`process ${id} exited with code ${code}`)
      this.processes.delete(id)
    })

    proc.on('error', (err) => {
      logger.error(`process ${id} error:`, err.message)
      this.processes.delete(id)
    })

    this.processes.set(id, managed)
    return managed
  }

  kill(processId: string): void {
    const managed = this.processes.get(processId)
    if (managed) {
      managed.kill()
      this.processes.delete(processId)
    }
  }

  killAll(): void {
    for (const [id, managed] of this.processes) {
      managed.kill()
      this.processes.delete(id)
    }
  }

  /**
   * Check if a CLI tool is available at the given path by running `--version`.
   */
  async isHealthy(cliPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(cliPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 10_000,
      })

      proc.on('exit', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  /**
   * Discover a CLI tool by searching well-known locations.
   * Priority: env var → system PATH → common install locations.
   */
  async discoverCli(cliType: string): Promise<string | null> {
    const envVarMap: Record<string, string> = {
      'claude': 'CLAUDE_CLI_PATH',
      'codex': 'CODEX_CLI_PATH',
      'opencode': 'OPENCODE_CLI_PATH',
    }

    // 1. Environment variable
    const envVar = envVarMap[cliType]
    if (envVar) {
      const envPath = process.env[envVar]
      if (envPath && await this.isHealthy(envPath)) return envPath
    }

    // 2. System PATH (try bare command name)
    const commandName = cliType === 'claude' ? 'claude' : cliType
    if (await this.isHealthy(commandName)) return commandName

    return null
  }
}

/**
 * Line-buffered async generator for reading stdout.
 * Yields complete lines (newline-delimited), throws on buffer overflow.
 */
export async function* createLineReader(
  stream: Readable,
  maxBufferSize = MAX_LINE_BUFFER,
): AsyncGenerator<string> {
  let buffer = ''

  for await (const chunk of stream) {
    buffer += typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf-8')

    if (buffer.length > maxBufferSize) {
      throw new Error(`Line buffer exceeded ${maxBufferSize} bytes — possible malformed output`)
    }

    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx)
      buffer = buffer.slice(newlineIdx + 1)
      if (line.length > 0) yield line
    }
  }

  // Yield any remaining content without trailing newline
  if (buffer.length > 0) yield buffer
}
