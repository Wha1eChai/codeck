import { describe, it, expect, vi } from 'vitest'
import { buildPreToolUseHooks, buildPostToolUseHooks, buildStopHooks } from '../hooks-builder'
import type { HookSettings } from '@common/types'
import type { ToolLogEntry, StopLogEntry } from '../hooks-builder'

// ── Helpers ──

function makePreToolUseInput(toolName: string, toolInput: Record<string, unknown> = {}) {
    return {
        hook_event_name: 'PreToolUse' as const,
        tool_name: toolName,
        tool_input: toolInput,
        tool_use_id: 'tu_123',
        session_id: 'sess_1',
        transcript_path: '/tmp/transcript',
        cwd: '/home/user/project',
    }
}

function makePostToolUseInput(toolName: string) {
    return {
        hook_event_name: 'PostToolUse' as const,
        tool_name: toolName,
        tool_use_id: 'tu_456',
        tool_response: { stdout: 'ok' },
        session_id: 'sess_1',
        transcript_path: '/tmp/transcript',
        cwd: '/home/user/project',
    }
}

const signal = new AbortController().signal

async function invokeHook(matchers: Array<{ hooks: Array<(input: Record<string, unknown>, id: string | undefined, opts: { signal: AbortSignal }) => Promise<Record<string, unknown>>> }>, input: Record<string, unknown>) {
    // Invoke all hooks in all matchers until one returns a non-continue result
    for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
            const result = await hook(input, 'tu_123', { signal })
            if (!('continue' in result)) return result
        }
    }
    return { continue: true }
}

// ── PreToolUse Tests ──

describe('buildPreToolUseHooks', () => {
    const settingsWithAutoAllow: HookSettings = {
        autoAllowReadOnly: true,
        blockedCommands: [],
    }

    const settingsDisabled: HookSettings = {
        autoAllowReadOnly: false,
        blockedCommands: [],
    }

    const settingsWithBlocked: HookSettings = {
        autoAllowReadOnly: false,
        blockedCommands: ['rm -rf', 'sudo'],
    }

    const settingsFull: HookSettings = {
        autoAllowReadOnly: true,
        blockedCommands: ['rm -rf', 'sudo'],
    }

    it('Read tool → auto-allow when autoAllowReadOnly is true', async () => {
        const hooks = buildPreToolUseHooks(settingsWithAutoAllow)
        const result = await invokeHook(hooks, makePreToolUseInput('Read'))
        expect(result).toMatchObject({
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
        })
    })

    it('Glob tool → auto-allow', async () => {
        const hooks = buildPreToolUseHooks(settingsWithAutoAllow)
        const result = await invokeHook(hooks, makePreToolUseInput('Glob'))
        expect(result).toMatchObject({
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
        })
    })

    it('LS tool → auto-allow', async () => {
        const hooks = buildPreToolUseHooks(settingsWithAutoAllow)
        const result = await invokeHook(hooks, makePreToolUseInput('LS'))
        expect(result).toMatchObject({
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
        })
    })

    it('ListDir tool → auto-allow', async () => {
        const hooks = buildPreToolUseHooks(settingsWithAutoAllow)
        const result = await invokeHook(hooks, makePreToolUseInput('ListDir'))
        expect(result).toMatchObject({
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
        })
    })

    it('Edit tool → pass-through (not read-only)', async () => {
        const hooks = buildPreToolUseHooks(settingsWithAutoAllow)
        const result = await invokeHook(hooks, makePreToolUseInput('Edit'))
        expect(result).toEqual({ continue: true })
    })

    it('autoAllowReadOnly: false → no auto-allow even for Read', async () => {
        const hooks = buildPreToolUseHooks(settingsDisabled)
        expect(hooks).toHaveLength(0) // No hooks generated
    })

    it('Bash with blocked command → auto-deny', async () => {
        const hooks = buildPreToolUseHooks(settingsWithBlocked)
        const result = await invokeHook(hooks, makePreToolUseInput('Bash', { command: 'sudo rm -rf /' }))
        expect(result).toMatchObject({
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
        })
    })

    it('Bash with safe command → pass-through', async () => {
        const hooks = buildPreToolUseHooks(settingsWithBlocked)
        const result = await invokeHook(hooks, makePreToolUseInput('Bash', { command: 'ls -la' }))
        expect(result).toEqual({ continue: true })
    })

    it('Full settings: Read → allow, blocked Bash → deny', async () => {
        const hooks = buildPreToolUseHooks(settingsFull)
        expect(hooks.length).toBeGreaterThanOrEqual(2) // read-only + blocked

        // Read should auto-allow
        const readResult = await invokeHook(hooks, makePreToolUseInput('Read'))
        expect(readResult).toMatchObject({ permissionDecision: 'allow' })

        // Blocked command should auto-deny
        const bashResult = await invokeHook(hooks, makePreToolUseInput('Bash', { command: 'sudo apt install foo' }))
        expect(bashResult).toMatchObject({ permissionDecision: 'deny' })
    })

    it('empty blockedCommands array → no blocked hook', async () => {
        const hooks = buildPreToolUseHooks({ autoAllowReadOnly: false, blockedCommands: [] })
        expect(hooks).toHaveLength(0)
    })

    it('blockedCommands with whitespace-only entries → ignored', async () => {
        const hooks = buildPreToolUseHooks({ autoAllowReadOnly: false, blockedCommands: ['  ', ''] })
        expect(hooks).toHaveLength(0)
    })
})

