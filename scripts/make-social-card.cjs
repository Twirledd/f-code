// Renders scripts/social-card.html to assets/social/f-code-x-card.png (1080 x 1350).
// Run: node_modules/.bin/electron scripts/make-social-card.cjs
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

const out = join(__dirname, '..', 'assets', 'social', 'f-code-x-card.png')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1080, height: 1350, useContentSize: true, show: false, webPreferences: { offscreen: false } })
  await win.loadFile(join(__dirname, 'social-card.html'))
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))')
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1080, height: 1350 })
  const size = img.getSize()
  mkdirSync(join(__dirname, '..', 'assets', 'social'), { recursive: true })
  writeFileSync(out, img.toPNG())
  console.log(`wrote ${out} (${size.width}x${size.height})`)
  app.quit()
})
