import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'
import { SESSIONS_SERVER_PORT, SESSIONS_SERVER_URL } from '@codeck/sessions'
import type { SyncResult } from '@common/sync-types'

let serverProcess: ChildProcess | null = null
let syncInFlight = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let syncInterval: ReturnType<typeof setInterval> | null = null

/**
 * Resolve the absolute path to the sessions server entry point.
 * Uses a compile-time path relative to the monorepo root, avoiding runtime
 * require.resolve() which fails because @codeck/sessions exports only ESM .ts files.
 */
function resolveServerScript(): string {
  // In the monorepo, sessions is at packages/sessions/
  // __dirname in the bundled output is app/out/main/, so we go up to monorepo root.
  const monorepoRoot = resolve(__dirname, '../../..')
  return resolve(monorepoRoot, 'packages/sessions/src/server/app.ts')
}

export async function startSessionsServer(): Promise<void> {
  if (serverProcess) return

  const serverScript = resolveServerScript()

  serverProcess = spawn('npx', ['tsx', serverScript], {
    env: { ...process.env, PORT: String(SESSIONS_SERVER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    // shell: true is required on Windows — npx is npx.cmd, not a bare executable
    shell: true,
    windowsHide: true,
  })

  serverProcess.on('error', (err) => {
    console.error('[sessions-server] spawn error:', err.message)
    serverProcess = null
  })

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[sessions-server]', data.toString().trim())
  })

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[sessions-server]', data.toString().trim())
  })

  serverProcess.on('exit', (code) => {
    console.log(`[sessions-server] exited with code ${code}`)
    serverProcess = null
  })

  // Wait until the server is ready (health check with retries)
  await waitForServer()

  // Trigger initial sync (non-blocking) to populate SQLite from ~/.claude/projects/
  triggerSync().catch((err) => {
    console.error('[sessions-server] initial sync failed:', err)
  })

  // Periodic re-sync (5min) to capture CLI-created sessions
  syncInterval = setInterval(() => {
    triggerSync().catch(console.error)
  }, 5 * 60 * 1000)
}

export function stopSessionsServer(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (!serverProcess) return
  serverProcess.kill()
  serverProcess = null
}

/** Trigger an incremental sync on the sessions-server. Prevents concurrent runs. */
export async function triggerSync(full = false): Promise<SyncResult | null> {
  if (syncInFlight) return null
  syncInFlight = true
  try {
    const endpoint = full ? '/api/sync/full' : '/api/sync'
    const res = await fetch(`${SESSIONS_SERVER_URL}${endpoint}`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
    const json = (await res.json()) as { data: SyncResult }
    console.log('[sessions-server] sync complete:', JSON.stringify(json.data))
    return json.data
  } finally {
    syncInFlight = false
  }
}

/** Debounced sync for event-driven triggers (session end, project switch). */
export function debouncedSync(delayMs = 2000): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    triggerSync().catch(console.error)
  }, delayMs)
}

async function waitForServer(maxRetries = 20, intervalMs = 300): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${SESSIONS_SERVER_URL}/api/ping`, { signal: AbortSignal.timeout(500) })
      if (res.ok) return
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  console.warn('[sessions-server] did not become ready in time — continuing anyway')
}

export { SESSIONS_SERVER_URL, SESSIONS_SERVER_PORT }
