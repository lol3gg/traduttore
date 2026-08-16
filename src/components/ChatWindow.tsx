import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { ImagePlus, Send, X } from 'lucide-react'
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
        <div className="h-12 w-[55%] animate-pulse rounded-[1.35rem] rounded-bl-md bg-white/5" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-[42%] animate-pulse rounded-[1.35rem] rounded-br-md bg-white/[0.07]" />
      </div>
      <div className="flex justify-start">
        <div className="h-14 w-[62%] animate-pulse rounded-[1.35rem] rounded-bl-md bg-white/5" />
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
  const canSend = Boolean((text.trim() || imageFile) && otherProfile && !sending)

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSend() {
    if (!profile || !otherProfile || (!text.trim() && !imageFile) || sending) return

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
        <header className="safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-white/5 bg-[rgba(7,11,20,0.72)] px-3 py-2.5 pr-16 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3 sm:pr-16">
          {otherProfile ? (
            <>
              <Avatar
                name={otherProfile.name}
                themeColor={otherProfile.theme_color}
                size="md"
                isOnline={otherOnline}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-[15px] font-semibold tracking-tight text-slate-50">
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

        <div className="space-y-3.5 px-3 py-4 pb-5 sm:px-4">
          {loadingMessages ? (
            <MessageSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-pink-500/15 text-2xl text-slate-300 ring-1 ring-white/10">
                ✦
              </div>
              <p className="font-display text-lg font-semibold text-slate-100">{t.emptyTitle}</p>
              <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-slate-500">
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
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="safe-bottom shrink-0 border-t border-white/5 bg-[rgba(7,11,20,0.85)] backdrop-blur-xl">
        {imagePreview && (
          <div className="flex items-center gap-2 px-3 pt-3">
            <div className="relative">
              <img
                src={imagePreview}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label={t.removePhoto}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-1 text-white ring-1 ring-white/10"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-3 py-3 sm:px-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePickImage}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t.addPhoto}
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/5 active:bg-white/10"
          >
            <ImagePlus className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            rows={1}
            enterKeyHint="send"
            className="max-h-28 min-h-[46px] min-w-0 flex-1 resize-none rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-base leading-snug text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sky-400/30 focus:bg-white/[0.06] sm:text-sm"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Invia"
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-soft transition active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:brightness-100"
            style={{
              backgroundImage: `linear-gradient(145deg, ${profile.theme_color}, ${profile.theme_color}cc)`,
            }}
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>
  )
}
