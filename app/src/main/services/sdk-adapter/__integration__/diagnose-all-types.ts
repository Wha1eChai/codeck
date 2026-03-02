// ============================================================
// SDK 消息类型全面诊断脚本
//
// 设计多个场景触发尽可能多的 SDK 消息类型和 content block 类型，
// 捕获完整的原始结构，输出到 JSON 文件供分析。
//
// 运行: pnpm tsx src/main/services/sdk-adapter/__integration__/diagnose-all-types.ts
// 输出: src/main/services/sdk-adapter/__integration__/sdk-message-dump.json
// ============================================================

import { query } from '@anthropic-ai/claude-agent-sdk'
import { getSDKEnv } from '../env-loader'
import { writeFileSync } from 'fs'
import { join } from 'path'

const TIMEOUT = 120_000

interface CapturedMessage {
  readonly scenarioName: string
  readonly index: number
  readonly type: string
  readonly subtype?: string
  readonly keys: readonly string[]
  readonly raw: unknown
  readonly contentBlocks?: readonly ContentBlockInfo[]
  readonly streamEventType?: string
}

interface ContentBlockInfo {
  readonly blockIndex: number
  readonly type: string
  readonly keys: readonly string[]
  readonly preview: string
}

interface ScenarioResult {
  readonly name: string
  readonly prompt: string
  readonly permissionMode: string
  readonly messageCount: number
  readonly uniqueTypes: readonly string[]
  readonly uniqueSubtypes: readonly string[]
  readonly uniqueContentBlockTypes: readonly string[]
  readonly messages: readonly CapturedMessage[]
  readonly error?: string
}

// ── 场景定义 ──

interface Scenario {
  readonly name: string
  readonly prompt: string
  readonly permissionMode: 'default' | 'plan' | 'acceptEdits'
  readonly maxTurns: number
  readonly includePartialMessages?: boolean
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: '01_simple_text',
    prompt: 'Respond with exactly: Hello World',
    permissionMode: 'default',
    maxTurns: 1,
  },
  {
    name: '02_thinking_and_text',
    prompt: 'Think step by step about what 2+2 equals, then answer with just the number.',
    permissionMode: 'default',
    maxTurns: 1,
  },
  {
    name: '03_tool_use_read',
    prompt: 'Read the file package.json and tell me the project name. Only read that one file.',
    permissionMode: 'acceptEdits',
    maxTurns: 2,
  },
  {
    name: '04_tool_use_bash',
    prompt: 'Run the command "echo DIAGNOSTIC_TEST" and tell me the output.',
    permissionMode: 'acceptEdits',
    maxTurns: 2,
  },
  {
    name: '05_multi_tool',
    prompt: 'List the files in the current directory using ls, then read package.json. Report the project name.',
    permissionMode: 'acceptEdits',
    maxTurns: 3,
  },
  {
    name: '06_stream_events',
    prompt: 'Write a short haiku about coding.',
    permissionMode: 'default',
    maxTurns: 1,
    includePartialMessages: true,
  },
  {
    name: '07_error_max_turns',
    prompt: 'Read every file in the src directory one by one. Do not stop until you have read all of them.',
    permissionMode: 'acceptEdits',
    maxTurns: 1,
  },
  {
    name: '08_plan_mode',
    prompt: 'Analyze the project structure and suggest improvements.',
    permissionMode: 'plan',
    maxTurns: 1,
  },
]

// ── 消息捕获 ──

function captureMessage(sdkMsg: unknown, scenarioName: string, index: number): CapturedMessage {
  const raw = sdkMsg as Record<string, unknown>
  const type = raw.type as string
  const subtype = raw.subtype as string | undefined

  const captured: CapturedMessage & { contentBlocks?: ContentBlockInfo[]; streamEventType?: string } = {
    scenarioName,
    index,
    type,
    subtype,
    keys: Object.keys(raw),
    raw: sanitize(raw),
  }

  // assistant 消息: 提取 content blocks
  if (type === 'assistant') {
    const message = raw.message as Record<string, unknown> | undefined
    if (message) {
      const content = message.content
      if (Array.isArray(content)) {
        const blocks: ContentBlockInfo[] = content.map(
          (block: Record<string, unknown>, i: number) => ({
            blockIndex: i,
            type: (block.type as string) ?? 'unknown',
            keys: Object.keys(block),
            preview: JSON.stringify(block).substring(0, 300),
          }),
        )
        ;(captured as any).contentBlocks = blocks
      }
    }
  }

  // stream_event: 提取 event type
  if (type === 'stream_event') {
    const event = raw.event as Record<string, unknown> | undefined
    if (event) {
      ;(captured as any).streamEventType = event.type as string
    }
  }

  return captured
}

/** 截断过长字符串，避免 dump 文件过大 */
function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 6) return '[MAX_DEPTH]'
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return obj.length > 500 ? obj.substring(0, 500) + '...[TRUNCATED]' : obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, depth + 1))
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = sanitize(value, depth + 1)
  }
  return result
}

// ── 场景执行 ──

