import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ToolContext } from '../types.js'

/**
 * Create an isolated temp directory for a test.
 * Caller is responsible for cleanup via `fs.rm(dir, { recursive: true })`.
 */
export async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'codeck-tool-test-'))
}

/** Create a minimal ToolContext pointing at the given cwd */
export function createTestContext(cwd: string): ToolContext {
  return {
    sessionId: 'test-session',
    cwd,
    abortSignal: new AbortController().signal,
  }
}

/** Write a file inside a temp dir with the given relative path and content */
export async function writeTestFile(
  dir: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const filePath = path.join(dir, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}
