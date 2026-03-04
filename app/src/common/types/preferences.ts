import type { PermissionMode, RuntimeProvider } from './execution'
import type { StructuredOutputConfig } from './history'

// ── 应用偏好（L3：GUI 独有，存储在 userData） ──

export interface AppPreferences {
  readonly theme: "light" | "dark" | "warm" | "system"
  readonly defaultPermissionMode: PermissionMode
  readonly defaultProjectPath?: string
  readonly defaultRuntime?: RuntimeProvider
  /** Enable SDK file checkpointing (default: true). */
  readonly checkpointEnabled?: boolean
  /** Last active session ID — restored on app restart. */
  readonly lastSessionId?: string
  /** Last active project path — restored on app restart. */
  readonly lastProjectPath?: string
  /** Model alias → full model ID mappings. */
  readonly modelAliases?: Readonly<Record<string, string>>
  /** Structured output configuration (JSON Schema). */
  readonly structuredOutput?: StructuredOutputConfig
}
