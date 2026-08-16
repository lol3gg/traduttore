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

/**
 * Asks once for notification permission and registers native Web Push.
 */
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
    // Small delay so the chat UI paints first
    const timer = window.setTimeout(() => setOpen(true), 600)
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-enable-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-5 shadow-xl">
        <h2 id="push-enable-title" className="text-lg font-semibold text-slate-100">
          Attiva le notifiche
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Ricevi un avviso quando arriva un messaggio anche se non sei nella chat.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Su iPhone: aggiungi prima il sito alla Home Screen (iOS 16.4+), poi riapri l&apos;app
          dalla Home e attiva le notifiche.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleEnable()}
            className="w-full rounded-full bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            Attiva
          </button>
          <button
            type="button"
            onClick={handleLater}
            className="w-full rounded-full px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            Più tardi
          </button>
        </div>
      </div>
    </div>
  )
}
