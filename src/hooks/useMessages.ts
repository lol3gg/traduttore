import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Lang, Message } from '../types'

const MESSAGE_COLUMNS =
  'id, sender_id, original_text, original_lang, translated_text, translated_lang, image_url, created_at, read_at'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function asMessage(row: Message): Message {
  return {
    ...row,
    image_url: row.image_url ?? null,
    delivery_status: row.delivery_status ?? 'sent',
  }
}

function extensionFromMime(mime: string) {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('heic') || mime.includes('heif')) return 'heic'
  return 'jpg'
}

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchMessages() {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .order('created_at', { ascending: true })

        if (cancelled) return

        if (error) {
          console.error('Failed to load messages:', error.message)
        } else if (data) {
          setMessages((data as Message[]).map(asMessage))
        }
      } finally {
        if (!cancelled) setLoadingMessages(false)
      }
    }

    void fetchMessages()

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const incoming = asMessage(payload.new as Message)
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) {
              return prev.map((m) =>
                m.id === incoming.id ? { ...incoming, delivery_status: 'sent' } : m,
              )
            }
            const withoutOptimistic = prev.filter(
              (m) =>
                !(
                  m.id.startsWith('temp-') &&
                  m.sender_id === incoming.sender_id &&
                  m.original_text === incoming.original_text &&
                  (m.image_url ?? null) === (incoming.image_url ?? null)
                ),
            )
            return [...withoutOptimistic, incoming]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updated = asMessage(payload.new as Message)
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === updated.id)
            if (!exists) return [...prev, updated]
            return prev.map((m) =>
              m.id === updated.id
                ? { ...updated, delivery_status: m.delivery_status ?? 'sent' }
                : m,
            )
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [])

  const applyTranslationLocally = useCallback(
    (messageId: string, translatedText: string, translatedLang: Lang) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                translated_text: translatedText,
                translated_lang: translatedLang,
              }
            : m,
        ),
      )
    },
    [],
  )

  const invokeSideEffects = useCallback(
    (
      messageId: string,
      text: string,
      senderLang: Lang,
      recipientId: string,
      senderName: string,
    ) => {
      const targetLang: Lang = senderLang === 'it' ? 'ru' : 'it'
      const preview = text.trim() || '📷'

      if (text.trim()) {
        void supabase.functions
          .invoke('translate-message', {
            body: {
              message_id: messageId,
              text,
              source_lang: senderLang,
              target_lang: targetLang,
            },
          })
          .then(({ data, error }) => {
            if (error) {
              console.error('translate-message failed:', error.message)
              return
            }
            const payload = data as {
              translated_text?: string
              translated_lang?: Lang
            } | null
            if (payload?.translated_text) {
              applyTranslationLocally(
                messageId,
                payload.translated_text,
                payload.translated_lang ?? targetLang,
              )
            }
          })
          .catch((err) => {
            console.error('translate-message failed:', err)
          })
      }

      void supabase.functions
        .invoke('send-notification', {
          body: {
            message_id: messageId,
            recipient_id: recipientId,
            text_preview: preview,
            sender_name: senderName,
          },
        })
        .then(({ error }) => {
          if (error) console.error('send-notification failed:', error.message)
        })
        .catch((err) => {
          console.error('send-notification failed:', err)
        })
    },
    [applyTranslationLocally],
  )

  const sendMessage = useCallback(
    async (
      text: string,
      senderId: string,
      senderLang: Lang,
      recipientId: string,
      senderName: string,
      imageFile?: File | null,
    ) => {
      const trimmed = text.trim()
      if (!trimmed && !imageFile) return

      let localPreview: string | null = null
      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_BYTES) {
          console.error('Image too large')
          return
        }
        localPreview = URL.createObjectURL(imageFile)
      }

      const tempId = `temp-${crypto.randomUUID()}`
      const optimistic: Message = {
        id: tempId,
        sender_id: senderId,
        original_text: trimmed,
        original_lang: senderLang,
        translated_text: null,
        translated_lang: null,
        image_url: null,
        created_at: new Date().toISOString(),
        read_at: null,
        delivery_status: 'pending',
        local_image_preview: localPreview,
      }

      setMessages((prev) => [...prev, optimistic])

      let imageUrl: string | null = null

      if (imageFile) {
        const ext = extensionFromMime(imageFile.type || 'image/jpeg')
        const path = `${senderId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(path, imageFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: imageFile.type || 'image/jpeg',
          })

        if (uploadError) {
          console.error('Image upload failed:', uploadError.message)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId ? { ...m, delivery_status: 'failed' } : m,
            ),
          )
          return
        }

        const { data: publicData } = supabase.storage
          .from('chat-images')
          .getPublicUrl(path)
        imageUrl = publicData.publicUrl
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: senderId,
          original_text: trimmed,
          original_lang: senderLang,
          translated_text: null,
          translated_lang: null,
          image_url: imageUrl,
        })
        .select(MESSAGE_COLUMNS)
        .single()

      if (error || !data) {
        console.error('Failed to send message:', error?.message)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, delivery_status: 'failed' } : m,
          ),
        )
        return
      }

      const saved = asMessage(data as Message)
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId)
        if (localPreview) URL.revokeObjectURL(localPreview)
        if (withoutTemp.some((m) => m.id === saved.id)) {
          return withoutTemp.map((m) =>
            m.id === saved.id ? { ...saved, delivery_status: 'sent' } : m,
          )
        }
        return [...withoutTemp, { ...saved, delivery_status: 'sent' }]
      })

      invokeSideEffects(saved.id, trimmed, senderLang, recipientId, senderName)
    },
    [invokeSideEffects],
  )

  const retryMessage = useCallback(
    async (failed: Message, recipientId: string, senderName: string) => {
      if (failed.delivery_status !== 'failed') return

      setMessages((prev) =>
        prev.map((m) =>
          m.id === failed.id ? { ...m, delivery_status: 'pending' } : m,
        ),
      )

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: failed.sender_id,
          original_text: failed.original_text,
          original_lang: failed.original_lang,
          translated_text: null,
          translated_lang: null,
          image_url: failed.image_url,
        })
        .select(MESSAGE_COLUMNS)
        .single()

      if (error || !data) {
        console.error('Retry failed:', error?.message)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === failed.id ? { ...m, delivery_status: 'failed' } : m,
          ),
        )
        return
      }

      const saved = asMessage(data as Message)
      setMessages((prev) => {
        const withoutFailed = prev.filter((m) => m.id !== failed.id)
        if (withoutFailed.some((m) => m.id === saved.id)) {
          return withoutFailed.map((m) =>
            m.id === saved.id ? { ...saved, delivery_status: 'sent' } : m,
          )
        }
        return [...withoutFailed, { ...saved, delivery_status: 'sent' }]
      })

      invokeSideEffects(
        saved.id,
        failed.original_text,
        failed.original_lang,
        recipientId,
        senderName,
      )
    },
    [invokeSideEffects],
  )

  return { messages, sendMessage, retryMessage, loadingMessages }
}
