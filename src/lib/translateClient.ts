import type { Lang } from '../types'

function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text)
}

function hasLatinLetters(text: string): boolean {
  return /[A-Za-zÀ-ÿ]/.test(text)
}

function isPlausible(text: string, target: Lang): boolean {
  const t = text.trim()
  if (!t) return false
  if (target === 'ru') {
    if (hasCyrillic(t)) return true
    return !hasLatinLetters(t)
  }
  if (hasLatinLetters(t)) return true
  return !hasCyrillic(t)
}

async function fromMyMemory(text: string, source: Lang, target: Lang): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', `${source}|${target}`)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`MyMemory ${res.status}`)
  const data = await res.json()
  const translated = String(data?.responseData?.translatedText ?? '').trim()
  if (!translated) throw new Error('Empty MyMemory')
  // MyMemory sometimes returns "MYMEMORY WARNING: ..."
  if (/mymemory warning/i.test(translated)) throw new Error(translated)
  return translated
}

/**
 * Instant browser-side IT↔RU translation (avoids edge IP rate limits).
 */
export async function translateClient(
  text: string,
  source: Lang,
  target: Lang,
): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed || source === target) return null

  try {
    const candidate = await fromMyMemory(trimmed, source, target)
    if (isPlausible(candidate, target)) return candidate
  } catch (err) {
    console.warn('Client translate failed:', err)
  }
  return null
}
