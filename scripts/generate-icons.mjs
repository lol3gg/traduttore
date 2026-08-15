/**
 * Generates placeholder PWA icons (chat bubble on #0F172A).
 * Run: node scripts/generate-icons.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const BG = '#0F172A'
const BUBBLE = '#3B82F6'
const ACCENT = '#EC4899'

function chatBubbleSvg(size, { padRatio }) {
  const pad = size * padRatio
  const inner = size - pad * 2
  const x = pad
  const y = pad * 0.9
  const w = inner
  const h = inner * 0.72
  const r = Math.max(8, inner * 0.18)
  const tipX = x + w * 0.22
  const tipY = y + h

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BUBBLE}"/>
      <stop offset="100%" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>
  <path fill="url(#g)" d="
    M ${x + r} ${y}
    H ${x + w - r}
    Q ${x + w} ${y} ${x + w} ${y + r}
    V ${y + h - r}
    Q ${x + w} ${y + h} ${x + w - r} ${y + h}
    H ${tipX + inner * 0.18}
    L ${tipX} ${tipY + inner * 0.14}
    L ${tipX + inner * 0.02} ${y + h}
    H ${x + r}
    Q ${x} ${y + h} ${x} ${y + h - r}
    V ${y + r}
    Q ${x} ${y} ${x + r} ${y}
    Z
  "/>
  <circle cx="${x + w * 0.32}" cy="${y + h * 0.48}" r="${inner * 0.055}" fill="#fff" opacity="0.95"/>
  <circle cx="${x + w * 0.5}" cy="${y + h * 0.48}" r="${inner * 0.055}" fill="#fff" opacity="0.95"/>
  <circle cx="${x + w * 0.68}" cy="${y + h * 0.48}" r="${inner * 0.055}" fill="#fff" opacity="0.95"/>
</svg>`
}

async function writePng(name, size, padRatio) {
  const svg = Buffer.from(chatBubbleSvg(size, { padRatio }))
  const out = join(publicDir, name)
  await sharp(svg).png().toFile(out)
  console.log('wrote', name)
}

async function writeFavicon() {
  const svg = Buffer.from(chatBubbleSvg(64, { padRatio: 0.14 }))
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer()
  // Minimal ICO: embed PNG (Vista+ style)
  const ico = pngToIco(png32)
  writeFileSync(join(publicDir, 'favicon.ico'), ico)
  console.log('wrote favicon.ico')
}

function pngToIco(pngBuffer) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // ICO type
  header.writeUInt16LE(1, 4) // image count

  const dir = Buffer.alloc(16)
  dir.writeUInt8(32, 0) // width
  dir.writeUInt8(32, 1) // height
  dir.writeUInt8(0, 2) // colors
  dir.writeUInt8(0, 3) // reserved
  dir.writeUInt16LE(1, 4) // planes
  dir.writeUInt16LE(32, 6) // bit count
  dir.writeUInt32LE(pngBuffer.length, 8)
  dir.writeUInt32LE(6 + 16, 12) // offset

  return Buffer.concat([header, dir, pngBuffer])
}

await writePng('icon-192.png', 192, 0.14)
await writePng('icon-512.png', 512, 0.14)
await writePng('icon-192-maskable.png', 192, 0.22)
await writePng('icon-512-maskable.png', 512, 0.22)
await writeFavicon()
console.log('PWA icons ready in public/')
