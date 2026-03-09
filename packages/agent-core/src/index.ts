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

export type { MessageLike, MessageRole, MessageType, TokenUsageLike } from './mapper/index.js'
export type { EventToMessageMapper, EventToMessageMapperOptions } from './mapper/index.js'
export { createEventToMessageMapper } from './mapper/index.js'

export type { McpConnection, McpToolDefinition } from './mcp/index.js'
export { connectMcpServer, bridgeMcpTools } from './mcp/index.js'

export type { ContextBudget } from './context/index.js'
export {
  estimateTokens, estimateMessageTokens, estimateMessagesTokens,
  compressToolResult, pruneMessages, createContextBudget,
} from './context/index.js'
