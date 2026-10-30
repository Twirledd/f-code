import { app, BrowserWindow, Menu, shell } from 'electron'
import { titleBarOverlay, windowBackground } from './theme'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { buildMenu } from './menu'
import { createServices, registerIpc } from './ipc'
import * as settings from './settings'

let mainWindow: BrowserWindow | undefined
const services = createServices()

function createWindow(): void {
  const bounds = settings.load().windowBounds
  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'F-Code',
    icon: join(__dirname, '../../build/icon.ico'),
    // The app always starts in its dark theme; the renderer updates the window controls if the theme changes.
    backgroundColor: windowBackground('dark'),
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay('dark'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // `ready-to-show` is unreliable in the packaged app on Windows (it never fired, leaving the
  // window hidden); show on whichever of these happens first. show() is idempotent.
  const reveal = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }
  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 4000)
  mainWindow.on('close', () => {
    if (mainWindow) void settings.save({ windowBounds: mainWindow.getBounds() })
  })
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('F-Code')

// One-time carry-over of settings (saved Mac, recent projects) from the pre-1.0 "Tom-Code" data folder.
function migrateLegacySettings(): void {
  try {
    const next = join(app.getPath('userData'), 'settings.json')
    const legacy = join(app.getPath('appData'), 'Tom-Code', 'settings.json')
    if (existsSync(next) || !existsSync(legacy)) return
    mkdirSync(dirname(next), { recursive: true })
    copyFileSync(legacy, next)
  } catch {
    /* a fresh start is fine */
  }
}
migrateLegacySettings()

// One F-Code at a time: launching it again (icon double-click, Start menu) just brings the
// existing window forward instead of opening a second copy that fights over settings and the Mac.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu(() => mainWindow))
  registerIpc(() => mainWindow, services)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => services.mac.shutdown())

app.on('window-all-closed', () => {
  services.swiftpm.stop()
  void services.lsp.stop()
  void services.debugger.stop()
  void services.preview.stop()
  app.quit()
})