// ── PostToolUse Tests ──

describe('buildPostToolUseHooks', () => {
    it('logs tool name, toolUseId, and timestamp', async () => {
        const logs: ToolLogEntry[] = []
        const hooks = buildPostToolUseHooks((entry) => logs.push(entry))

        const before = Date.now()
        await invokeHook(hooks, makePostToolUseInput('Read'))
        const after = Date.now()

        expect(logs).toHaveLength(1)
        expect(logs[0].tool).toBe('Read')
        expect(logs[0].toolUseId).toBe('tu_456')
        expect(logs[0].timestamp).toBeGreaterThanOrEqual(before)
        expect(logs[0].timestamp).toBeLessThanOrEqual(after)
    })

    it('returns PostToolUse hookEventName', async () => {
        const hooks = buildPostToolUseHooks(() => { })
        const result = await invokeHook(hooks, makePostToolUseInput('Bash'))
        expect(result).toMatchObject({ hookEventName: 'PostToolUse' })
    })

    it('logs multiple tool calls', async () => {
        const logs: ToolLogEntry[] = []
        const hooks = buildPostToolUseHooks((entry) => logs.push(entry))

        await invokeHook(hooks, makePostToolUseInput('Read'))
        await invokeHook(hooks, makePostToolUseInput('Bash'))
        await invokeHook(hooks, makePostToolUseInput('Edit'))

        expect(logs).toHaveLength(3)
        expect(logs.map(l => l.tool)).toEqual(['Read', 'Bash', 'Edit'])
    })
})

// ── Stop Hook Tests ──

function makeStopInput(lastMessage?: string) {
    return {
        hook_event_name: 'Stop' as const,
        stop_hook_active: true,
        ...(lastMessage !== undefined ? { last_assistant_message: lastMessage } : {}),
        session_id: 'sess_1',
        transcript_path: '/tmp/transcript',
        cwd: '/home/user/project',
    }
}

describe('buildStopHooks', () => {
    it('fires callback with timestamp and last message', async () => {
        const logs: StopLogEntry[] = []
        const hooks = buildStopHooks((entry) => logs.push(entry))

        const before = Date.now()
        await invokeHook(hooks, makeStopInput('Goodbye!'))
        const after = Date.now()

        expect(logs).toHaveLength(1)
        expect(logs[0].lastAssistantMessage).toBe('Goodbye!')
        expect(logs[0].timestamp).toBeGreaterThanOrEqual(before)
        expect(logs[0].timestamp).toBeLessThanOrEqual(after)
    })

    it('returns Stop hookEventName', async () => {
        const hooks = buildStopHooks(() => { })
        const result = await invokeHook(hooks, makeStopInput())
        expect(result).toMatchObject({ hookEventName: 'Stop' })
    })

    it('handles missing last_assistant_message', async () => {
        const logs: StopLogEntry[] = []
        const hooks = buildStopHooks((entry) => logs.push(entry))

        await invokeHook(hooks, makeStopInput())

        expect(logs).toHaveLength(1)
        expect(logs[0].lastAssistantMessage).toBeUndefined()
    })
})
