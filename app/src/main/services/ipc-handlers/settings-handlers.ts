import { ipcMain } from 'electron';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import { updatePreferencesSchema } from '@common/schemas';
import { appPreferencesService } from '../app-preferences';
import type { AppPreferences } from '@common/types';

export function registerSettingsHandlers() {
  ipcMain.handle(RENDERER_TO_MAIN.GET_SETTINGS, async () => {
    return appPreferencesService.get();
  });

  ipcMain.handle(RENDERER_TO_MAIN.UPDATE_SETTINGS, async (_, settings: unknown) => {
    const validated = updatePreferencesSchema.parse(settings);
    await appPreferencesService.update(validated as Partial<AppPreferences>);
  });
}
