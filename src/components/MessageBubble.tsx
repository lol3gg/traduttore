import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { AlertCircle, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import type { Message, Profile } from '../types'
import { translations } from '../i18n/translations'
import { themeGradient } from '../lib/color'
import { MessageTicks } from './MessageTicks'

interface MessageBubbleProps {
  message: Message
  profile: Profile
  peerThemeColor?: string
  isNew?: boolean
  onRetry?: (message: Message) => void
  onEdit?: (message: Message) => void
  onDelete?: (message: Message) => void
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

export function MessageBubble({
  message,
  profile,
  peerThemeColor = '#EC4899',
  isNew = false,
  onRetry,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const isMine = message.sender_id === profile.id
  const isFailed = message.delivery_status === 'failed'
  const isPending = message.delivery_status === 'pending'
  const isDeleted = Boolean(message.deleted_at)
  const imageSrc = isDeleted ? null : message.local_image_preview || message.image_url
  const hasText = Boolean(message.original_text?.trim())
  const displayText = isMine
    ? message.original_text
    : (message.translated_text ?? message.original_text)
  const t = translations[profile.lang]

  const [translationTimedOut, setTranslationTimedOut] = useState(false)
  const [lightbox, setLightbox] = useState(false)
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
  const imageOnly = Boolean(imageSrc && !hasText)
  const canAct = isMine && !isPending && !isDeleted && !message.id.startsWith('temp-')
  const canEdit = canAct && hasText

  function clearPressTimer() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function openMenu() {
    if (!canAct && !(isMine && isFailed)) return
    didLongPress.current = true
    setConfirmDelete(false)
    setMenuOpen(true)
  }

  function handlePointerDown() {
    didLongPress.current = false
    if (!canAct && !(isMine && isFailed)) return
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
          className={`flex max-w-[86%] items-end gap-1.5 sm:max-w-[72%] ${
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
              if (!canAct && !(isMine && isFailed)) return
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
                {imageSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      if (didLongPress.current) return
                      setLightbox(true)
                    }}
                    className="block w-full overflow-hidden rounded-[1.15rem] focus:outline-none"
                  >
                    <img
                      src={imageSrc}
                      alt=""
                      className="max-h-72 w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                )}

                {hasText && (
                  <p
                    className={`whitespace-pre-wrap break-words text-[15px] font-medium leading-[1.45] tracking-[0.01em] ${
                      imageSrc ? 'mt-2' : ''
                    } ${isMine ? 'text-white' : 'text-[var(--peer-text)]'}`}
                  >
                    {displayText}
                  </p>
                )}

                {isTranslating && (
                  <p className="mt-1.5 bg-[linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.85),rgba(255,255,255,0.35))] bg-[length:200%_100%] bg-clip-text text-[11px] font-medium italic text-transparent animate-shimmer">
                    traduzione in corso…
                  </p>
                )}
                {isFailed && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-200">
                    <AlertCircle className="h-3 w-3" />
                    Invio non riuscito
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
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-red-400 transition hover:bg-[var(--hover)]"
                >
                  <Trash2 className="h-4 w-4" />
                  {t.delete}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] text-[var(--muted)]"
                >
                  {t.cancel}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && imageSrc && (
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
          <img
            src={imageSrc}
            alt=""
            className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-lift"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
