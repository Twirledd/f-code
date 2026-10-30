// Regenerates every raster brand asset from assets/brand/*.svg (needs only Electron):
//   node_modules/.bin/electron scripts/make-brand.cjs
// Writes build/icon.png, build/icon.ico, src/renderer/src/assets/icon.png and assets/brand/*.png.
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const brand = path.join(root, 'assets', 'brand')
const fontDir = path.join(root, 'src', 'renderer', 'src', 'assets', 'fonts')
const url = (p) => 'file:///' + p.split(path.sep).join('/')

app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

async function render(html, w, h) {
  const tmp = path.join(brand, `.render-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(tmp, html)
  const win = new BrowserWindow({ width: w, height: h, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(tmp)
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await new Promise((r) => setTimeout(r, 300))
  const png = (await win.webContents.capturePage()).toPNG()
  win.destroy()
  fs.unlinkSync(tmp)
  return png
}
const img = (svg, size) => `<html><body style="margin:0;background:transparent"><img src="${url(path.join(brand, svg))}" width="${size}" height="${size}"></body></html>`

function ico(pngs) {
  // PNG-compressed ICO: ICONDIR + ICONDIRENTRY[] + image data.
  const head = Buffer.alloc(6)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([head, ...entries, ...pngs.map((p) => p.data)])
}

function wordmark(variant) {
  const dark = variant === 'dark'
  const letters = dark ? '#102333' : '#E8EEF9'
  const bg = dark ? '#ffffff' : '#03050B'
  return `<html><head><style>
@font-face{font-family:Bricolage;src:url("${url(path.join(fontDir, 'BricolageGrotesque-Bold.ttf'))}");font-weight:700}
body{margin:0;width:1600px;height:480px;background:${bg};display:flex;align-items:center;justify-content:center;gap:56px}
img{width:300px;height:300px}
span{font:700 220px/1 Bricolage;letter-spacing:-0.03em;color:${letters}}
</style></head><body><img src="${url(path.join(brand, dark ? 'f-code-mark-dark.svg' : 'f-code-mark-light.svg'))}"><span>F-Code</span></body></html>`
}

app.whenReady().then(async () => {
  // Tiny windows never paint offscreen, so render once at 1024 and downscale.
  const big = await render(img('f-code-icon.svg', 1024), 1024, 1024)
  const rendered = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
    size,
    data: nativeImage.createFromBuffer(big).resize({ width: size, height: size, quality: 'best' }).toPNG()
  }))
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico(rendered))
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), big)
  fs.writeFileSync(path.join(root, 'src', 'renderer', 'src', 'assets', 'icon.png'), rendered.find((r) => r.size === 256).data)
  fs.writeFileSync(path.join(brand, 'f-code-icon-1024.png'), fs.readFileSync(path.join(root, 'build', 'icon.png')))
  fs.writeFileSync(path.join(brand, 'f-code-logo-light.png'), await render(wordmark('light'), 1600, 480))
  fs.writeFileSync(path.join(brand, 'f-code-logo-dark.png'), await render(wordmark('dark'), 1600, 480))
  app.quit()
})
