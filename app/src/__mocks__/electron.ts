/**
 * Global Electron mock for Vitest.
 * Resolves via alias in vitest.config.ts so no test needs an explicit vi.mock('electron').
 * Prevents binary-path resolution failures in CI (ELECTRON_SKIP_BINARY_DOWNLOAD=1).
 */
import { vi } from 'vitest'

export const app = {
  getPath: vi.fn(() => '/tmp'),
  getVersion: vi.fn(() => '0.0.0'),
  on: vi.fn(),
  whenReady: vi.fn(() => Promise.resolve()),
}

export const BrowserWindow = class {
  isDestroyed = vi.fn(() => false)
  webContents = { send: vi.fn() }
  on = vi.fn()
  loadURL = vi.fn()
  show = vi.fn()
}

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
}

export const ipcRenderer = {
  on: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(() => Promise.resolve()),
  removeAllListeners: vi.fn(),
}

export const dialog = {
  showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
  showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
}

export const shell = {
  openExternal: vi.fn(),
}
