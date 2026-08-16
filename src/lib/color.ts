/** Lighten or darken a hex color by a fraction (−1…1). */
export function adjustHex(hex: string, amount: number): string {
  const raw = hex.replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw

  const num = Number.parseInt(full, 16)
  if (Number.isNaN(num)) return hex

  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))

  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff

  const next = (channel: number) =>
    amount >= 0
      ? channel + (255 - channel) * amount
      : channel * (1 + amount)

  const rr = clamp(next(r))
  const gg = clamp(next(g))
  const bb = clamp(next(b))

  return `#${((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1)}`
}

/** Two gradient stops from a base theme color. */
export function themeGradient(hex: string): { from: string; to: string } {
  return {
    from: adjustHex(hex, 0.16),
    to: adjustHex(hex, -0.14),
  }
}
