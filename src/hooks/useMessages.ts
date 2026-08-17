import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { translateClient } from '../lib/translateClient'
import type { Lang, Message } from '../types'

const MESSAGE_COLUMNS =
  'id, sender_id, original_text, original_lang, translated_text, translated_lang, image_url, created_at, read_at, edited_at, deleted_at'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function asMessage(row: Message): Message {
  return {
    ...row,
    image_url: row.image_url ?? null,
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? null,
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

const translatingIds = new Set<string>()

export function useMessages(viewerId?: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const viewerIdRef = useRef(viewerId)
  viewerIdRef.current = viewerId

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

  const requestTranslation = useCallback(
    (messageId: string, text: string, sourceLang: Lang) => {
      if (!text.trim() || messageId.startsWith('temp-')) return
      if (translatingIds.has(messageId)) return
      translatingIds.add(messageId)

      const targetLang: Lang = sourceLang === 'it' ? 'ru' : 'it'
      let finished = false

      const finish = (translated: string, lang: Lang) => {
        if (finished) {
          applyTranslationLocally(messageId, translated, lang)
          return
        }
        finished = true
        translatingIds.delete(messageId)
        applyTranslationLocally(messageId, translated, lang)
      }

      // Browser MyMemory — fast, avoids edge IP rate limits
      void translateClient(text, sourceLang, targetLang).then(async (quick) => {
        if (!quick) return
        finish(quick, targetLang)
        await supabase
          .from('messages')
          .update({ translated_text: quick, translated_lang: targetLang })
          .eq('id', messageId)
      })

      // Edge race (MyMemory/Google/DeepL) as backup / second writer
      void supabase.functions
        .invoke('translate-message', {
          body: {
            message_id: messageId,
            text,
            source_lang: sourceLang,
            target_lang: targetLang,
          },
        })
        .then(({ data, error }) => {
          if (error) {
            console.error('translate-message failed:', error.message)
            if (!finished) translatingIds.delete(messageId)
            return
          }
          const payload = data as {
            translated_text?: string
            translated_lang?: Lang
          } | null
          if (payload?.translated_text) {
            finish(
              payload.translated_text,
              payload.translated_lang ?? targetLang,
            )
          } else if (!finished) {
            translatingIds.delete(messageId)
          }
        })
        .catch((err) => {
          console.error('translate-message failed:', err)
          if (!finished) translatingIds.delete(messageId)
        })
    },
    [applyTranslationLocally],
  )

  useEffect(() => {
    let cancelled = false

    async function fetchMessages(isRefresh = false) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .order('created_at', { ascending: true })

        if (cancelled) return

        if (error) {
          console.error('Failed to load messages:', error.message)
        } else if (data) {
          const rows = (data as Message[]).map(asMessage)
          setMessages(rows)

          // Catch untranslated messages (e.g. after failed/slow prior invoke)
          const me = viewerIdRef.current
          for (const m of rows) {
            if (m.deleted_at) continue
            if (!m.original_text?.trim() || m.translated_text) continue
            if (me && m.sender_id === me) continue
            requestTranslation(m.id, m.original_text, m.original_lang)
          }
        }
      } finally {
        if (!cancelled && !isRefresh) setLoadingMessages(false)
      }
    }

    void fetchMessages(false)

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

          // Recipient also kicks translation immediately (don't wait only on sender)
          const me = viewerIdRef.current
          if (
            incoming.original_text?.trim() &&
            !incoming.translated_text &&
            !incoming.deleted_at &&
            (!me || incoming.sender_id !== me)
          ) {
            requestTranslation(
              incoming.id,
              incoming.original_text,
              incoming.original_lang,
            )
          }
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchMessages(true)
        }
      })

    function refreshIfVisible() {
      if (document.visibilityState === 'visible') {
        void fetchMessages(true)
      }
    }

    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)
    window.addEventListener('online', refreshIfVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
      window.removeEventListener('online', refreshIfVisible)
      void supabase.removeChannel(channel)
    }
  }, [requestTranslation])

  const invokeSideEffects = useCallback(
    (
      messageId: string,
      text: string,
      senderLang: Lang,
      recipientId: string,
      senderName: string,
    ) => {
      const preview = text.trim() || '📷'

      if (text.trim()) {
        requestTranslation(messageId, text, senderLang)
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
    [requestTranslation],
  )

  const markMessagesRead = useCallback(async (readerId: string) => {
    const now = new Date().toISOString()

    setMessages((prev) =>
      prev.map((m) =>
        m.sender_id !== readerId && !m.read_at ? { ...m, read_at: now } : m,
      ),
    )

    const { error } = await supabase
      .from('messages')
      .update({ read_at: now })
      .neq('sender_id', readerId)
      .is('read_at', null)

    if (error) {
      console.error('Failed to mark messages read:', error.message)
    }
  }, [])

  const unreadCount = useCallback(
    (readerId: string) =>
      messages.filter(
        (m) =>
          !m.id.startsWith('temp-') &&
          m.sender_id !== readerId &&
          !m.read_at &&
          !m.deleted_at,
      ).length,
    [messages],
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
        edited_at: null,
        deleted_at: null,
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

  const editMessage = useCallback(
    async (message: Message, nextText: string) => {
      const trimmed = nextText.trim()
      if (!trimmed || message.id.startsWith('temp-') || message.deleted_at) return
      if (trimmed === message.original_text) return

      const now = new Date().toISOString()
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                original_text: trimmed,
                translated_text: null,
                translated_lang: null,
                edited_at: now,
              }
            : m,
        ),
      )

      const { error } = await supabase
        .from('messages')
        .update({
          original_text: trimmed,
          translated_text: null,
          translated_lang: null,
          edited_at: now,
        })
        .eq('id', message.id)

      if (error) {
        console.error('Failed to edit message:', error.message)
        return
      }

      translatingIds.delete(message.id)
      requestTranslation(message.id, trimmed, message.original_lang)
    },
    [requestTranslation],
  )

  const deleteMessage = useCallback(async (message: Message) => {
    if (message.id.startsWith('temp-')) {
      setMessages((prev) => prev.filter((m) => m.id !== message.id))
      return
    }

    const now = new Date().toISOString()
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              deleted_at: now,
              original_text: '',
              translated_text: null,
              image_url: null,
            }
          : m,
      ),
    )

    const { error } = await supabase
      .from('messages')
      .update({
        deleted_at: now,
        original_text: '',
        translated_text: null,
        translated_lang: null,
        image_url: null,
      })
      .eq('id', message.id)

    if (error) {
      console.error('Failed to delete message:', error.message)
    }
  }, [])

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

  return {
    messages,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
    loadingMessages,
    markMessagesRead,
    unreadCount,
  }
}
