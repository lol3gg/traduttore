/**
 * Generates PWA home-screen icons: dual chat bubbles (IT blue + RU pink).
 * Run: npm run icons
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const BG = '#0F172A'
const BLUE = '#3B82F6'
const PINK = '#EC4899'

function appIconSvg(size, { padRatio }) {
  const pad = size * padRatio
  const s = size - pad * 2

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B1224"/>
      <stop offset="100%" stop-color="${BG}"/>
    </linearGradient>
    <linearGradient id="blue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="${BLUE}"/>
    </linearGradient>
    <linearGradient id="pink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F472B6"/>
      <stop offset="100%" stop-color="${PINK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>
  <!-- Back bubble (pink / RU) -->
  <rect x="${pad + s * 0.28}" y="${pad + s * 0.18}" width="${s * 0.58}" height="${s * 0.42}" rx="${s * 0.14}" fill="url(#pink)"/>
  <path fill="url(#pink)" d="M ${pad + s * 0.72} ${pad + s * 0.55} L ${pad + s * 0.86} ${pad + s * 0.72} L ${pad + s * 0.62} ${pad + s * 0.58} Z"/>
  <!-- Front bubble (blue / IT) -->
  <rect x="${pad + s * 0.12}" y="${pad + s * 0.38}" width="${s * 0.58}" height="${s * 0.42}" rx="${s * 0.14}" fill="url(#blue)"/>
  <path fill="url(#blue)" d="M ${pad + s * 0.28} ${pad + s * 0.75} L ${pad + s * 0.14} ${pad + s * 0.92} L ${pad + s * 0.38} ${pad + s * 0.78} Z"/>
  <!-- Dots -->
  <circle cx="${pad + s * 0.28}" cy="${pad + s * 0.59}" r="${s * 0.045}" fill="#fff" opacity="0.95"/>
  <circle cx="${pad + s * 0.41}" cy="${pad + s * 0.59}" r="${s * 0.045}" fill="#fff" opacity="0.95"/>
  <circle cx="${pad + s * 0.54}" cy="${pad + s * 0.59}" r="${s * 0.045}" fill="#fff" opacity="0.95"/>
</svg>`
}

async function writePng(name, size, padRatio) {
  const svg = Buffer.from(appIconSvg(size, { padRatio }))
  await sharp(svg).png().toFile(join(publicDir, name))
  console.log('wrote', name)
}

async function writeFavicon() {
  const svg = Buffer.from(appIconSvg(64, { padRatio: 0.08 }))
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer()
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const dir = Buffer.alloc(16)
  dir.writeUInt8(32, 0)
  dir.writeUInt8(32, 1)
  dir.writeUInt8(0, 2)
  dir.writeUInt8(0, 3)
  dir.writeUInt16LE(1, 4)
  dir.writeUInt16LE(32, 6)
  dir.writeUInt32LE(png32.length, 8)
  dir.writeUInt32LE(22, 12)
  writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat([header, dir, png32]))
  writeFileSync(join(publicDir, 'favicon.svg'), appIconSvg(128, { padRatio: 0.08 }))
  console.log('wrote favicon.ico + favicon.svg')
}

await writePng('icon-192.png', 192, 0.1)
await writePng('icon-512.png', 512, 0.1)
await writePng('icon-192-maskable.png', 192, 0.18)
await writePng('icon-512-maskable.png', 512, 0.18)
await writeFavicon()
console.log('PWA icons ready')
