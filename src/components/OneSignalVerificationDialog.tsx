import { useEffect, useRef, useState } from 'react'
import {
  addPushSubscriptionChangeListener,
  hasShownVerificationDialog,
  initOneSignal,
  markVerificationDialogShown,
  requestNotificationPermission,
} from '../lib/onesignal'

interface OneSignalVerificationDialogProps {
  onSubscribed?: (subscriptionId: string) => void
}

/**
 * OneSignal Web verification dialog (required by SDK AI prompt).
 * Permission is requested only when the user taps "Got it".
 * Init failures must never block the chat UI.
 */
export function OneSignalVerificationDialog({
  onSubscribed,
}: OneSignalVerificationDialogProps) {
  const [open, setOpen] = useState(false)
  const shownRef = useRef(false)
  const onSubscribedRef = useRef(onSubscribed)
  onSubscribedRef.current = onSubscribed

  useEffect(() => {
    let removeListener: (() => void) | undefined
    let cancelled = false

    async function boot() {
      try {
        await initOneSignal()
        if (cancelled) return

        removeListener = addPushSubscriptionChangeListener((id) => {
          if (id) onSubscribedRef.current?.(id)
        })

        if (!hasShownVerificationDialog() && !shownRef.current) {
          shownRef.current = true
          setOpen(true)
        }
      } catch (error) {
        console.warn('OneSignal verification boot failed:', error)
      }
    }

    void boot()

    return () => {
      cancelled = true
      removeListener?.()
    }
  }, [])

  async function handleGotIt() {
    markVerificationDialogShown()
    setOpen(false)
    await requestNotificationPermission()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onesignal-verify-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-5 shadow-xl">
        <h2
          id="onesignal-verify-title"
          className="text-lg font-semibold text-slate-100"
        >
          Your OneSignal SDK integration is complete!
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          You can now send Push Notifications &amp; In-App Messages through OneSignal.
          Tap below to enable push notifications.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Su iPhone: aggiungi prima l&apos;app alla Home Screen (iOS 16.4+), altrimenti le
          push non funzionano.
        </p>
        <button
          type="button"
          onClick={() => void handleGotIt()}
          className="mt-4 w-full rounded-full bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-400"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
