// ============================================================
// Config Bridge — @codeck/config 统一入口
//
// ConfigReader 无状态单例（每个方法接受 projectPath 参数）
// ConfigWriter 按 projectPath 缓存（保留内部写入队列序列化）
// ============================================================

import { ConfigReader, ConfigWriter } from '@codeck/config'
import { sessionManager } from './session'

export const configReader = new ConfigReader()

let _writer: ConfigWriter | null = null
let _writerProjectPath: string | undefined

export function getConfigWriter(): ConfigWriter {
  const projectPath = getProjectPath()
  if (!_writer || _writerProjectPath !== projectPath) {
    _writer = new ConfigWriter({ projectPath })
    _writerProjectPath = projectPath
  }
  return _writer
}

export function getProjectPath(): string | undefined {
  return sessionManager.getCurrentProjectPath() ?? undefined
}
