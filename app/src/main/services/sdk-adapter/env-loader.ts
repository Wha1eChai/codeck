// ============================================================
// SDK Env Loader — 从 CliConfigService 读取环境配置
//
// SDK 子进程不继承父进程 process.env，必须显式传入。
// Windows 上还需要 CLAUDE_CODE_GIT_BASH_PATH。
// ============================================================

import { existsSync } from 'fs'
import { join } from 'path'
import { configReader, getProjectPath } from '../config-bridge'

export interface ClaudeEnvConfig {
  readonly env: Record<string, string>
  readonly gitBashPath: string
}

/**
 * 通过 CliConfigService 读取 env 配置，
 * 并自动探测 git-bash 路径（Windows 必需）。
 */
export async function loadClaudeEnv(): Promise<ClaudeEnvConfig> {
  const resolved = await configReader.getResolvedSettings(getProjectPath())
  const env: Record<string, string> = { ...resolved.env }
  const gitBashPath = process.platform === 'win32' ? detectGitBash(env) : ''

  return { env, gitBashPath }
}

function detectGitBash(env: Record<string, string>): string {
  // 1. settings.json 中已配置
  if (env.CLAUDE_CODE_GIT_BASH_PATH) {
    return env.CLAUDE_CODE_GIT_BASH_PATH
  }

  // 2. 进程环境变量
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) {
    return process.env.CLAUDE_CODE_GIT_BASH_PATH
  }

  // 3. 从 PATH 中的 git 路径推断
  const pathSep = process.platform === 'win32' ? ';' : ':'
  const gitPath = process.env.PATH?.split(pathSep)
    .find((p) => p.toLowerCase().includes('git'))

  if (gitPath) {
    const gitRoot = gitPath.replace(/[/\\](cmd|bin|mingw64[/\\]bin)$/i, '')
    const bashPath = join(gitRoot, 'bin', 'bash.exe')
    if (existsSync(bashPath)) {
      return bashPath
    }
  }

  // 4. 常见安装路径
  const commonPaths = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ]

  for (const p of commonPaths) {
    if (existsSync(p)) return p
  }

  return ''
}

/** SDK 子进程不需要的 env 前缀 */
const ENV_BLACKLIST_PREFIXES = ['ELECTRON_', 'npm_', 'pnpm_', 'PNPM_'] as const

/** 精确匹配的无用 env key */
const ENV_BLACKLIST_EXACT = new Set([
  'NODE_ENV_ELECTRON_VITE',
  'NODE_PATH',
  'INIT_CWD',
  'ORIGINAL_XDG_CURRENT_DESKTOP',
])

/**
 * 获取合并后的 process.env + claude settings env + git-bash 路径。
 * 用于传入 SDK query() 的 options.env。
 *
 * 过滤掉 Electron/构建工具注入的无用变量以减小请求体积。
 */
export async function getSDKEnv(): Promise<Record<string, string>> {
  const config = await loadClaudeEnv()
  const merged: Record<string, string> = {}

  // 复制当前进程环境（跳过 Electron/构建工具变量）
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (ENV_BLACKLIST_EXACT.has(k)) continue
    if (ENV_BLACKLIST_PREFIXES.some(p => k.startsWith(p))) continue
    merged[k] = v
  }

  // 覆盖 claude settings 中的 env
  for (const [k, v] of Object.entries(config.env)) {
    merged[k] = v
  }

  // 确保 git-bash 路径设置
  if (config.gitBashPath && !merged.CLAUDE_CODE_GIT_BASH_PATH) {
    merged.CLAUDE_CODE_GIT_BASH_PATH = config.gitBashPath
  }

  return merged
}
