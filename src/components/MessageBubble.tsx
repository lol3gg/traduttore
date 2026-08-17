import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { AlertCircle, ImageIcon, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import type { Message, Profile } from '../types'
import { translations } from '../i18n/translations'
import { themeGradient } from '../lib/color'
import { MessageTicks } from './MessageTicks'
import { ReactionPicker } from './ReactionPicker'
import type { Reaction } from '../hooks/useReactions'

interface MessageBubbleProps {
  message: Message
  profile: Profile
  peerThemeColor?: string
  isNew?: boolean
  reactions?: Reaction[]
  onRetry?: (message: Message) => void
  onEdit?: (message: Message) => void
  onDelete?: (message: Message) => void
  onToggleReaction?: (emoji: string) => void
}

const TRANSLATION_TIMEOUT_MS = 12_000
const LONG_PRESS_MS = 420

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function groupReactionCounts(reactions: Reaction[]) {
  const counts = new Map<string, number>()
  for (const reaction of reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1)
  }
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count }))
}

export function MessageBubble({
  message,
  profile,
  peerThemeColor = '#EC4899',
  isNew = false,
  reactions = [],
  onRetry,
  onEdit,
  onDelete,
  onToggleReaction,
}: MessageBubbleProps) {
  const isMine = message.sender_id === profile.id
  const isFailed = message.delivery_status === 'failed'
  const isPending = message.delivery_status === 'pending'
  const isDeleted = Boolean(message.deleted_at)
  const localPreview = isDeleted ? null : message.local_image_preview || null
  const remoteImage = isDeleted ? null : message.image_url
  const hasImage = Boolean(localPreview || remoteImage)
  const hasText = Boolean(message.original_text?.trim())
  const displayText = isMine
    ? message.original_text
    : (message.translated_text ?? message.original_text)
  const t = translations[profile.lang]

  const [translationTimedOut, setTranslationTimedOut] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [lightboxLoaded, setLightboxLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const didLongPress = useRef(false)

  useEffect(() => {
    if (isMine || message.translated_text || !hasText || isDeleted) {
      setTranslationTimedOut(false)
      return
    }

    const elapsed = Date.now() - new Date(message.created_at).getTime()
    const remaining = Math.max(0, TRANSLATION_TIMEOUT_MS - elapsed)
    const timer = setTimeout(() => setTranslationTimedOut(true), remaining)
    return () => clearTimeout(timer)
  }, [hasText, isDeleted, isMine, message.created_at, message.id, message.translated_text])

  const isTranslating =
    !isMine && hasText && !message.translated_text && !translationTimedOut && !isDeleted

  const bubbleColor = isMine ? profile.theme_color : peerThemeColor
  const gradient = !isFailed && !isDeleted ? themeGradient(bubbleColor) : null
  const imageOnly = Boolean(hasImage && !hasText)
  const canAct = isMine && !isPending && !isDeleted && !message.id.startsWith('temp-')
  const canEdit = canAct && hasText
  const canReact =
    Boolean(onToggleReaction) && !isDeleted && !isPending && !message.id.startsWith('temp-')
  const canOpenMenu = canReact || canAct || (isMine && isFailed)

  function clearPressTimer() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function openMenu() {
    if (!canOpenMenu) return
    didLongPress.current = true
    setConfirmDelete(false)
    setMenuOpen(true)
  }

  function handlePointerDown() {
    didLongPress.current = false
    if (!canOpenMenu) return
    clearPressTimer()
    pressTimer.current = window.setTimeout(openMenu, LONG_PRESS_MS)
  }

  function handlePointerUp() {
    clearPressTimer()
  }

  function handleClickCapture(e: MouseEvent) {
    if (didLongPress.current) {
      e.preventDefault()
      e.stopPropagation()
      didLongPress.current = false
    }
  }

  const meta = !isDeleted ? (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium tabular-nums ${
        isMine ? 'text-white/55' : 'text-[var(--peer-meta)]'
      } ${imageOnly ? 'rounded-full bg-black/45 px-1.5 py-0.5 backdrop-blur-sm text-white/80' : ''}`}
    >
      {message.edited_at && <span>{t.edited}</span>}
      <span>{formatTime(message.created_at)}</span>
      {isMine && (
        <MessageTicks
          message={message}
          lang={profile.lang}
          onColoredBubble={!imageOnly && !isFailed}
        />
      )}
    </span>
  ) : null

  return (
    <>
      <div
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${
          isNew ? 'animate-slide-fade-in' : ''
        }`}
      >
        <div
          className={`flex max-w-[86%] flex-col sm:max-w-[72%] ${
            isMine ? 'items-end' : 'items-start'
          }`}
        >
        <div
          className={`flex items-end gap-1.5 ${
            isMine ? 'flex-row' : 'flex-row-reverse'
          }`}
        >
          {isFailed && isMine && (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              title="Riprova"
              aria-label="Riprova invio"
              className="mb-1 shrink-0 rounded-full p-2 text-red-300 transition hover:bg-red-500/10"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}

          <div
            className={`relative min-w-0 select-none overflow-hidden ${
              isDeleted
                ? 'rounded-[1.4rem] px-3.5 py-2.5'
                : imageOnly
                  ? 'rounded-[1.4rem] p-1'
                  : `rounded-[1.4rem] px-3.5 pt-2.5 ${message.edited_at ? 'pb-[1.5rem]' : 'pb-[1.35rem]'}`
            } ${
              isDeleted
                ? isMine
                  ? 'rounded-br-md bg-white/[0.06] ring-1 ring-white/10'
                  : 'rounded-bl-md bg-white/[0.05] ring-1 ring-white/10'
                : isMine
                  ? `bubble-mine rounded-br-md text-white ${isFailed ? 'bg-red-950/90 ring-1 ring-red-500/40' : ''}`
                  : 'bubble-peer rounded-bl-md'
            } ${isPending ? 'opacity-70' : ''}`}
            style={
              isDeleted
                ? undefined
                : isMine && !isFailed && gradient && !imageOnly
                  ? {
                      backgroundImage: `linear-gradient(145deg, ${gradient.from}, ${gradient.to})`,
                    }
                  : !isMine && !isFailed && !imageOnly
                    ? {
                        borderColor: `${peerThemeColor}33`,
                      }
                    : imageOnly && !isFailed
                      ? { backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }
                      : undefined
            }
            onContextMenu={(e) => {
              if (!canOpenMenu) return
              e.preventDefault()
              openMenu()
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClickCapture={handleClickCapture}
          >
            {isDeleted ? (
              <p className="text-[14px] italic text-[var(--muted)]">{t.deleted}</p>
            ) : (
              <>
                {hasImage && (
                  <button
                    type="button"
                    onClick={() => {
                      if (didLongPress.current) return
                      setLightboxLoaded(Boolean(localPreview))
                      setLightbox(true)
                    }}
                    className="block w-full overflow-hidden rounded-[1.15rem] focus:outline-none"
                  >
                    {localPreview ? (
                      <img
                        src={localPreview}
                        alt=""
                        className="max-h-72 w-full object-cover"
                      />
                    ) : (
                      <span
                        className={`flex min-h-[9.5rem] min-w-[11rem] flex-col items-center justify-center gap-1.5 px-6 py-8 ${
                          isMine ? 'bg-black/25' : 'bg-[var(--hover)]'
                        }`}
                      >
                        <ImageIcon
                          className={`h-8 w-8 ${isMine ? 'text-white/85' : 'text-[var(--muted)]'}`}
                        />
                        <span
                          className={`text-sm font-semibold ${
                            isMine ? 'text-white' : 'text-[var(--text)]'
                          }`}
                        >
                          {t.photo}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            isMine ? 'text-white/55' : 'text-[var(--muted)]'
                          }`}
                        >
                          {t.tapToView}
                        </span>
                      </span>
                    )}
                  </button>
                )}

                {hasText && (
                  <p
                    className={`whitespace-pre-wrap break-words text-[15px] font-medium leading-[1.45] tracking-[0.01em] ${
                      hasImage ? 'mt-2' : ''
                    } ${isMine ? 'text-white' : 'text-[var(--peer-text)]'}`}
                  >
                    {displayText}
                  </p>
                )}

                {isTranslating && (
                  <p className="mt-1.5 bg-[linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.85),rgba(255,255,255,0.35))] bg-[length:200%_100%] bg-clip-text text-[11px] font-medium italic text-transparent animate-shimmer">
                    {t.translating}
                  </p>
                )}
                {isFailed && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-200">
                    <AlertCircle className="h-3 w-3" />
                    {t.sendFailed}
                  </p>
                )}

                <span
                  className={`absolute ${
                    imageOnly ? 'bottom-2.5 right-2.5' : 'bottom-1.5 right-3'
                  }`}
                >
                  {meta}
                </span>
              </>
            )}
          </div>
        </div>
          {reactions.length > 0 && (
            <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
              {groupReactionCounts(reactions).map(({ emoji, count }) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction?.(emoji)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-[var(--hover)] px-1.5 py-0.5 text-[13px] ring-1 ring-white/10"
                >
                  <span>{emoji}</span>
                  {count > 1 && (
                    <span className="text-[10px] font-semibold text-[var(--muted)]">{count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setMenuOpen(false)
            setConfirmDelete(false)
          }}
        >
          <div
            className="glass-strong w-full max-w-sm overflow-hidden rounded-[1.5rem]"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDelete ? (
              <div className="p-5">
                <p className="font-display text-base font-bold text-[var(--text)]">{t.delete}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{t.deleteConfirm}</p>
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmDelete(false)
                      onDelete?.(message)
                    }}
                    className="rounded-[1.05rem] bg-red-500/90 px-4 py-3 text-sm font-semibold text-white"
                  >
                    {t.deleteForEveryone}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-[1.05rem] px-4 py-2.5 text-sm text-[var(--muted)]"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {canReact && (
                  <ReactionPicker
                    onPick={(emoji) => {
                      setMenuOpen(false)
                      onToggleReaction?.(emoji)
                    }}
                  />
                )}
                <div className="py-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit?.(message)
                    }}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-[var(--text)] transition hover:bg-[var(--hover)]"
                  >
                    <Pencil className="h-4 w-4 text-sky-300" />
                    {t.edit}
                  </button>
                )}
                {canAct && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-red-400 transition hover:bg-[var(--hover)]"
                >
                  <Trash2 className="h-4 w-4" />
                  {t.delete}
                </button>
                )}
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] text-[var(--muted)]"
                >
                  {t.cancel}
                </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && (localPreview || remoteImage) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-3 backdrop-blur-md"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Chiudi"
            className="absolute right-3 top-3 rounded-full bg-white/10 p-2.5 text-white ring-1 ring-white/10 transition hover:bg-white/15"
            onClick={() => setLightbox(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {!lightboxLoaded && (
            <div className="absolute h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          )}
          <img
            src={localPreview || remoteImage || ''}
            alt=""
            className={`max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-lift ${
              lightboxLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
            onLoad={() => setLightboxLoaded(true)}
          />
        </div>
      )}
    </>
  )
}
