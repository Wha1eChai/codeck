import { safeReadJson } from '../utils/file-io.js'
import { atomicWriteJson } from '../utils/file-io.js'
import {
  globalSettingsPath,
  projectSettingsPath,
  localSettingsPath,
} from '../constants/paths.js'
import { encodeProjectPath } from '../utils/path-encoding.js'
import type { SettingsScope } from '../schemas/settings.schema.js'

export interface SettingsWriterOptions {
  readonly claudeHome: string
  readonly projectPath?: string | undefined
}

/**
 * Settings writer with serialized write queue and atomic writes.
 * Ported from app/src/main/services/cli-config.ts with scope support.
 */
export class SettingsWriter {
  private readonly claudeHome: string
  private readonly projectPath: string | undefined

  /** Serialized write queue — prevents concurrent read-modify-write races. */
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(options: SettingsWriterOptions) {
    this.claudeHome = options.claudeHome
    this.projectPath = options.projectPath
  }

  private getFilePath(scope: SettingsScope): string {
    switch (scope) {
      case 'user':
        return globalSettingsPath(this.claudeHome)
      case 'project': {
        if (!this.projectPath) {
          throw new Error('projectPath is required for "project" scope')
        }
        return projectSettingsPath(this.projectPath)
      }
      case 'local': {
        if (!this.projectPath) {
          throw new Error('projectPath is required for "local" scope')
        }
        const encoded = encodeProjectPath(this.projectPath)
        return localSettingsPath(this.claudeHome, encoded)
      }
    }
  }

  private async readAll(filePath: string): Promise<Record<string, unknown>> {
    const raw = await safeReadJson<unknown>(filePath)
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>
    }
    return {}
  }

  /**
   * Write a specific top-level key, preserving all other keys.
   * Writes are serialized to prevent concurrent corruption.
   */
  writeSettingsKey(scope: SettingsScope, key: string, value: unknown): Promise<void> {
    const filePath = this.getFilePath(scope)
    this.writeQueue = this.writeQueue.then(async () => {
      const all = await this.readAll(filePath)
      const updated = { ...all, [key]: value }
      await atomicWriteJson(filePath, updated)
    })
    return this.writeQueue
  }

  /**
   * Remove a top-level key from settings.
   */
  removeSettingsKey(scope: SettingsScope, key: string): Promise<void> {
    const filePath = this.getFilePath(scope)
    this.writeQueue = this.writeQueue.then(async () => {
      const all = await this.readAll(filePath)
      const { [key]: _, ...rest } = all
      await atomicWriteJson(filePath, rest)
    })
    return this.writeQueue
  }

  /**
   * Set an env variable inside the `env` key.
   */
  setEnvVar(scope: SettingsScope, name: string, value: string): Promise<void> {
    const filePath = this.getFilePath(scope)
    this.writeQueue = this.writeQueue.then(async () => {
      const all = await this.readAll(filePath)
      const env =
        all['env'] && typeof all['env'] === 'object' && !Array.isArray(all['env'])
          ? { ...(all['env'] as Record<string, unknown>) }
          : {}
      env[name] = value
      const updated = { ...all, env }
      await atomicWriteJson(filePath, updated)
    })
    return this.writeQueue
  }

  /**
   * Remove an env variable from the `env` key.
   */
  removeEnvVar(scope: SettingsScope, name: string): Promise<void> {
    const filePath = this.getFilePath(scope)
    this.writeQueue = this.writeQueue.then(async () => {
      const all = await this.readAll(filePath)
      if (!all['env'] || typeof all['env'] !== 'object' || Array.isArray(all['env'])) return
      const env = { ...(all['env'] as Record<string, unknown>) }
      delete env[name]
      const updated = { ...all, env }
      await atomicWriteJson(filePath, updated)
    })
    return this.writeQueue
  }
}
