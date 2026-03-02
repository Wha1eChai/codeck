import type { PermissionMode, AppPreferences } from '@common/types';
import { appPreferencesService } from './app-preferences';
import type { RuntimeId } from './runtime';

export interface RuntimeContextInput {
  projectPath: string;
  sessionId?: string;
  runtime?: RuntimeId;
  permissionMode?: PermissionMode;
}

export interface RuntimeContext {
  runtime: RuntimeId;
  projectPath: string;
  sessionId?: string;
  permissionMode: PermissionMode;
  preferences: AppPreferences;
  sources: {
    runtime: 'request' | 'session' | 'userSettings' | 'fallback';
    permissionMode: 'request' | 'userSettings';
  };
}

export class RuntimeContextService {
  async buildContext(input: RuntimeContextInput): Promise<RuntimeContext> {
    const preferences = await appPreferencesService.get();
    const runtime = input.runtime ?? preferences.defaultRuntime ?? 'claude';
    const permissionMode = input.permissionMode ?? preferences.defaultPermissionMode;

    return {
      runtime,
      projectPath: input.projectPath,
      sessionId: input.sessionId,
      permissionMode,
      preferences,
      sources: {
        runtime: input.runtime ? 'request' : preferences.defaultRuntime ? 'userSettings' : 'fallback',
        permissionMode: input.permissionMode ? 'request' : 'userSettings',
      },
    };
  }
}

export const runtimeContextService = new RuntimeContextService();

