#!/usr/bin/env node
/**
 * 验证脚本：动态获取 Anthropic 可用模型列表
 *
 * 用法:
 *   node scripts/verify-models-api.mjs
 *
 * API Key / Token 解析优先级:
 *   1. 环境变量 ANTHROPIC_API_KEY
 *   2. ~/.claude/settings.json → env.ANTHROPIC_API_KEY
 *   3. ~/.claude/.credentials.json → claudeAiOauth.accessToken (OAuth 登录)
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── 1. Resolve API Key ──

async function resolveApiKey() {
  // Priority 1: env var
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, source: 'environment variable' }
  }

  // Priority 2: ~/.claude/settings.json → env.ANTHROPIC_API_KEY
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    const key = settings?.env?.ANTHROPIC_API_KEY
    if (key) {
      return { key, source: '~/.claude/settings.json → env.ANTHROPIC_API_KEY' }
    }
  } catch {
    // settings.json not found or invalid
  }

  // Priority 3: ~/.claude/.credentials.json → OAuth token
  try {
    const credPath = join(homedir(), '.claude', '.credentials.json')
    const raw = await readFile(credPath, 'utf-8')
    const creds = JSON.parse(raw)
    const token = creds?.claudeAiOauth?.accessToken
    if (token) {
      return { key: token, source: '~/.claude/.credentials.json → OAuth accessToken' }
    }
  } catch {
    // credentials not found
  }

  return null
}

// ── 2. Fetch models ──

async function fetchModels(apiKey) {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const url = `${baseUrl}/v1/models?limit=100`

  // OAuth tokens (sk-ant-oat*) use Bearer auth; API keys use x-api-key
  const isOAuth = apiKey.startsWith('sk-ant-oat')
  const headers = {
    'anthropic-version': '2023-06-01',
    ...(isOAuth
      ? { 'Authorization': `Bearer ${apiKey}` }
      : { 'x-api-key': apiKey }),
  }

  console.log(`[fetch] GET ${url}`)
  console.log(`[auth]  ${isOAuth ? 'Bearer (OAuth)' : 'x-api-key'}`)
  console.log()

  const res = await fetch(url, { headers })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }

  return res.json()
}

// ── 3. Main ──

async function main() {
  const resolved = await resolveApiKey()
  if (!resolved) {
    console.error('ERROR: No API key or OAuth token found.')
    console.error('Checked:')
    console.error('  1. env ANTHROPIC_API_KEY')
    console.error('  2. ~/.claude/settings.json → env.ANTHROPIC_API_KEY')
    console.error('  3. ~/.claude/.credentials.json → claudeAiOauth.accessToken')
    process.exit(1)
  }

  const { key: apiKey, source } = resolved
  console.log(`[key] source: ${source}`)
  console.log(`[key] value: ${apiKey.slice(0, 15)}...${apiKey.slice(-4)} (${apiKey.length} chars)`)
  console.log()

  const result = await fetchModels(apiKey)

  console.log(`Found ${result.data.length} models (has_more: ${result.has_more}):`)
  console.log()

  // Table output
  const maxIdLen = Math.max(...result.data.map(m => m.id.length), 10)
  const maxNameLen = Math.max(...result.data.map(m => (m.display_name || '').length), 12)

  console.log(
    'ID'.padEnd(maxIdLen + 2) +
    'Display Name'.padEnd(maxNameLen + 2) +
    'Created'
  )
  console.log('-'.repeat(maxIdLen + maxNameLen + 25))

  for (const model of result.data) {
    const created = model.created_at
      ? new Date(model.created_at).toISOString().split('T')[0]
      : 'n/a'
    console.log(
      model.id.padEnd(maxIdLen + 2) +
      (model.display_name || '-').padEnd(maxNameLen + 2) +
      created
    )
  }

  console.log()
  console.log('--- Raw JSON (first 3) ---')
  console.log(JSON.stringify(result.data.slice(0, 3), null, 2))
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
