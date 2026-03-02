import { ClaudeRuntimeAdapter } from './claude-runtime-adapter';
import type {
  RuntimeAdapter,
  RuntimeCapabilityReport,
  RuntimeId,
} from './types';

export class RuntimeRegistry {
  private readonly adapters: Map<RuntimeId, RuntimeAdapter> = new Map();
  private activeRuntime: RuntimeId;

  constructor(defaultRuntime: RuntimeId = 'claude') {
    this.register(new ClaudeRuntimeAdapter());
    this.activeRuntime = defaultRuntime;
  }

  register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  setActiveRuntime(runtimeId: RuntimeId): void {
    if (!this.adapters.has(runtimeId)) {
      throw new Error(`Runtime adapter not registered: ${runtimeId}`);
    }
    this.activeRuntime = runtimeId;
  }

  getActiveRuntime(): RuntimeId {
    return this.activeRuntime;
  }

  listRuntimes(): RuntimeId[] {
    return Array.from(this.adapters.keys());
  }

  getCapabilities(runtimeId: RuntimeId = this.activeRuntime): RuntimeCapabilityReport {
    const adapter = this.adapters.get(runtimeId);
    if (!adapter) {
      throw new Error(`Runtime adapter not registered: ${runtimeId}`);
    }
    return adapter.getCapabilities();
  }
}

export const runtimeRegistry = new RuntimeRegistry();
