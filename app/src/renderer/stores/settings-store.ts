import { create } from 'zustand'
import { AppPreferences, ExecutionOptions, HookSettings } from '@common/types'
import { DEFAULT_APP_PREFERENCES, DEFAULT_EXECUTION_OPTIONS, DEFAULT_HOOK_SETTINGS } from '@common/defaults'
import { createLogger } from '../lib/logger'

const logger = createLogger('settings-store')

interface SettingsStore {
  settings: AppPreferences
  isLoading: boolean
  /** Timestamp of last successful settings save (for UI feedback) */
  lastSaved: number
  /** Phase 2: per-session execution parameters configured in SettingsPanel */
  executionOptions: ExecutionOptions
  /** Phase 2: per-session hook settings configured in SettingsPanel */
  hookSettings: HookSettings
  setSettings: (settings: AppPreferences) => void
  updateSettings: (partial: Partial<AppPreferences>) => Promise<void>
  loadSettings: () => Promise<void>
  updateExecutionOptions: (partial: Partial<ExecutionOptions>) => void
  updateHookSettings: (partial: Partial<HookSettings>) => void
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_APP_PREFERENCES,
  isLoading: false,
  lastSaved: 0,
  executionOptions: DEFAULT_EXECUTION_OPTIONS,
  hookSettings: DEFAULT_HOOK_SETTINGS,

  setSettings: (settings) => set({ settings }),

  updateSettings: async (partial) => {
    // Optimistic update
    set((state) => ({
      settings: { ...state.settings, ...partial }
    }))

    // Persist to backend
    try {
      await window.electron.updateSettings(partial)
      set({ lastSaved: Date.now() })
    } catch (error) {
      // Rollback on failure by reloading from backend
      logger.error('Failed to persist settings:', error)
      await get().loadSettings()
    }
  },

  loadSettings: async () => {
    set({ isLoading: true })
    try {
      const loaded = await window.electron.getSettings()
      set({ settings: loaded })
    } catch (error) {
      logger.error('Failed to load settings:', error)
      // Keep default settings on failure
    } finally {
      set({ isLoading: false })
    }
  },

  updateExecutionOptions: (partial) => {
    set((state) => ({
      executionOptions: { ...state.executionOptions, ...partial }
    }))
  },

  updateHookSettings: (partial) => {
    set((state) => ({
      hookSettings: { ...state.hookSettings, ...partial }
    }))
  },
}))
