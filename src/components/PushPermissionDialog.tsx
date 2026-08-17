import { useEffect, useRef, useState } from 'react'
import {
  enableWebPush,
  hasShownPushPrompt,
  isWebPushSupported,
  markPushPromptShown,
  type PushSubscriptionJSON,
} from '../lib/webPush'

interface PushPermissionDialogProps {
  onSubscribed?: (subscription: PushSubscriptionJSON) => void
}

export function PushPermissionDialog({ onSubscribed }: PushPermissionDialogProps) {
  const [open, setOpen] = useState(false)
  const shownRef = useRef(false)
  const onSubscribedRef = useRef(onSubscribed)
  onSubscribedRef.current = onSubscribed

  useEffect(() => {
    if (!isWebPushSupported()) return
    if (hasShownPushPrompt() || shownRef.current) return
    if (Notification.permission === 'denied') return

    shownRef.current = true
    const timer = window.setTimeout(() => setOpen(true), 700)
    return () => window.clearTimeout(timer)
  }, [])

  async function handleEnable() {
    markPushPromptShown()
    setOpen(false)
    const sub = await enableWebPush()
    if (sub) onSubscribedRef.current?.(sub)
  }

  function handleLater() {
    markPushPromptShown()
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-enable-title"
    >
      <div className="glass-strong animate-fade-rise w-full max-w-sm rounded-[1.75rem] p-6">
        <div
          className="mb-4 h-1 w-14 rounded-full"
          style={{
            background: 'linear-gradient(90deg, #3B82F6, #EC4899)',
          }}
        />
        <h2
          id="push-enable-title"
          className="font-display text-xl font-bold tracking-tight text-[var(--text)]"
        >
          Attiva le notifiche
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Ricevi un avviso quando arriva un messaggio anche se non sei nella chat.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Su iPhone: aggiungi prima il sito alla Home Screen (iOS 16.4+), poi riapri l&apos;app
          dalla Home e attiva le notifiche.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleEnable()}
            className="w-full rounded-[1.1rem] bg-gradient-to-r from-blue-500 to-sky-400 px-4 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.99]"
          >
            Attiva
          </button>
          <button
            type="button"
            onClick={handleLater}
            className="w-full rounded-[1.1rem] px-4 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
          >
            Più tardi
          </button>
        </div>
      </div>
    </div>
  )
}
