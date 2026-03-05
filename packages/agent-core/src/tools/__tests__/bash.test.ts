import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import { bashTool } from '../bash.js'
import { createTempDir, createTestContext, writeTestFile } from './test-helpers.js'

describe('Bash tool', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    tmpDir = await createTempDir()
    ctx = createTestContext(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('executes echo command and captures stdout', async () => {
    const result = await bashTool.execute({ command: 'echo hello' }, ctx)

    expect(result.isError).toBeFalsy()
    expect(result.output.trim()).toBe('hello')
    expect(result.metadata?.['exitCode']).toBe(0)
  })

  it('captures non-zero exit code', async () => {
    const result = await bashTool.execute({ command: 'exit 42' }, ctx)

    expect(result.isError).toBe(true)
    expect(result.metadata?.['exitCode']).toBe(42)
  })

  it('uses cwd from context', async () => {
    // Create a marker file and check it exists from the shell
    await writeTestFile(tmpDir, '.marker', 'found')
    const result = await bashTool.execute({ command: 'cat .marker' }, ctx)

    expect(result.isError).toBeFalsy()
    expect(result.output.trim()).toBe('found')
  })

  it('completes within timeout for short commands', async () => {
    const start = Date.now()
    const result = await bashTool.execute({ command: 'echo fast', timeout: 5000 }, ctx)
    const elapsed = Date.now() - start

    expect(result.isError).toBeFalsy()
    expect(result.output.trim()).toBe('fast')
    expect(elapsed).toBeLessThan(5000)
  })

  it('respects abort signal', async () => {
    const controller = new AbortController()
    const abortCtx = { ...ctx, abortSignal: controller.signal }

    // Use a simple long-running command and abort quickly
    const command = process.platform === 'win32'
      ? 'ping -n 60 127.0.0.1'
      : 'sleep 60'

    const promise = bashTool.execute({ command }, abortCtx)

    // Give the process a moment to start, then abort
    await new Promise((r) => setTimeout(r, 500))
    controller.abort()

    const result = await promise
    // The process should have been terminated
    expect(result.metadata?.['killed']).toBe(true)
  }, 10_000)

  it('captures stderr in output', async () => {
    const result = await bashTool.execute({ command: 'echo error >&2' }, ctx)

    expect(result.output.trim()).toBe('error')
  })
})
