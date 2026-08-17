import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Check, ImagePlus, Send, X } from 'lucide-react'
import { useProfile } from '../context/ProfileContext'
import { useMessages } from '../hooks/useMessages'
import { usePresence } from '../hooks/usePresence'
import { useTyping } from '../hooks/useTyping'
import { clearUnreadBadge, setUnreadBadge } from '../lib/appBadge'
import { playSoftChime } from '../lib/softChime'
import { supabase } from '../lib/supabase'
import { translations } from '../i18n/translations'
import type { Message, Profile } from '../types'
import { Avatar } from './Avatar'
import { MessageBubble } from './MessageBubble'
import { InstallAppButton } from './InstallAppButton'
import { OnlineStatus } from './OnlineStatus'

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
        <div className="h-12 w-[55%] animate-pulse rounded-[1.4rem] rounded-bl-md bg-white/[0.04]" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-[42%] animate-pulse rounded-[1.4rem] rounded-br-md bg-white/[0.06]" />
      </div>
      <div className="flex justify-start">
        <div className="h-14 w-[62%] animate-pulse rounded-[1.4rem] rounded-bl-md bg-white/[0.04]" />
      </div>
    </div>
  )
}

export function ChatWindow() {
  const { profile } = useProfile()
  const {
    messages,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
    loadingMessages,
    markMessagesRead,
    unreadCount,
  } = useMessages(profile?.id)
  const { onlineStatus } = usePresence(profile)
  const { typingStatus, notifyTyping, clearTypingFor } = useTyping(profile)
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null)
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState<Message | null>(null)
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(() => new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const seededIdsRef = useRef(false)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const wasOtherOnlineRef = useRef(false)
  const profileIdRef = useRef(profile?.id)
  profileIdRef.current = profile?.id

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, imagePreview])

  // Soft chime from service worker when push arrives with app focused
  useEffect(() => {
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'soft-chime') {
        playSoftChime()
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }, [])

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

  const otherOnline = otherProfile ? Boolean(onlineStatus[otherProfile.id]) : false
  const otherTyping = otherProfile ? Boolean(typingStatus[otherProfile.id]) : false

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
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    await sendMessage(value, profile.id, profile.lang, otherProfile.id, profile.name, file)
    setSending(false)
  }

  function handleRetry(message: Message) {
    if (!otherProfile || !profile) return
    void retryMessage(message, otherProfile.id, profile.name)
  }

  function handleStartEdit(message: Message) {
    if (!message.original_text?.trim()) return
    setEditing(message)
    setText(message.original_text)
    clearImage()
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

  function handlePickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  return (
    <div className="flex h-[100dvh] max-w-[100vw] flex-col overflow-hidden text-slate-100">
      <div className="chat-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <header className="header-shell safe-top sticky top-0 z-10 flex items-center gap-2.5 px-3 py-3 pr-16 sm:gap-3 sm:px-4 sm:pr-16">
          {otherProfile ? (
            <>
              <Avatar
                name={otherProfile.name}
                themeColor={otherProfile.theme_color}
                size="md"
                isOnline={otherOnline}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-[16px] font-bold tracking-tight text-white">
                  {otherProfile.name}
                </p>
                <OnlineStatus
                  isOnline={otherOnline}
                  isTyping={otherTyping}
                  lastSeen={otherProfile.last_seen}
                  lang={profile.lang}
                />
              </div>
              <InstallAppButton variant="compact" lang={profile.lang} />
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-white/5" />
              <div className="h-8 w-28 animate-pulse rounded-lg bg-white/5" />
            </div>
          )}
        </header>

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
              <p className="font-display text-xl font-bold text-white">{t.emptyTitle}</p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                {t.emptySubtitle}
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                profile={profile}
                peerThemeColor={otherProfile?.theme_color ?? '#EC4899'}
                isNew={newMessageIds.has(message.id)}
                onRetry={handleRetry}
                onEdit={handleStartEdit}
                onDelete={(m) => void deleteMessage(m)}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="composer-shell safe-bottom shrink-0">
        {editing && (
          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                {t.editing}
              </p>
              <p className="truncate text-xs text-slate-400">{editing.original_text}</p>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              aria-label={t.cancel}
              className="rounded-full p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
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
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePickImage}
          />

          {!editing && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.addPhoto}
              className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200 active:scale-95"
            >
              <ImagePlus className="h-5 w-5" strokeWidth={1.75} />
            </button>
          )}

          <textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            rows={1}
            enterKeyHint="send"
            className="max-h-28 min-h-[46px] min-w-0 flex-1 resize-none rounded-[1.4rem] border border-white/10 bg-white/[0.045] px-4 py-3 text-base leading-snug text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-slate-500 outline-none transition focus:border-white/20 focus:bg-white/[0.07] sm:text-sm"
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
    </div>
  )
}
