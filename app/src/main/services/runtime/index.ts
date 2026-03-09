export { RuntimeRegistry } from './runtime-registry';
export { ClaudeRuntimeAdapter } from './claude-runtime-adapter';
export { KernelRuntimeAdapter } from './kernel-runtime-adapter';
export { runtimeRegistry, createRuntimeRegistry, initTeamBridgeDeps } from './setup';
export type { TeamBridgeDeps } from './kernel-service';
export type {
  RuntimeAdapter,
  RuntimeCapabilityReport,
  RuntimeId,
} from './types';
