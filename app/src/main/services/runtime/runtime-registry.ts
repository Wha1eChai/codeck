import type { BrowserWindow } from 'electron';
import type { PermissionResponse } from '@common/types';
import { ClaudeRuntimeAdapter } from './claude-runtime-adapter';
import type {
  RuntimeAdapter,
  RuntimeCapabilityReport,
  RuntimeId,
  RuntimeSessionParams,
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

  async startSession(window: BrowserWindow, params: RuntimeSessionParams): Promise<void> {
    await this.getActiveAdapter().startSession(window, params);
  }

  abort(): void {
    this.getActiveAdapter().abort();
  }

  resetSession(): void {
    this.getActiveAdapter().resetSession();
  }

  setResumeSessionId(sessionId: string | null): void {
    const adapter = this.getActiveAdapter();
    adapter.setResumeSessionId?.(sessionId);
  }

  resolvePermission(response: PermissionResponse): void {
    this.getActiveAdapter().resolvePermission(response);
  }

  private getActiveAdapter(): RuntimeAdapter {
    const adapter = this.adapters.get(this.activeRuntime);
    if (!adapter) {
      throw new Error(`Runtime adapter not registered: ${this.activeRuntime}`);
    }
    return adapter;
  }
}

export const runtimeRegistry = new RuntimeRegistry();
