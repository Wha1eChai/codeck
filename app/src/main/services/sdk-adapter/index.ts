// ============================================================
// SDK Adapter - Barrel Export
// ============================================================

export { parseSDKMessage, createSDKMessageParser } from './message-parser'
export type { ParseOptions, ParseResult, SDKMessageParser } from './message-parser'

export { parseContentBlocks, mapUsage } from './content-block-parser'

export {
  assessToolRisk,
  summarizeToolInput,
  toPermissionRequest,
  toSDKPermissionResult,
  buildPermissionDecisionKey,
  createPermissionHandler,
} from './permission-adapter'
export type {
  PermissionDecisionSnapshot,
  PermissionDecisionStore,
  PermissionHandlerDeps,
} from './permission-adapter'

export { buildQueryArgs } from './options-builder'
export type { SessionParams, QueryArgs } from './options-builder'

export { resolveModelAlias } from './model-alias-resolver'

export { getSDKEnv, loadClaudeEnv } from './env-loader'
export type { ClaudeEnvConfig } from './env-loader'

export { mapMcpServersToSDKConfig } from './mcp-mapper'

export type {
  SessionMetadata,
  SDKCanUseToolCallback,
  SDKQuery,
  SDKAgentDefinition,
  SDKMcpServerConfig,
} from './sdk-types'
