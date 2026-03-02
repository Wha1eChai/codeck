import type { BrowserWindow } from 'electron';
import type { PermissionResponse } from '@common/types';
import { claudeService } from '../claude';
import type { RuntimeAdapter, RuntimeCapabilityReport, RuntimeSessionParams } from './types';

const CLAUDE_CAPABILITIES: RuntimeCapabilityReport = {
  runtime: 'claude',
  supports: {
    resume: true,
    permissionPrompt: true,
    streamDelta: true,
    nativeFileHistory: true,
    // Phase 2 capabilities
    checkpointing: true,
    hooks: true,
    modelSelection: true,
    embeddedTerminal: true, // terminal is runtime-agnostic
  },
  supportedPermissionModes: [
    'default',
    'plan',
    'acceptEdits',
    'dontAsk',
    'bypassPermissions',
  ],
  notes: [
    'Uses @anthropic-ai/claude-agent-sdk query() stream',
    'Session metadata and resume rely on SDK system/init payload',
  ],
};

export class ClaudeRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'claude' as const;

  getCapabilities(): RuntimeCapabilityReport {
    return CLAUDE_CAPABILITIES;
  }

  async startSession(window: BrowserWindow, params: RuntimeSessionParams): Promise<void> {
    await claudeService.startSession(window, params);
  }

  abort(): void {
    claudeService.abort();
  }

  resetSession(): void {
    claudeService.resetSession();
  }

  setResumeSessionId(sessionId: string | null): void {
    claudeService.setSDKSessionId(sessionId);
  }

  resolvePermission(response: PermissionResponse): void {
    claudeService.resolvePermission(response);
  }
}
