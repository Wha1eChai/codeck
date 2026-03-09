import { RuntimeRegistry } from './runtime-registry';
import { ClaudeRuntimeAdapter } from './claude-runtime-adapter';
import { KernelRuntimeAdapter } from './kernel-runtime-adapter';
import { KernelService } from './kernel-service';
import type { TeamBridgeDeps } from './kernel-service';
import { claudeService } from '../claude';

/**
 * Initialize the runtime registry with all available adapters.
 * Called once at module load. Future providers register here.
 *
 * NOTE: Codex/OpenCode use ACP (Agent Control Protocol, JSON-RPC 2.0 over stdio),
 * which is fundamentally different from Claude CLI's stream-json protocol.
 * They will be registered via a future AcpRuntimeAdapter (M2b).
 */
const kernelService = new KernelService();

export function createRuntimeRegistry(): RuntimeRegistry {
  const registry = new RuntimeRegistry();
  registry.register(new ClaudeRuntimeAdapter(claudeService));
  registry.register(new KernelRuntimeAdapter(kernelService));
  return registry;
}

export const runtimeRegistry = createRuntimeRegistry();

/**
 * Wire the TeamBridge dependencies into KernelService.
 * Must be called after SessionOrchestrator is constructed to break the
 * circular dependency: setup → kernel-service → session-orchestrator → runtime/index → setup.
 *
 * Called from the main process entry point (index.ts) after all modules are loaded.
 */
export function initTeamBridgeDeps(deps: TeamBridgeDeps): void {
  kernelService.setTeamBridgeDeps(deps);
}
