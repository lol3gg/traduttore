import { useEffect, useState } from 'react'
import { Share, X, Download } from 'lucide-react'

const DISMISS_KEY = 'pwa_install_prompt_dismissed'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    ('standalone' in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  )
}

function isIos() {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOS || iPadOs
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<'ios' | 'android' | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  )

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    if (isIos()) {
      setMode('ios')
      setVisible(true)
      return
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setMode('android')
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function installAndroid() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  if (!visible || !mode) return null

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-border-subtle bg-surface/95 p-4 shadow-lg backdrop-blur-sm">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-slate-200">
          {mode === 'ios' ? (
            <Share className="h-4 w-4" strokeWidth={2} />
          ) : (
            <Download className="h-4 w-4" strokeWidth={2} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {mode === 'ios' ? (
            <p className="text-sm leading-relaxed text-slate-200">
              {/*
                iOS Web Push (16.4+) works ONLY when the app is added to the Home Screen
                (standalone PWA). Safari browser tabs cannot receive push notifications.
              */}
              Per ricevere le notifiche dei messaggi e usarla come un&apos;app, aggiungi
              NomeApp alla schermata Home: tocca Condividi e poi &quot;Aggiungi a Home&quot;.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-slate-200">
                Installa NomeApp sulla home per usarla come un&apos;app vera.
              </p>
              <button
                type="button"
                onClick={() => void installAndroid()}
                className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
              >
                Installa app
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Chiudi"
          className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-border-subtle/60 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
