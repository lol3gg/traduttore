import type { Message } from '../types'

export function messageQuoteText(
  message: Message,
  viewerId: string,
  photoLabel: string,
  deletedLabel: string,
): string {
  if (message.deleted_at) return deletedLabel
  const raw =
    message.sender_id === viewerId
      ? message.original_text
      : (message.translated_text ?? message.original_text)
  const trimmed = raw?.trim()
  if (trimmed) return trimmed
  if (message.image_url || message.local_image_preview) return photoLabel
  return photoLabel
}
