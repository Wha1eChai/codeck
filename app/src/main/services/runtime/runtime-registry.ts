import type {
  RuntimeAdapter,
  RuntimeCapabilityReport,
  RuntimeId,
} from './types';

export class RuntimeRegistry {
  private readonly adapters: Map<RuntimeId, RuntimeAdapter> = new Map();
  private activeRuntime: RuntimeId;

  constructor(defaultRuntime: RuntimeId = 'claude') {
    this.activeRuntime = defaultRuntime;
  }

  register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(runtimeId?: RuntimeId): RuntimeAdapter {
    const id = runtimeId ?? this.activeRuntime;
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Runtime adapter not registered: ${id}`);
    }
    return adapter;
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
    return this.getAdapter(runtimeId).getCapabilities();
  }
}
