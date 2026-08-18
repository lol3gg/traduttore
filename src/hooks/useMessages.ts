import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { translateClient } from '../lib/translateClient'
import type { Lang, Message } from '../types'

const MESSAGE_COLUMNS =
  'id, sender_id, original_text, original_lang, translated_text, translated_lang, image_url, created_at, read_at, edited_at, deleted_at, reply_to_id'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const PAGE_SIZE = 40
const MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const PRUNE_INTERVAL_MS = 60_000
const MIN_SEND_GAP_MS = 300

let lastSendAt = 0

function retentionCutoffIso(now = Date.now()) {
  return new Date(now - MESSAGE_RETENTION_MS).toISOString()
}

function isRetained(message: Message, now = Date.now()) {
  if (message.id.startsWith('temp-')) return true
  const created = new Date(message.created_at).getTime()
  if (Number.isNaN(created)) return true
  return now - created < MESSAGE_RETENTION_MS
}

const MESSAGE_CACHE_KEY = 'chatlook_messages_cache'

function readMessageCache(): Message[] {
  try {
    const raw = localStorage.getItem(MESSAGE_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Message[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m) => m && typeof m.id === 'string' && isRetained(m))
      .map(asMessage)
      .sort(sortMessages)
      .slice(-PAGE_SIZE)
  } catch {
    return []
  }
}

function writeMessageCache(messages: Message[]) {
  try {
    const toStore = messages
      .filter((m) => !m.id.startsWith('temp-') && isRetained(m))
      .slice(-PAGE_SIZE)
      .map(({ local_image_preview: _preview, ...rest }) => rest)
    localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(toStore))
  } catch {
    /* ignore quota */
  }
}

function asMessage(row: Message): Message {
  return {
    ...row,
    image_url: row.image_url ?? null,
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? null,
    reply_to_id: row.reply_to_id ?? null,
    delivery_status: row.delivery_status ?? 'sent',
  }
}

function sortMessages(a: Message, b: Message) {
  const byTime = a.created_at.localeCompare(b.created_at)
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
}

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>()
  for (const m of prev) map.set(m.id, m)
  for (const m of incoming) {
    const existing = map.get(m.id)
    map.set(m.id, {
      ...m,
      delivery_status: existing?.delivery_status ?? m.delivery_status ?? 'sent',
      local_image_preview: existing?.local_image_preview ?? m.local_image_preview,
    })
  }
  return [...map.values()].sort(sortMessages)
}

function extensionFromMime(mime: string) {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('heic') || mime.includes('heif')) return 'heic'
  return 'jpg'
}

const translatingIds = new Set<string>()
const translatedIds = new Set<string>()

function pathFromImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = '/chat-images/'
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0] || '') || null
}

