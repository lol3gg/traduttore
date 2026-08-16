import { useState } from 'react'
import { Download, Share, Smartphone, X } from 'lucide-react'
import { useInstallApp } from '../hooks/useInstallApp'

interface InstallAppButtonProps {
  /** Compact icon button (chat header) vs full CTA */
  variant?: 'banner' | 'compact' | 'card'
  lang?: 'it' | 'ru'
}

const copy = {
  it: {
    title: 'Installa l’app',
    subtitle: 'Mettila in Home con il logo — come un’app vera',
    button: 'Installa sulla Home',
    installed: 'Già installata',
    iosTitle: 'Aggiungi a Home su iPhone',
    iosSteps: [
      'Tocca il pulsante Condividi in Safari',
      'Scorri e scegli “Aggiungi a Home”',
      'Conferma — compare l’icona Traduttore',
    ],
    androidHint: 'Si apre la finestra di installazione del browser.',
    close: 'Chiudi',
    open: 'Apri guida',
  },
  ru: {
    title: 'Установить приложение',
    subtitle: 'На домашний экран с иконкой — как настоящее приложение',
    button: 'На домашний экран',
    installed: 'Уже установлено',
    iosTitle: 'Добавить на экран «Домой»',
    iosSteps: [
      'Нажмите «Поделиться» в Safari',
      'Выберите «На экран «Домой»»',
      'Подтвердите — появится иконка Traduttore',
    ],
    androidHint: 'Откроется окно установки браузера.',
    close: 'Закрыть',
    open: 'Открыть инструкцию',
  },
} as const

export function InstallAppButton({
  variant = 'banner',
  lang = 'it',
}: InstallAppButtonProps) {
  const { installed, isIos, canInstallNative, promptInstall } = useInstallApp()
  const [open, setOpen] = useState(false)
  const t = copy[lang]

  if (installed) {
    if (variant === 'compact') return null
    return (
      <div className="flex items-center justify-center gap-2 rounded-[1.25rem] border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm font-medium text-emerald-300">
        <Smartphone className="h-4 w-4" />
        {t.installed}
      </div>
    )
  }

  async function handlePrimary() {
    if (canInstallNative) {
      const ok = await promptInstall()
      if (ok) return
    }
    setOpen(true)
  }

  const trigger =
    variant === 'compact' ? (
      <button
        type="button"
        onClick={() => void handlePrimary()}
        title={t.title}
        aria-label={t.title}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
      >
        <Download className="h-4 w-4" strokeWidth={2} />
      </button>
    ) : variant === 'card' ? (
      <button
        type="button"
        onClick={() => void handlePrimary()}
        className="group flex w-full items-center gap-3.5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-3.5 text-left transition hover:border-white/15 hover:bg-white/[0.05]"
      >
        <img
          src="/icon-512.png"
          alt=""
          className="h-12 w-12 rounded-[1.05rem] ring-1 ring-white/15"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-white">{t.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.subtitle}</p>
        </div>
        <Download className="h-5 w-5 shrink-0 text-sky-300/90 transition group-hover:translate-x-0.5" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => void handlePrimary()}
        className="flex w-full items-center justify-center gap-2 rounded-[1.15rem] bg-gradient-to-r from-blue-500 to-pink-500 px-5 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
      >
        <Download className="h-4 w-4" />
        {t.button}
      </button>
    )

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-app-title"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0c1220] shadow-lift">
            <div className="relative flex flex-col items-center bg-gradient-to-b from-white/[0.06] to-transparent px-5 pb-4 pt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src="/icon-512.png"
                alt="Traduttore"
                className="h-24 w-24 rounded-[1.4rem] shadow-lift ring-1 ring-white/15"
              />
              <h2
                id="install-app-title"
                className="font-display brand-mark mt-4 text-2xl font-extrabold"
              >
                Traduttore
              </h2>
              <p className="mt-1 text-center text-sm text-slate-400">{t.subtitle}</p>
            </div>

            <div className="space-y-4 px-5 pb-5 pt-2">
              {isIos || !canInstallNative ? (
                <>
                  <p className="text-sm font-medium text-slate-200">{t.iosTitle}</p>
                  <ol className="space-y-3">
                    {t.iosSteps.map((step, i) => (
                      <li key={step} className="flex gap-3 text-sm text-slate-300">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-300">
                          {i + 1}
                        </span>
                        <span className="pt-0.5 leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex items-center gap-2 rounded-xl bg-background/80 px-3 py-2.5 text-xs text-slate-400">
                    <Share className="h-4 w-4 shrink-0 text-blue-400" />
                    Safari → Condividi → Aggiungi a Home
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-300">{t.androidHint}</p>
              )}

              {canInstallNative && (
                <button
                  type="button"
                  onClick={() => void promptInstall().then((ok) => ok && setOpen(false))}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white"
                >
                  <Download className="h-4 w-4" />
                  {t.button}
                </button>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-300"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
