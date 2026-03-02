// ============================================================
// SDK 消息结构诊断脚本 — 捕获真实 SDK 输出用于修复适配层
//
// 运行: set CLAUDE_CODE_GIT_BASH_PATH=D:\coding\Git\bin\bash.exe && node --import tsx src/main/services/sdk-adapter/__integration__/diagnose-sdk-messages.ts
// ============================================================

import { query } from '@anthropic-ai/claude-agent-sdk'
import { getSDKEnv } from './env-loader'

async function main() {
  const sdkEnv = getSDKEnv()

  console.log('=== Environment ===')
  console.log('ANTHROPIC_API_KEY:', sdkEnv.ANTHROPIC_API_KEY ? '***SET***' : 'NOT SET')
  console.log('ANTHROPIC_BASE_URL:', sdkEnv.ANTHROPIC_BASE_URL ?? 'default')
  console.log('CLAUDE_CODE_GIT_BASH_PATH:', sdkEnv.CLAUDE_CODE_GIT_BASH_PATH ?? 'NOT SET')
  console.log()

  const conversation = query({
    prompt: 'Respond with exactly one word: PONG',
    options: {
      maxTurns: 1,
      permissionMode: 'plan',
      cwd: process.cwd(),
      persistSession: false,
      env: sdkEnv,
    },
  })

  let msgIndex = 0
  for await (const sdkMsg of conversation) {
    const raw = sdkMsg as Record<string, unknown>
    console.log(`\n=== Message #${msgIndex} ===`)
    console.log('type:', raw.type)
    console.log('subtype:', raw.subtype)
    console.log('Full keys:', Object.keys(raw))
    console.log('JSON:', JSON.stringify(raw, null, 2).substring(0, 3000))

    // 特别关注 assistant 消息的内部结构
    if (raw.type === 'assistant') {
      const message = raw.message as Record<string, unknown> | undefined
      if (message) {
        console.log('\n  --- assistant.message ---')
        console.log('  message keys:', Object.keys(message))
        console.log('  message.role:', message.role)
        const content = message.content
        if (Array.isArray(content)) {
          console.log('  message.content is Array, length:', content.length)
          content.forEach((block: Record<string, unknown>, i: number) => {
            console.log(`  block[${i}]:`, JSON.stringify(block).substring(0, 500))
          })
        } else {
          console.log('  message.content type:', typeof content)
          console.log('  message.content:', JSON.stringify(content).substring(0, 500))
        }
      } else {
        console.log('  NO .message field!')
      }
    }

    msgIndex++
    if (raw.type === 'result') break
  }

  console.log(`\n=== Done: ${msgIndex} messages total ===`)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
