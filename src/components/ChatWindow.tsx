import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type UIEvent,
} from 'react'
import { Camera, Check, ImagePlus, Images, LogOut, Send, X } from 'lucide-react'
import { useProfile } from '../context/ProfileContext'
import { useMessages } from '../hooks/useMessages'
import { usePresence } from '../hooks/usePresence'
import { useTyping } from '../hooks/useTyping'
import { useReactions } from '../hooks/useReactions'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import { clearUnreadBadge, setUnreadBadge } from '../lib/appBadge'
import { playSoftChime } from '../lib/softChime'
import { supabase } from '../lib/supabase'
import { translations } from '../i18n/translations'
import { messageQuoteText } from '../lib/messageQuote'
import type { Message, Profile } from '../types'
import { Avatar } from './Avatar'
import { MessageBubble } from './MessageBubble'
import { ConnectionBanner } from './ConnectionBanner'
import { InstallAppButton } from './InstallAppButton'
import { OnlineStatus } from './OnlineStatus'
import { ThemeToggle } from './ThemeToggle'

async function syncBadgeWithServiceWorker(count: number) {
  try {
    const reg = await navigator.serviceWorker?.ready
    reg?.active?.postMessage(
      count > 0 ? { type: 'set-badge', count } : { type: 'clear-badge' },
    )
  } catch {
    /* ignore */
  }
}

function MessageSkeleton() {
  return (
    <div className="space-y-4 px-1 py-2" aria-hidden="true">
      <div className="flex justify-start">
        <div className="h-12 w-[55%] animate-pulse rounded-[1.4rem] rounded-bl-md bg-[var(--hover)]" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-[42%] animate-pulse rounded-[1.4rem] rounded-br-md bg-[var(--hover)]" />
      </div>
      <div className="flex justify-start">
        <div className="h-14 w-[62%] animate-pulse rounded-[1.4rem] rounded-bl-md bg-[var(--hover)]" />
      </div>
    </div>
  )
}

