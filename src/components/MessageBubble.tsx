import { useEffect, useState } from 'react'
import { AlertCircle, RotateCcw, X } from 'lucide-react'
import type { Message, Profile } from '../types'
import { themeGradient } from '../lib/color'

interface MessageBubbleProps {
  message: Message
  profile: Profile
  /** Theme color of the other person (used for their bubbles) */
  peerThemeColor?: string
  isNew?: boolean
  onRetry?: (message: Message) => void
}

const TRANSLATION_TIMEOUT_MS = 20_000

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
}: MessageBubbleProps) {
  const isMine = message.sender_id === profile.id
  const isFailed = message.delivery_status === 'failed'
  const isPending = message.delivery_status === 'pending'
  const imageSrc = message.local_image_preview || message.image_url
  const hasText = Boolean(message.original_text?.trim())
  const displayText = isMine
    ? message.original_text
    : (message.translated_text ?? message.original_text)

  const [translationTimedOut, setTranslationTimedOut] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (isMine || message.translated_text || !hasText) {
      setTranslationTimedOut(false)
      return
    }

    const elapsed = Date.now() - new Date(message.created_at).getTime()
    const remaining = Math.max(0, TRANSLATION_TIMEOUT_MS - elapsed)
    const timer = setTimeout(() => setTranslationTimedOut(true), remaining)
    return () => clearTimeout(timer)
  }, [hasText, isMine, message.created_at, message.id, message.translated_text])

  const isTranslating =
    !isMine && hasText && !message.translated_text && !translationTimedOut

  const bubbleColor = isMine ? profile.theme_color : peerThemeColor
  const gradient = !isFailed ? themeGradient(bubbleColor) : null

  return (
    <>
      <div
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${
          isNew ? 'animate-slide-fade-in' : ''
        }`}
      >
        <div
          className={`flex max-w-[88%] items-end gap-1.5 sm:max-w-[75%] ${
            isMine ? 'flex-row' : 'flex-row-reverse'
          }`}
        >
          {isFailed && isMine && (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              title="Riprova"
              aria-label="Riprova invio"
              className="mb-1 shrink-0 rounded-full p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}

          <div
            className={`relative min-w-0 overflow-hidden shadow-md ${
              imageSrc && !hasText ? 'rounded-2xl p-1' : 'rounded-2xl px-3.5 pb-5 pt-2'
            } ${
              isMine
                ? `rounded-br-md text-white ${isFailed ? 'bg-red-900/80 ring-1 ring-red-500/50' : ''}`
                : 'rounded-bl-md text-white'
            } ${isPending ? 'opacity-70' : ''}`}
            style={
              !isFailed && gradient && !(imageSrc && !hasText)
                ? {
                    backgroundImage: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
                  }
                : !isFailed && imageSrc && !hasText
                  ? { backgroundColor: 'transparent' }
                  : undefined
            }
          >
            {imageSrc && (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                className="block w-full overflow-hidden rounded-xl focus:outline-none"
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
                className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed ${
                  imageSrc ? 'mt-2' : ''
                }`}
              >
                {displayText}
              </p>
            )}

            {isTranslating && (
              <p className="mt-1 text-[11px] italic text-white/70">traduzione in corso...</p>
            )}
            {isFailed && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-red-200">
                <AlertCircle className="h-3 w-3" />
                Invio non riuscito
              </p>
            )}
            <span className="absolute bottom-1.5 right-2.5 text-[10px] text-white/70 sm:text-xs">
              {formatTime(message.created_at)}
            </span>
          </div>
        </div>
      </div>

      {lightbox && imageSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Chiudi"
            className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightbox(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={imageSrc}
            alt=""
            className="max-h-[90dvh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
