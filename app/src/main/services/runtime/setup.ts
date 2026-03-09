import { RuntimeRegistry } from './runtime-registry';
import { ClaudeRuntimeAdapter } from './claude-runtime-adapter';
import { KernelRuntimeAdapter } from './kernel-runtime-adapter';
import { KernelService } from './kernel-service';
import { claudeService } from '../claude';

/**
 * Initialize the runtime registry with all available adapters.
 * Called once at module load. Future providers register here.
 *
 * NOTE: Codex/OpenCode use ACP (Agent Control Protocol, JSON-RPC 2.0 over stdio),
 * which is fundamentally different from Claude CLI's stream-json protocol.
 * They will be registered via a future AcpRuntimeAdapter (M2b).
 */
export function createRuntimeRegistry(): RuntimeRegistry {
  const registry = new RuntimeRegistry();
  registry.register(new ClaudeRuntimeAdapter(claudeService));
  registry.register(new KernelRuntimeAdapter(new KernelService()));
  return registry;
}

export const runtimeRegistry = createRuntimeRegistry();