export function ChatWindow() {
  const { profile, setProfile } = useProfile()
  const {
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
  } = useMessages(profile?.id)
  useKeyboardInset()
  const { isOnline, lastSeenOf } = usePresence(profile)
  const { typingStatus, notifyTyping, clearTypingFor } = useTyping(profile)
  const { reactionsByMessage, toggleReaction } = useReactions()
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null)
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState<Message | null>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false)
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(() => new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const seededIdsRef = useRef(false)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const wasOtherOnlineRef = useRef(false)
  const profileIdRef = useRef(profile?.id)
  const stickToBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)
  const olderPinRef = useRef<{ height: number; top: number } | null>(null)
  profileIdRef.current = profile?.id

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || loadingMessages) return

    const pin = olderPinRef.current
    if (pin) {
      el.scrollTop = el.scrollHeight - pin.height + pin.top
      olderPinRef.current = null
      return
    }

    if (!didInitialScrollRef.current) {
      if (messages.length === 0) return
      el.scrollTop = el.scrollHeight
      didInitialScrollRef.current = true
      stickToBottomRef.current = true
      return
    }

    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, loadingMessages, imagePreview])

  useEffect(() => {
    const viewport = window.visualViewport
    function keepComposerVisible() {
      if (!stickToBottomRef.current) return
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    viewport?.addEventListener('resize', keepComposerVisible)
    return () => viewport?.removeEventListener('resize', keepComposerVisible)
  }, [])

  // Soft chime + open from notification without reloading the app
  useEffect(() => {
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'soft-chime') {
        playSoftChime()
        return
      }
      if (event.data?.type === 'open-from-notification') {
        stickToBottomRef.current = true
        didInitialScrollRef.current = true
        void refreshLatest()
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }, [refreshLatest])

  // Mark read + clear home-screen badge while chat is open/visible
  useEffect(() => {
    if (!profile || loadingMessages) return

    function syncReadState() {
      if (document.visibilityState !== 'visible') return
      void markMessagesRead(profile!.id)
      void clearUnreadBadge()
      void syncBadgeWithServiceWorker(0)
    }

    syncReadState()
    document.addEventListener('visibilitychange', syncReadState)
    window.addEventListener('focus', syncReadState)
    return () => {
      document.removeEventListener('visibilitychange', syncReadState)
      window.removeEventListener('focus', syncReadState)
    }
  }, [profile, loadingMessages, markMessagesRead, messages.length])

  // When app is backgrounded, keep badge count in sync
  useEffect(() => {
    if (!profile) return

    function onHide() {
      if (document.visibilityState === 'visible') return
      const count = unreadCount(profile!.id)
      void setUnreadBadge(count)
      void syncBadgeWithServiceWorker(count)
    }

    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [profile, unreadCount, messages])

  useEffect(() => {
    if (loadingMessages) return

    if (!seededIdsRef.current) {
      knownIdsRef.current = new Set(messages.map((m) => m.id))
      seededIdsRef.current = true
      return
    }

    const fresh: string[] = []
    for (const m of messages) {
      if (m.id.startsWith('temp-')) continue
      if (!knownIdsRef.current.has(m.id)) {
        knownIdsRef.current.add(m.id)
        fresh.push(m.id)
      }
    }

    if (fresh.length === 0) return

    const me = profileIdRef.current
    const incomingFromOther = fresh.some((id) => {
      const msg = messages.find((m) => m.id === id)
      return msg && me && msg.sender_id !== me
    })

    // App aperta → solo suono soft (no banner: gestito dal SW se push arriva)
    if (incomingFromOther && document.visibilityState === 'visible') {
      playSoftChime()
      void markMessagesRead(me!)
      void clearUnreadBadge()
      void syncBadgeWithServiceWorker(0)
    }

    setNewMessageIds((prev) => {
      const next = new Set(prev)
      for (const id of fresh) next.add(id)
      return next
    })
  }, [messages, loadingMessages, markMessagesRead])

  useEffect(() => {
    if (!profile) return

    let cancelled = false

    async function fetchOther() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, lang, theme_color, is_online, is_typing, last_seen')
        .neq('id', profile!.id)
        .maybeSingle()

      if (cancelled || error || !data) return
      setOtherProfile(data as Profile)
    }

    void fetchOther()

    const channel = supabase
      .channel(`other-profile-updates:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as Profile
          if (updated.id === profile.id) return
          setOtherProfile(updated)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void fetchOther()
      })

    function refreshIfVisible() {
      if (document.visibilityState === 'visible') void fetchOther()
    }

    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
      void supabase.removeChannel(channel)
    }
  }, [profile?.id])

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const otherOnline = otherProfile ? isOnline(otherProfile.id) : false
  const otherTyping = otherProfile ? Boolean(typingStatus[otherProfile.id]) : false
  const otherLastSeen = otherProfile
    ? lastSeenOf(otherProfile.id) ?? otherProfile.last_seen
    : ''

  useEffect(() => {
    if (!otherProfile) return

    if (wasOtherOnlineRef.current && !otherOnline) {
      clearTypingFor(otherProfile.id)
    }
    wasOtherOnlineRef.current = otherOnline
  }, [otherOnline, otherProfile, clearTypingFor])

  if (!profile) return null

  const t = translations[profile.lang]
  const canSend = editing
    ? Boolean(text.trim() && !sending)
    : Boolean((text.trim() || imageFile) && otherProfile && !sending)

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  async function handleSend() {
    if (!profile || sending) return

    if (editing) {
      if (!text.trim()) return
      setSending(true)
      const value = text
      const target = editing
      setText('')
      setEditing(null)
      await editMessage(target, value)
      setSending(false)
      return
    }

    if (!otherProfile || (!text.trim() && !imageFile)) return

    setSending(true)
    const value = text
    const file = imageFile
    setText('')
    clearImage()
    const replyId = replyingTo?.id ?? null
    setReplyingTo(null)
    await sendMessage(value, profile.id, profile.lang, otherProfile.id, profile.name, file, replyId)
    setSending(false)
  }

  function handleRetry(message: Message) {
    if (!otherProfile || !profile) return
    void retryMessage(message, otherProfile.id, profile.name)
  }

  function handleStartEdit(message: Message) {
    if (!message.original_text?.trim()) return
    setReplyingTo(null)
    setEditing(message)
    setText(message.original_text)
    clearImage()
  }

  function handleStartReply(message: Message) {
    if (editing) {
      setEditing(null)
      setText('')
    }
    setReplyingTo(message)
    stickToBottomRef.current = true
    window.setTimeout(() => {
      composerRef.current?.focus()
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 50)
  }

  function handleJumpToMessage(messageId: string) {
    const el = scrollRef.current?.querySelector(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    )
    if (!(el instanceof HTMLElement)) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(messageId)
    window.setTimeout(() => {
      setHighlightId((current) => (current === messageId ? null : current))
    }, 1400)
  }

  function handleCancelEdit() {
    setEditing(null)
    setText('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void handleSend()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    notifyTyping()
  }

  function handleChatScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 96

    if (!hasOlder || loadingOlder || el.scrollTop > 64) return

    olderPinRef.current = { height: el.scrollHeight, top: el.scrollTop }
    void loadOlder().then((result) => {
      if (result === 'empty') olderPinRef.current = null
    })
  }

  function handlePickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type && !file.type.startsWith('image/')) return

    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setPhotoSourceOpen(false)
    e.target.value = ''
  }

  return (
    <div
      className="box-border flex h-[100dvh] max-h-[100dvh] max-w-[100vw] flex-col overflow-hidden text-[var(--text)]"
      style={{
        paddingBottom:
          'max(var(--keyboard-inset, 0px), env(keyboard-inset-bottom, 0px))',
      }}
    >
      <div
        ref={scrollRef}
        className="chat-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        onScroll={handleChatScroll}
      >
        <div className="sticky top-0 z-10">
        <header className="header-shell safe-top flex flex-nowrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          {otherProfile ? (
            <>
              <Avatar
                name={otherProfile.name}
                themeColor={otherProfile.theme_color}
                size="md"
                isOnline={otherOnline}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-[16px] font-bold tracking-tight text-[var(--text)]">
                  {otherProfile.name}
                </p>
                <OnlineStatus
                  isOnline={otherOnline}
                  isTyping={otherTyping}
                  lastSeen={otherLastSeen}
                  lang={profile.lang}
                />
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <ThemeToggle lang={profile.lang} />
                <InstallAppButton variant="compact" lang={profile.lang} />
                <button
                  type="button"
                  onClick={() => setProfile(null)}
                  title="Cambia profilo"
                  aria-label="Cambia profilo"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-white/5" />
              <div className="h-8 w-28 animate-pulse rounded-lg bg-white/5" />
            </div>
          )}
        </header>
        <ConnectionBanner lang={profile.lang} />
        </div>

        <div className="space-y-3.5 px-3 py-5 pb-6 sm:px-4">
          {loadingMessages ? (
            <MessageSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
              <div className="relative mb-6">
                <div
                  className="absolute -inset-4 rounded-full opacity-60 blur-xl animate-soft-pulse"
                  style={{
                    background: `radial-gradient(circle, ${profile.theme_color}44, transparent 70%)`,
                  }}
                />
                <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.35rem] bg-white/[0.04] ring-1 ring-white/10">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${profile.theme_color}, ${otherProfile?.theme_color ?? '#EC4899'})`,
                      boxShadow: `0 0 18px ${profile.theme_color}88`,
                    }}
                  />
                </div>
              </div>
              <p className="font-display text-xl font-bold text-[var(--text)]">{t.emptyTitle}</p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
                {t.emptySubtitle}
              </p>
            </div>
          ) : (
            <>
              {(hasOlder || loadingOlder) && (
                <div className="flex justify-center pb-1">
                  {loadingOlder ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-sky-400" />
                  ) : (
                    <p className="text-[11px] text-[var(--muted)]">{t.loadOlder}</p>
                  )}
                </div>
              )}
              {messages.map((message) => {
                const quoted = message.reply_to_id
                  ? messages.find((item) => item.id === message.reply_to_id) ?? null
                  : null
                const quotedName = quoted
                  ? quoted.sender_id === profile.id
                    ? t.you
                    : otherProfile?.name ?? ''
                  : ''
                return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  profile={profile}
                  peerThemeColor={otherProfile?.theme_color ?? '#EC4899'}
                  isNew={newMessageIds.has(message.id)}
                  reactions={reactionsByMessage[message.id] ?? []}
                  replyTo={quoted}
                  replyToName={quotedName}
                  highlighted={highlightId === message.id}
                  onRetry={handleRetry}
                  onEdit={handleStartEdit}
                  onReply={handleStartReply}
                  onJumpToReply={handleJumpToMessage}
                  onDelete={(m) => void deleteMessage(m)}
                  onToggleReaction={(emoji) =>
                    void toggleReaction(message.id, profile.id, emoji)
                  }
                />
                )
              })}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="composer-shell safe-bottom shrink-0">
        {replyingTo && !editing && (
          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2">
            <div
              className="min-w-0 flex-1 border-l-[3px] pl-2.5"
              style={{
                borderColor:
                  replyingTo.sender_id === profile.id
                    ? profile.theme_color
                    : otherProfile?.theme_color ?? '#EC4899',
              }}
            >
              <p className="truncate text-[11px] font-semibold text-sky-300">
                {t.replyingTo}{' '}
                {replyingTo.sender_id === profile.id
                  ? t.you
                  : otherProfile?.name ?? ''}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {messageQuoteText(replyingTo, profile.id, t.photo, t.deleted)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label={t.cancel}
              className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                {t.editing}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">{editing.original_text}</p>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              aria-label={t.cancel}
              className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {imagePreview && !editing && (
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="relative">
              <img
                src={imagePreview}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/15"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label={t.removePhoto}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-[#0a0f1a] p-1 text-white ring-1 ring-white/15"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-3 py-3.5 sm:px-4"
        >
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickImage}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePickImage}
          />

          {!editing && (
            <button
              type="button"
              onClick={() => setPhotoSourceOpen(true)}
              aria-label={t.addPhoto}
              className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] active:scale-95"
            >
              <ImagePlus className="h-5 w-5" strokeWidth={1.75} />
            </button>
          )}

          <textarea
            ref={composerRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            rows={1}
            enterKeyHint="send"
            className="composer-input max-h-28 min-h-[46px] min-w-0 flex-1 resize-none rounded-[1.4rem] px-4 py-3 text-base leading-snug outline-none transition focus:border-[var(--line-strong)] sm:text-sm"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={editing ? t.save : 'Invia'}
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:brightness-100"
            style={{
              backgroundImage: `linear-gradient(145deg, ${profile.theme_color}, ${profile.theme_color}bb)`,
              boxShadow: canSend
                ? `0 10px 24px -10px ${profile.theme_color}aa, inset 0 1px 0 rgba(255,255,255,0.25)`
                : undefined,
            }}
          >
            {editing ? (
              <Check className="h-4 w-4" strokeWidth={2.25} />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
        </form>
      </div>

      {photoSourceOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sheet-over-keyboard sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setPhotoSourceOpen(false)}
        >
          <div
            className="glass-strong w-full max-w-sm overflow-hidden rounded-[1.5rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                galleryInputRef.current?.click()
                setPhotoSourceOpen(false)
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[var(--text)] transition hover:bg-[var(--hover)]"
            >
              <Images className="h-5 w-5 text-[var(--muted)]" strokeWidth={1.75} />
              <span className="text-sm font-medium">{t.chooseFromGallery}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                cameraInputRef.current?.click()
                setPhotoSourceOpen(false)
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[var(--text)] transition hover:bg-[var(--hover)]"
            >
              <Camera className="h-5 w-5 text-[var(--muted)]" strokeWidth={1.75} />
              <span className="text-sm font-medium">{t.takePhoto}</span>
            </button>
            <button
              type="button"
              onClick={() => setPhotoSourceOpen(false)}
              className="w-full border-t border-white/8 px-4 py-3 text-sm text-[var(--muted)]"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
