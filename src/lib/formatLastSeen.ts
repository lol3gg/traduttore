import { translations, type AppLang } from '../i18n/translations'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDayMonth(date: Date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatLastSeen(lastSeen: string, lang: AppLang): string {
  const t = translations[lang]
  const seen = new Date(lastSeen)
  const now = new Date()
  const diffMs = now.getTime() - seen.getTime()

  if (diffMs < 5 * 60 * 1000) {
    return t.justNow
  }

  const today = startOfDay(now)
  const seenDay = startOfDay(seen)
  const dayDiff = Math.round((today.getTime() - seenDay.getTime()) / (24 * 60 * 60 * 1000))

  if (dayDiff === 0) {
    return `${t.lastSeen} ${t.lastSeenAt} ${formatTime(seen)}`
  }

  if (dayDiff === 1) {
    return `${t.lastSeen} ${t.yesterday} ${t.lastSeenAt} ${formatTime(seen)}`
  }

  return `${t.lastSeen} ${lang === 'it' ? 'il' : ''} ${formatDayMonth(seen)}`.replace(/\s+/g, ' ').trim()
}
