import { app, BrowserWindow, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { IPC } from '@shared/ipc-channels'

/** Sends a named command to the renderer, which dispatches it through the command registry. */
function cmd(win: () => BrowserWindow | undefined, id: string) {
  return (): void => {
    win()?.webContents.send(IPC.menuCommand, id)
  }
}

export function buildMenu(win: () => BrowserWindow | undefined): Menu {
  const c = (id: string) => cmd(win, id)

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'F-Code',
      submenu: [
        { label: 'About F-Code', click: c('app.about') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Ctrl+,', click: c('app.settings') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit F-Code' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          submenu: [
            { label: 'File…', accelerator: 'Ctrl+N', click: c('file.new') },
            { label: 'Folder', accelerator: 'Ctrl+Alt+N', click: c('file.newFolder') },
            { type: 'separator' },
            { label: 'Project…', accelerator: 'Ctrl+Shift+N', click: c('project.new') }
          ]
        },
        { label: 'Open…', accelerator: 'Ctrl+O', click: c('project.open') },
        { label: 'Clone Repository…', accelerator: 'Ctrl+Alt+Shift+O', click: c('project.clone') },
        { label: 'Open Recent', submenu: [{ label: 'Clear Menu', enabled: false }] },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'Ctrl+W', click: c('editor.closeTab') },
        { label: 'Close Project', accelerator: 'Ctrl+Alt+W', click: c('project.close') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'Ctrl+S', click: c('file.save') },
        { label: 'Save All', accelerator: 'Ctrl+Alt+S', click: c('file.saveAll') },
        { label: 'Revert to Saved', click: c('file.revert') },
        { type: 'separator' },
        { label: 'Show in Explorer', click: c('file.reveal') }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Format ▸ Re-Indent', accelerator: 'Ctrl+I', click: c('editor.reindent') },
        { label: 'Toggle Comment', accelerator: 'Ctrl+/', click: c('editor.toggleComment') }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Navigators',
          submenu: [
            { label: 'Show Project Navigator', accelerator: 'Ctrl+1', click: c('nav.project') },
            { label: 'Show Source Control Navigator', accelerator: 'Ctrl+2', click: c('nav.scm') },
            { label: 'Show Symbol Navigator', accelerator: 'Ctrl+3', click: c('nav.symbols') },
            { label: 'Show Find Navigator', accelerator: 'Ctrl+4', click: c('nav.find') },
            { label: 'Show Issue Navigator', accelerator: 'Ctrl+5', click: c('nav.issues') },
            { label: 'Show Test Navigator', accelerator: 'Ctrl+6', click: c('nav.tests') },
            { label: 'Show Debug Navigator', accelerator: 'Ctrl+7', click: c('nav.debug') },
            { label: 'Show Breakpoint Navigator', accelerator: 'Ctrl+8', click: c('nav.breakpoints') },
            { label: 'Show Report Navigator', accelerator: 'Ctrl+9', click: c('nav.reports') },
            { type: 'separator' },
            { label: 'Hide/Show Navigator', accelerator: 'Ctrl+0', click: c('view.toggleNavigator') }
          ]
        },
        {
          label: 'Inspectors',
          submenu: [
            { label: 'File Inspector', accelerator: 'Ctrl+Alt+1', click: c('inspector.file') },
            { label: 'Quick Help Inspector', accelerator: 'Ctrl+Alt+2', click: c('inspector.help') },
            { type: 'separator' },
            { label: 'Hide/Show Inspector', accelerator: 'Ctrl+Alt+0', click: c('view.toggleInspector') }
          ]
        },
        {
          label: 'Debug Area',
          submenu: [
            { label: 'Hide/Show Debug Area', accelerator: 'Ctrl+Shift+Y', click: c('view.toggleDebugArea') },
            { label: 'Activate Console', accelerator: 'Ctrl+Shift+C', click: c('view.console') }
          ]
        },
        { type: 'separator' },
        { label: 'Canvas', accelerator: 'Ctrl+Alt+Return', click: c('view.toggleCanvas') },
        { label: 'Resume Preview', accelerator: 'Ctrl+Alt+P', click: c('preview.resume') },
        { type: 'separator' },
        { label: 'Show Minimap', type: 'checkbox', checked: true, click: c('editor.toggleMinimap') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' }
      ]
    },
    {
      label: 'Find',
      submenu: [
        { label: 'Find…', accelerator: 'Ctrl+F', click: c('editor.find') },
        { label: 'Find and Replace…', accelerator: 'Ctrl+Alt+F', click: c('editor.replace') },
        { label: 'Find in Project…', accelerator: 'Ctrl+Shift+F', click: c('nav.find') }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Open Quickly…', accelerator: 'Ctrl+Shift+O', click: c('nav.openQuickly') },
        { label: 'Jump to Definition', accelerator: 'Ctrl+Alt+J', click: c('editor.gotoDefinition') },
        { label: 'Jump to Line…', accelerator: 'Ctrl+L', click: c('editor.gotoLine') },
        { type: 'separator' },
        { label: 'Reveal in Project Navigator', accelerator: 'Ctrl+Shift+J', click: c('nav.revealCurrent') }
      ]
    },
    {
      label: 'Product',
      submenu: [
        { label: 'Run', accelerator: 'Ctrl+R', click: c('product.run') },
        { label: 'Test', accelerator: 'Ctrl+U', click: c('product.test') },
        { label: 'Build', accelerator: 'Ctrl+B', click: c('product.build') },
        { type: 'separator' },
        { label: 'Run Without Building', accelerator: 'Ctrl+Alt+R', click: c('product.runOnly') },
        { label: 'Debug', accelerator: 'Ctrl+Shift+R', click: c('product.debug') },
        { type: 'separator' },
        { label: 'Stop', accelerator: 'Ctrl+.', click: c('product.stop') },
        { type: 'separator' },
        { label: 'Clean Build Folder…', accelerator: 'Ctrl+Shift+K', click: c('product.clean') }
      ]
    },
    {
      label: 'Debug',
      submenu: [
        { label: 'Continue', accelerator: 'Ctrl+Alt+Y', click: c('debug.continue') },
        { label: 'Pause', click: c('debug.pause') },
        { type: 'separator' },
        { label: 'Step Over', accelerator: 'F6', click: c('debug.stepOver') },
        { label: 'Step Into', accelerator: 'F7', click: c('debug.stepIn') },
        { label: 'Step Out', accelerator: 'F8', click: c('debug.stepOut') },
        { type: 'separator' },
        { label: 'Toggle Breakpoint', accelerator: 'Ctrl+\\', click: c('debug.toggleBreakpoint') },
        { label: 'Deactivate Breakpoints', accelerator: 'Ctrl+Y', click: c('debug.toggleAllBreakpoints') },
        { label: 'Delete All Breakpoints', click: c('debug.deleteAllBreakpoints') }
      ]
    },
    {
      label: 'Window',
      // Electron's default Reload shortcut is Ctrl+R, which would shadow Product ▸ Run.
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'reload', accelerator: 'Ctrl+Alt+Shift+R' }]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'F-Code Help', click: c('help.main') },
        { label: 'Swift Documentation', click: () => void shell.openExternal('https://docs.swift.org/swift-book/') },
        { label: 'Swift for Windows', click: () => void shell.openExternal('https://www.swift.org/install/windows/') },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}
