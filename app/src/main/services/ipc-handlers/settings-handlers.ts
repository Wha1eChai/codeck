import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import { updatePreferencesSchema } from '@common/schemas';
import { appPreferencesService } from '../app-preferences';
import { createHandler, createValidatedHandler } from './create-handler';

import type { AppPreferences } from '@common/types';

export function registerSettingsHandlers() {
  createHandler(RENDERER_TO_MAIN.GET_SETTINGS, {
    handle: () => appPreferencesService.get(),
  });

  createValidatedHandler(RENDERER_TO_MAIN.UPDATE_SETTINGS, {
    schema: updatePreferencesSchema,
    handle: (validated) => appPreferencesService.update(validated as Partial<AppPreferences>),
  });
}
