import { app, shell, BrowserWindow, session } from "electron"
import { join } from "path"
import { execSync } from "child_process"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import { registerIpcHandlers } from "./services/ipc-handlers"
import { startSessionsServer, stopSessionsServer, SESSIONS_SERVER_PORT } from "./services/sessions-server"

// Windows 终端默认 codepage (GBK/936) 无法正确显示 UTF-8 中文，
// 设置为 65001 (UTF-8) 确保 process.stdout.write 输出的调试日志可读。
if (process.platform === 'win32' && is.dev) {
  try { execSync('chcp 65001', { stdio: 'ignore' }) } catch { /* ignore */ }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "Codeck",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // ── CSP Security Policy ──
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const sessionsOrigin = `http://localhost:${SESSIONS_SERVER_PORT}`
    const csp = is.dev
      ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        `connect-src 'self' ws://localhost:* http://localhost:*`,
        "img-src 'self' data: blob:",
      ].join("; ")
      : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        // Allow main process → sessions server (IPC fetch goes through main process,
        // but include origin here as belt-and-suspenders for future direct renderer use)
        `connect-src 'self' ${sessionsOrigin}`,
        "img-src 'self' data: blob:",
      ].join("; ")

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    })
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  // Dev mode: open DevTools and load from dev server
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools()
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.codeck.app")

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start the sessions parsing server before registering IPC handlers
  startSessionsServer().catch((err) => {
    console.error('[main] Failed to start sessions server:', err)
  })

  // Register IPC handlers with a getter to always resolve the current window
  registerIpcHandlers(() => mainWindow)

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  stopSessionsServer()
  if (process.platform !== "darwin") {
    app.quit()
  }
})
