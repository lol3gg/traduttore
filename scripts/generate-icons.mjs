/**
 * Rasterize premium Traduttore icons for PWA / home screen.
 * Run: node scripts/generate-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const svgPath = path.join(publicDir, 'icon.svg')
const svg = fs.readFileSync(svgPath)

async function writePng(name, size, { maskable = false } = {}) {
  const out = path.join(publicDir, name)

  if (!maskable) {
    await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
    return
  }

  // Safe zone ~20% for Android adaptive icons
  const pad = Math.round(size * 0.12)
  const inner = size - pad * 2
  const icon = await sharp(svg).resize(inner, inner).png().toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 5, g: 7, b: 13, alpha: 1 },
    },
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png({ compressionLevel: 9 })
    .toFile(out)
}

async function writeIco() {
  // Multi-size ICO via PNG pack (browsers accept PNG-in-ICO well enough;
  // also keep a crisp 32/48 favicon.png-style 32px as favicon.ico content)
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer()
  // sharp doesn't write ico natively; write 32png as favicon fallback and
  // also overwrite favicon.ico with a simple 32x32 PNG renamed — many hosts
  // serve image/x-icon incorrectly. Better: write 48png and use png-to-ico if available.
  try {
    const pngToIco = (await import('png-to-ico')).default
    const buf = await pngToIco([
      await sharp(svg).resize(16, 16).png().toBuffer(),
      png32,
      await sharp(svg).resize(48, 48).png().toBuffer(),
    ])
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buf)
  } catch {
    // Fallback: copy 32px png bytes (Chrome accepts PNG favicons via link; ico optional)
    fs.writeFileSync(path.join(publicDir, 'favicon-32.png'), png32)
    await sharp(svg).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.ico'))
  }
}

await writePng('icon-192.png', 192)
await writePng('icon-512.png', 512)
await writePng('icon-192-maskable.png', 192, { maskable: true })
await writePng('icon-512-maskable.png', 512, { maskable: true })
await writeIco()

console.log('Icons generated in public/')