async function runScenario(scenario: Scenario, sdkEnv: Record<string, string>): Promise<ScenarioResult> {
  const messages: CapturedMessage[] = []
  const seenTypes = new Set<string>()
  const seenSubtypes = new Set<string>()
  const seenBlockTypes = new Set<string>()

  console.log(`\n  [${scenario.name}] Running: "${scenario.prompt.substring(0, 60)}..."`)

  try {
    const conversation = query({
      prompt: scenario.prompt,
      options: {
        maxTurns: scenario.maxTurns,
        permissionMode: scenario.permissionMode,
        cwd: process.cwd(),
        persistSession: false,
        env: sdkEnv,
        ...(scenario.includePartialMessages ? { includePartialMessages: true } : {}),
      },
    })

    let msgIndex = 0
    const startTime = Date.now()

    for await (const sdkMsg of conversation) {
      if (Date.now() - startTime > TIMEOUT) {
        console.log(`  [${scenario.name}] TIMEOUT after ${TIMEOUT}ms`)
        break
      }

      const captured = captureMessage(sdkMsg, scenario.name, msgIndex)
      messages.push(captured)
      seenTypes.add(captured.type)
      if (captured.subtype) seenSubtypes.add(captured.subtype)
      if (captured.contentBlocks) {
        for (const block of captured.contentBlocks) {
          seenBlockTypes.add(block.type)
        }
      }

      msgIndex++
      if (captured.type === 'result') break
    }

    console.log(`  [${scenario.name}] Done: ${msgIndex} messages, types: [${[...seenTypes]}], subtypes: [${[...seenSubtypes]}], blocks: [${[...seenBlockTypes]}]`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.log(`  [${scenario.name}] ERROR: ${errorMsg}`)
    return {
      name: scenario.name,
      prompt: scenario.prompt,
      permissionMode: scenario.permissionMode,
      messageCount: messages.length,
      uniqueTypes: [...seenTypes],
      uniqueSubtypes: [...seenSubtypes],
      uniqueContentBlockTypes: [...seenBlockTypes],
      messages,
      error: errorMsg,
    }
  }

  return {
    name: scenario.name,
    prompt: scenario.prompt,
    permissionMode: scenario.permissionMode,
    messageCount: messages.length,
    uniqueTypes: [...seenTypes],
    uniqueSubtypes: [...seenSubtypes],
    uniqueContentBlockTypes: [...seenBlockTypes],
    messages,
  }
}

// ── Main ──

async function main() {
  const sdkEnv = getSDKEnv()

  console.log('=== SDK Message Type Diagnostic ===')
  console.log('ANTHROPIC_API_KEY:', sdkEnv.ANTHROPIC_API_KEY ? '***SET***' : 'NOT SET')
  console.log('ANTHROPIC_BASE_URL:', sdkEnv.ANTHROPIC_BASE_URL ?? 'default')
  console.log('CLAUDE_CODE_GIT_BASH_PATH:', sdkEnv.CLAUDE_CODE_GIT_BASH_PATH ?? 'NOT SET')
  console.log(`Scenarios to run: ${SCENARIOS.length}`)

  const results: ScenarioResult[] = []

  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario, sdkEnv)
    results.push(result)
  }

  // ── 汇总统计 ──
  const allTypes = new Set<string>()
  const allSubtypes = new Set<string>()
  const allBlockTypes = new Set<string>()
  const allStreamEventTypes = new Set<string>()
  let totalMessages = 0

  for (const r of results) {
    for (const t of r.uniqueTypes) allTypes.add(t)
    for (const s of r.uniqueSubtypes) allSubtypes.add(s)
    for (const b of r.uniqueContentBlockTypes) allBlockTypes.add(b)
    totalMessages += r.messageCount
    for (const m of r.messages) {
      if (m.streamEventType) allStreamEventTypes.add(m.streamEventType)
    }
  }

  const summary = {
    totalScenarios: results.length,
    totalMessages,
    allTopLevelTypes: [...allTypes].sort(),
    allSystemSubtypes: [...allSubtypes].sort(),
    allContentBlockTypes: [...allBlockTypes].sort(),
    allStreamEventTypes: [...allStreamEventTypes].sort(),
    scenarioSummaries: results.map((r) => ({
      name: r.name,
      messageCount: r.messageCount,
      types: r.uniqueTypes,
      subtypes: r.uniqueSubtypes,
      blockTypes: r.uniqueContentBlockTypes,
      error: r.error,
    })),
  }

  const output = { summary, scenarios: results }

  // 输出到文件
  const outputPath = join(__dirname, 'sdk-message-dump.json')
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8')

  console.log('\n=== Summary ===')
  console.log(`Total messages captured: ${totalMessages}`)
  console.log(`Top-level types: ${[...allTypes].sort().join(', ')}`)
  console.log(`System subtypes: ${[...allSubtypes].sort().join(', ')}`)
  console.log(`Content block types: ${[...allBlockTypes].sort().join(', ')}`)
  console.log(`Stream event types: ${[...allStreamEventTypes].sort().join(', ')}`)
  console.log(`\nFull dump written to: ${outputPath}`)

  // 对比已知类型，找出新发现
  const KNOWN_TYPES = new Set(['assistant', 'user', 'result', 'system', 'stream_event', 'tool_progress', 'auth_status', 'tool_use_summary'])
  const KNOWN_SUBTYPES = new Set(['init', 'status', 'compact_boundary', 'hook_start', 'hook_end', 'hook_output', 'task_notification', 'files_persisted'])
  const KNOWN_BLOCKS = new Set(['text', 'thinking', 'tool_use', 'tool_result'])

  const newTypes = [...allTypes].filter((t) => !KNOWN_TYPES.has(t))
  const newSubtypes = [...allSubtypes].filter((s) => !KNOWN_SUBTYPES.has(s))
  const newBlocks = [...allBlockTypes].filter((b) => !KNOWN_BLOCKS.has(b))

  if (newTypes.length > 0) console.log(`\n🆕 NEW top-level types: ${newTypes.join(', ')}`)
  if (newSubtypes.length > 0) console.log(`🆕 NEW system subtypes: ${newSubtypes.join(', ')}`)
  if (newBlocks.length > 0) console.log(`🆕 NEW content block types: ${newBlocks.join(', ')}`)
  if (newTypes.length === 0 && newSubtypes.length === 0 && newBlocks.length === 0) {
    console.log('\nNo unknown types discovered — all within known set.')
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message ?? e)
  process.exit(1)
})
