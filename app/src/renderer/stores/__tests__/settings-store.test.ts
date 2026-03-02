import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../settings-store'
import { DEFAULT_APP_PREFERENCES, DEFAULT_EXECUTION_OPTIONS, DEFAULT_HOOK_SETTINGS } from '@common/defaults'
import { installMockElectron, uninstallMockElectron } from '../../__test-utils__/mock-electron'
import type { MockElectronAPI } from '../../__test-utils__/mock-electron'

let mockElectron: MockElectronAPI

describe('settings-store', () => {
  beforeEach(() => {
    mockElectron = installMockElectron()
    useSettingsStore.setState({
      settings: DEFAULT_APP_PREFERENCES,
      isLoading: false,
      lastSaved: 0,
      executionOptions: DEFAULT_EXECUTION_OPTIONS,
      hookSettings: DEFAULT_HOOK_SETTINGS,
    })
  })

  afterEach(() => {
    uninstallMockElectron()
    vi.restoreAllMocks()
  })

  // ── setSettings ──

  it('setSettings — directly sets settings', () => {
    const custom = { ...DEFAULT_APP_PREFERENCES, theme: 'dark' as const }
    useSettingsStore.getState().setSettings(custom)
    expect(useSettingsStore.getState().settings.theme).toBe('dark')
  })

  // ── updateSettings (optimistic) ──

  it('updateSettings — optimistic update success path', async () => {
    await useSettingsStore.getState().updateSettings({ theme: 'warm' })

    expect(useSettingsStore.getState().settings.theme).toBe('warm')
    expect(mockElectron.updateSettings).toHaveBeenCalledWith({ theme: 'warm' })
    expect(useSettingsStore.getState().lastSaved).toBeGreaterThan(0)
  })

  it('updateSettings — rolls back on IPC failure', async () => {
    mockElectron.updateSettings.mockRejectedValueOnce(new Error('IPC failed'))
    mockElectron.getSettings.mockResolvedValueOnce({ ...DEFAULT_APP_PREFERENCES, theme: 'light' })

    await useSettingsStore.getState().updateSettings({ theme: 'warm' })

    // After rollback, loadSettings is called which resets to backend value
    expect(mockElectron.getSettings).toHaveBeenCalled()
    expect(useSettingsStore.getState().settings.theme).toBe('light')
  })

  // ── loadSettings ──

  it('loadSettings — loads from backend', async () => {
    const backendPrefs = { ...DEFAULT_APP_PREFERENCES, theme: 'dark' as const }
    mockElectron.getSettings.mockResolvedValueOnce(backendPrefs)

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().settings.theme).toBe('dark')
    expect(useSettingsStore.getState().isLoading).toBe(false)
  })

  it('loadSettings — keeps defaults on failure', async () => {
    mockElectron.getSettings.mockRejectedValueOnce(new Error('Load failed'))

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_APP_PREFERENCES)
    expect(useSettingsStore.getState().isLoading).toBe(false)
  })

  // ── Execution options ──

  it('updateExecutionOptions — merges partial updates', () => {
    useSettingsStore.getState().updateExecutionOptions({ model: 'opus' })
    expect(useSettingsStore.getState().executionOptions.model).toBe('opus')

    useSettingsStore.getState().updateExecutionOptions({ maxTurns: 10 })
    const opts = useSettingsStore.getState().executionOptions
    expect(opts.model).toBe('opus')
    expect(opts.maxTurns).toBe(10)
  })

  // ── Hook settings ──

  it('updateHookSettings — merges partial updates', () => {
    useSettingsStore.getState().updateHookSettings({ autoAllowReadOnly: true })
    expect(useSettingsStore.getState().hookSettings.autoAllowReadOnly).toBe(true)

    useSettingsStore.getState().updateHookSettings({ blockedCommands: ['rm -rf'] })
    const hooks = useSettingsStore.getState().hookSettings
    expect(hooks.autoAllowReadOnly).toBe(true)
    expect(hooks.blockedCommands).toEqual(['rm -rf'])
  })
})
