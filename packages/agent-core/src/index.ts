export type { ToolDefinition, ToolResult, ToolContext } from './tools/types.js'
export type { ToolRegistry } from './tools/registry.js'
export { createToolRegistry } from './tools/registry.js'
export { createDefaultToolRegistry } from './tools/index.js'

export type { SystemPromptOptions, ClaudeMdSource, AssembleSystemPromptOptions } from './prompt/index.js'
export { buildEnvironmentBlock, assembleSystemPrompt } from './prompt/index.js'

export type { AgentEvent, StepUsage, TotalUsage, AgentLoopOptions } from './loop/index.js'
export { startAgentLoop, runAgentLoop } from './loop/index.js'
export { createDoomDetector } from './loop/index.js'

export type {
  RiskLevel, PermissionScope, PermissionRequest, PermissionResponse,
  PermissionDecision, PermissionCallback, PermissionGate, PermissionGateOptions,
  PermissionMemoryStore,
} from './permission/index.js'
export { createPermissionGate, createPermissionMemoryStore, assessToolRisk } from './permission/index.js'