export function useMessages(viewerId?: string | null) {
  const [messages, setMessages] = useState<Message[]>(readMessageCache)
  const [loadingMessages, setLoadingMessages] = useState(() => readMessageCache().length === 0)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const viewerIdRef = useRef(viewerId)
  viewerIdRef.current = viewerId
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages
  const loadingOlderRef = useRef(false)

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
      if (translatingIds.has(messageId) || translatedIds.has(messageId)) return
      translatingIds.add(messageId)

      const targetLang: Lang = sourceLang === 'it' ? 'ru' : 'it'

      // Browser MyMemory — fast, avoids edge IP rate limits
      void translateClient(text, sourceLang, targetLang).then(async (quick) => {
        if (!quick) return
        if (translatedIds.has(messageId)) return
        translatedIds.add(messageId)
        translatingIds.delete(messageId)
        applyTranslationLocally(messageId, quick, targetLang)
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
            if (!translatedIds.has(messageId)) translatingIds.delete(messageId)
            return
          }
          const payload = data as {
            translated_text?: string
            translated_lang?: Lang
          } | null
          if (payload?.translated_text) {
            if (translatedIds.has(messageId)) return
            translatedIds.add(messageId)
            translatingIds.delete(messageId)
            applyTranslationLocally(
              messageId,
              payload.translated_text,
              payload.translated_lang ?? targetLang,
            )
            void supabase
              .from('messages')
              .update({
                translated_text: payload.translated_text,
                translated_lang: payload.translated_lang ?? targetLang,
              })
              .eq('id', messageId)
          } else if (!translatedIds.has(messageId)) {
            translatingIds.delete(messageId)
          }
        })
        .catch((err) => {
          console.error('translate-message failed:', err)
          if (!translatedIds.has(messageId)) translatingIds.delete(messageId)
        })
    },
    [applyTranslationLocally],
  )

  const refreshLatest = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .gt('created_at', retentionCutoffIso())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      console.error('Failed to refresh messages:', error.message)
      return
    }
    if (!data) return

    const rows = (data as Message[]).map(asMessage).reverse()
    setMessages((prev) => mergeMessages(prev, rows).filter((m) => isRetained(m)))

    const me = viewerIdRef.current
    for (const m of rows) {
      if (m.deleted_at) continue
      if (!m.original_text?.trim() || m.translated_text) continue
      if (me && m.sender_id === me) continue
      requestTranslation(m.id, m.original_text, m.original_lang)
    }
  }, [requestTranslation])

  useEffect(() => {
    writeMessageCache(messages)
  }, [messages])

  useEffect(() => {
    let cancelled = false

    function translateMissing(rows: Message[]) {
      const me = viewerIdRef.current
      for (const m of rows) {
        if (m.deleted_at) continue
        if (!m.original_text?.trim() || m.translated_text) continue
        if (me && m.sender_id === me) continue
        requestTranslation(m.id, m.original_text, m.original_lang)
      }
    }

    async function fetchLatestPage(isRefresh = false) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .gt('created_at', retentionCutoffIso())
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE)

        if (cancelled) return

        if (error) {
          console.error('Failed to load messages:', error.message)
          return
        }

        const rows = (data as Message[]).map(asMessage).reverse()

        if (isRefresh) {
          setMessages((prev) => mergeMessages(prev, rows).filter((m) => isRetained(m)))
          translateMissing(rows)
        } else {
          setHasOlder((data?.length ?? 0) >= PAGE_SIZE)
          setMessages(rows)
          translateMissing(rows)
        }
      } finally {
        if (!cancelled && !isRefresh) setLoadingMessages(false)
      }
    }

    void fetchLatestPage(messagesRef.current.length > 0)
    void supabase.functions.invoke('purge-old-messages')

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const incoming = asMessage(payload.new as Message)
          if (!isRetained(incoming)) return
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
            if (!exists) return prev
            return prev.map((m) => {
              if (m.id !== updated.id) return m
              const keepFirstTranslation =
                translatedIds.has(m.id) &&
                Boolean(m.translated_text) &&
                updated.original_text === m.original_text &&
                !updated.deleted_at
              return {
                ...updated,
                translated_text: keepFirstTranslation
                  ? m.translated_text
                  : updated.translated_text,
                translated_lang: keepFirstTranslation
                  ? m.translated_lang
                  : updated.translated_lang,
                delivery_status: m.delivery_status ?? 'sent',
              }
            })
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const id = (payload.old as { id?: string } | null)?.id
          if (!id) return
          setMessages((prev) => prev.filter((m) => m.id !== id))
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && messagesRef.current.length > 0) {
          void refreshLatest()
        }
      })

    function refreshIfVisible() {
      if (document.visibilityState !== 'visible') return
      if (messagesRef.current.length === 0) return
      void refreshLatest()
    }

    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)
    window.addEventListener('online', refreshIfVisible)
    window.addEventListener('pageshow', refreshIfVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
      window.removeEventListener('online', refreshIfVisible)
      window.removeEventListener('pageshow', refreshIfVisible)
      void supabase.removeChannel(channel)
    }
  }, [requestTranslation, refreshLatest])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessages((prev) => {
        const next = prev.filter((m) => isRetained(m))
        return next.length === prev.length ? prev : next
      })
    }, PRUNE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasOlder) return 'skipped' as const
    const oldest = messagesRef.current.find((m) => !m.id.startsWith('temp-'))
    if (!oldest) return 'empty' as const

    loadingOlderRef.current = true
    setLoadingOlder(true)

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .gt('created_at', retentionCutoffIso())
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (error) {
        console.error('Failed to load older messages:', error.message)
        return 'empty' as const
      }

      const rows = (data as Message[])
        .map(asMessage)
        .reverse()
        .filter((m) => isRetained(m))
      setHasOlder((data?.length ?? 0) >= PAGE_SIZE)
      if (rows.length === 0) return 'empty' as const

      setMessages((prev) => mergeMessages(prev, rows))

      const me = viewerIdRef.current
      for (const m of rows) {
        if (m.deleted_at) continue
        if (!m.original_text?.trim() || m.translated_text) continue
        if (me && m.sender_id === me) continue
        requestTranslation(m.id, m.original_text, m.original_lang)
      }

      return 'loaded' as const
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [hasOlder, requestTranslation])

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
      replyToId?: string | null,
    ) => {
      const trimmed = text.trim()
      if (!trimmed && !imageFile) return

      const nowMs = Date.now()
      if (nowMs - lastSendAt < MIN_SEND_GAP_MS) return
      lastSendAt = nowMs

      const replyId =
        replyToId && !replyToId.startsWith('temp-') ? replyToId : null

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
        reply_to_id: replyId,
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
          reply_to_id: replyId,
        })
        .select(MESSAGE_COLUMNS)
        .single()

      if (error || !data) {
        if (error?.message?.includes('Rate limit exceeded')) {
          console.warn('Rate limit exceeded, please slow down')
        } else {
          console.error('Failed to send message:', error?.message)
        }
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
      translatedIds.delete(message.id)
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

    if (message.image_url) {
      const path = pathFromImageUrl(message.image_url)
      if (path) {
        try {
          const { error: storageError } = await supabase.storage
            .from('chat-images')
            .remove([path])
          if (storageError) {
            console.error('Failed to delete chat image:', storageError.message)
          }
        } catch (err) {
          console.error('Failed to delete chat image:', err)
        }
      }
    }

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
          reply_to_id: failed.reply_to_id,
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
    loadOlder,
    hasOlder,
    loadingOlder,
    refreshLatest,
  }
}
