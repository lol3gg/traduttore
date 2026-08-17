import type { Message } from '../types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatStamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '??/??/???? ??:??'
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function exportChatAsText(
  messages: Message[],
  profiles: { id: string; name: string }[],
): string {
  const names = new Map(profiles.map((p) => [p.id, p.name]))
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))

  return sorted
    .map((message) => {
      const name = names.get(message.sender_id) ?? 'Unknown'
      const stamp = formatStamp(message.created_at)

      if (message.deleted_at) {
        return `[${stamp}] ${name}: [messaggio eliminato]`
      }

      const parts: string[] = []
      if (message.image_url) {
        parts.push(`[foto] ${message.image_url}`)
      }
      const original = message.original_text?.trim()
      if (original) {
        const translated = message.translated_text?.trim()
        if (translated && translated !== original) {
          parts.push(`${original} (→ ${translated})`)
        } else {
          parts.push(original)
        }
      }

      return `[${stamp}] ${name}: ${parts.join(' ') || '—'}`
    })
    .join('\n')
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
