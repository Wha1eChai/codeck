// ============================================================
// SDK 真实集成测试 — 验证 query() → parseSDKMessage 闭环
//
// 运行方式: pnpm test:integration
// 前置条件:
//   1. ~/.claude/settings.json 中配置了有效的 API Key 和 BASE_URL
//   2. Windows 上需要 git-bash（自动探测）
//   3. 网络可达 API 端点
//
// 注意: 此测试会产生真实 API 调用
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { parseSDKMessage } from '../message-parser'
import { getSDKEnv } from './env-loader'
import type { Message } from '@common/types'
import type { SessionMetadata } from '../sdk-types'

const INTEGRATION_TIMEOUT = 120_000

describe('SDK Integration: real query() → parseSDKMessage', () => {
  let sdkEnv: Record<string, string>

  beforeAll(() => {
    sdkEnv = getSDKEnv()

    if (!sdkEnv.ANTHROPIC_API_KEY) {
      throw new Error(
        '集成测试需要 ANTHROPIC_API_KEY，请在 ~/.claude/settings.json 的 env 中配置',
      )
    }

    if (process.platform === 'win32' && !sdkEnv.CLAUDE_CODE_GIT_BASH_PATH) {
      throw new Error(
        'Windows 上需要 CLAUDE_CODE_GIT_BASH_PATH，请安装 git-bash 或在 env 中配置路径',
      )
    }
  })

  it(
    'should complete a conversation and correctly parse all SDK message types',
    async () => {
      const allMessages: Message[] = []
      let metadata: SessionMetadata | undefined
      const seenSDKTypes = new Set<string>()
      const seenInternalTypes = new Set<string>()

      const conversation = query({
        prompt: 'Respond with exactly one word: PONG',
        options: {
          maxTurns: 1,
          permissionMode: 'default',
          cwd: process.cwd(),
          persistSession: false,
          env: sdkEnv,
        },
      })

      for await (const sdkMsg of conversation) {
        const raw = sdkMsg as Record<string, unknown>
        const sdkType = raw.type as string
        seenSDKTypes.add(sdkType)

        const result = parseSDKMessage(sdkMsg, 'integration-test-session')

        if (result.metadata) {
          metadata = result.metadata
        }

        for (const msg of result.messages) {
          allMessages.push(msg)
          seenInternalTypes.add(msg.type)
        }

        if (sdkType === 'result') break
      }

      // ── 验证 1: init 消息被正确解析为 metadata ──
      expect(metadata).toBeDefined()
      expect(metadata!.sessionId).toBeTruthy()
      expect(typeof metadata!.model).toBe('string')
      expect(metadata!.permissionMode).toBeTruthy()
      expect(metadata!.tools).toBeDefined()
      expect(Array.isArray(metadata!.tools)).toBe(true)
      expect(metadata!.tools!.length).toBeGreaterThan(0)

      // ── 验证 2: 收到了 assistant 消息（可能是 text 或 thinking） ──
      const assistantMessages = allMessages.filter((m) => m.role === 'assistant')
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1)

      // ── 验证 3: 所有消息的基本结构完整 ──
      for (const msg of allMessages) {
        expect(msg.id).toBeTruthy()
        expect(msg.sessionId).toBe('integration-test-session')
        expect(msg.role).toBeTruthy()
        expect(msg.type).toBeTruthy()
        expect(typeof msg.timestamp).toBe('number')
      }

      // ── 验证 4: 观测到了核心 SDK 消息类型 ──
      expect(seenSDKTypes.has('system')).toBe(true)
      expect(seenSDKTypes.has('assistant')).toBe(true)
      expect(seenSDKTypes.has('result')).toBe(true)

      // ── 验证 5: result 消息产出了 usage ──
      const usageMessages = allMessages.filter((m) => m.type === 'usage')
      expect(usageMessages.length).toBeGreaterThanOrEqual(1)
      const lastUsage = usageMessages[usageMessages.length - 1]
      expect(lastUsage.usage).toBeDefined()
      expect(typeof lastUsage.usage!.inputTokens).toBe('number')
      expect(typeof lastUsage.usage!.outputTokens).toBe('number')

      // ── 验证 6: 消息 ID 全部唯一（fan-out 后无冲突） ──
      const allIds = allMessages.map((m) => m.id)
      expect(new Set(allIds).size).toBe(allIds.length)

      console.log('\n=== Integration Test Results ===')
      console.log('SDK types seen:', [...seenSDKTypes])
      console.log('Internal types seen:', [...seenInternalTypes])
      console.log('Total messages:', allMessages.length)
      console.log('Metadata model:', metadata?.model)
      console.log('Metadata permissionMode:', metadata?.permissionMode)
      console.log(
        'Assistant content preview:',
        assistantMessages.map((m) => m.content.substring(0, 60)),
      )
    },
    INTEGRATION_TIMEOUT,
  )

  it(
    'should fan-out multi-block assistant messages with deterministic IDs',
    async () => {
      const allMessages: Message[] = []
      const blockIdPattern = /_block_\d+$/

      const conversation = query({
        prompt: 'Think about what 2+2 equals, then answer with just the number.',
        options: {
          maxTurns: 1,
          permissionMode: 'default',
          cwd: process.cwd(),
          persistSession: false,
          env: sdkEnv,
        },
      })

      for await (const sdkMsg of conversation) {
        const result = parseSDKMessage(sdkMsg, 'fanout-test-session')
        for (const msg of result.messages) {
          allMessages.push(msg)
        }
        if ((sdkMsg as Record<string, unknown>).type === 'result') break
      }

      // 至少应该有 assistant 消息
      const assistantMsgs = allMessages.filter((m) => m.role === 'assistant')
      expect(assistantMsgs.length).toBeGreaterThanOrEqual(1)

      // fan-out 的消息 ID 应符合 ${uuid}_block_${index} 格式
      for (const msg of assistantMsgs) {
        expect(msg.id).toMatch(blockIdPattern)
      }

      // 所有 ID 唯一
      const ids = allMessages.map((m) => m.id)
      expect(new Set(ids).size).toBe(ids.length)

      console.log('\n=== Fan-out Test Results ===')
      console.log('Total messages:', allMessages.length)
      console.log(
        'Assistant breakdown:',
        assistantMsgs.map((m) => `${m.type}:${m.id}`),
      )
    },
    INTEGRATION_TIMEOUT,
  )

  it(
    'should handle error result gracefully (resume non-existent session)',
    async () => {
      const allMessages: Message[] = []
      const seenTypes = new Set<string>()

      const conversation = query({
        prompt: 'say ok',
        options: {
          maxTurns: 1,
          permissionMode: 'default',
          cwd: process.cwd(),
          persistSession: false,
          resume: '00000000-0000-0000-0000-000000000000',
          env: sdkEnv,
        },
      })

      try {
        for await (const sdkMsg of conversation) {
          const msgType = (sdkMsg as Record<string, unknown>).type as string
          seenTypes.add(msgType)
          const result = parseSDKMessage(sdkMsg, 'error-test-session')
          for (const msg of result.messages) {
            allMessages.push(msg)
          }
          if (msgType === 'result') break
        }
      } catch {
        // SDK 可能直接抛出异常，这也是可接受的行为
      }

      // parseSDKMessage 不应崩溃，所有已解析的消息结构完整
      for (const msg of allMessages) {
        expect(msg.id).toBeTruthy()
        expect(msg.sessionId).toBe('error-test-session')
      }

      console.log('\n=== Error Handling Test Results ===')
      console.log('SDK types seen:', [...seenTypes])
      console.log('Messages parsed:', allMessages.length)
    },
    INTEGRATION_TIMEOUT,
  )
})
