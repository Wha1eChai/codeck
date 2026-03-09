import { RuntimeRegistry } from './runtime-registry';
import { ClaudeRuntimeAdapter } from './claude-runtime-adapter';
import { KernelRuntimeAdapter } from './kernel-runtime-adapter';
import { CliRuntimeAdapter } from './cli-runtime-adapter';
import { KernelService } from './kernel-service';
import { CliService } from './cli-service';
import { claudeService } from '../claude';

/**
 * Initialize the runtime registry with all available adapters.
 * Called once at module load. Future providers register here.
 */
export function createRuntimeRegistry(): RuntimeRegistry {
  const registry = new RuntimeRegistry();
  registry.register(new ClaudeRuntimeAdapter(claudeService));
  registry.register(new KernelRuntimeAdapter(new KernelService()));
  registry.register(new CliRuntimeAdapter(new CliService('codex'), 'codex'));
  registry.register(new CliRuntimeAdapter(new CliService('opencode'), 'opencode'));
  return registry;
}

export const runtimeRegistry = createRuntimeRegistry();
