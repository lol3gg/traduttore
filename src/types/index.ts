export type Lang = 'it' | 'ru'

export interface Profile {
  id: string
  name: string
  lang: Lang
  theme_color: string
  is_online: boolean
  is_typing: boolean
  last_seen: string
  onesignal_player_id?: string | null
}

/** Client-only delivery status for optimistic UI */
export type MessageDeliveryStatus = 'pending' | 'sent' | 'failed'

export interface Message {
  id: string
  sender_id: string
  original_text: string
  original_lang: Lang
  translated_text: string | null
  translated_lang: Lang | null
  image_url: string | null
  created_at: string
  read_at: string | null
  /** Present only for optimistic / failed local rows */
  delivery_status?: MessageDeliveryStatus
  /** Local blob preview before upload finishes */
  local_image_preview?: string | null
}
