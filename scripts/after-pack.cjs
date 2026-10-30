// electron-builder afterPack hook: stamp the icon and version strings into F-Code.exe.
// We run with `signAndEditExecutable: false` (its winCodeSign bundle can't be extracted
// without symlink privileges), so the resource edit is done here with the rcedit package.
const { join } = require('path')
const { rcedit } = require('rcedit')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const pkg = require(join(context.packager.projectDir, 'package.json'))
  await rcedit(exe, {
    icon: join(context.packager.projectDir, 'build', 'icon.ico'),
    'file-version': pkg.version,
    'product-version': pkg.version,
    'version-string': {
      ProductName: 'F-Code',
      FileDescription: 'F-Code',
      CompanyName: pkg.author,
      LegalCopyright: `© ${new Date().getFullYear()} ${pkg.author}`,
      OriginalFilename: 'F-Code.exe'
    }
  })
}
