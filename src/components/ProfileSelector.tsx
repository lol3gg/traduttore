import { useEffect, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import { Avatar } from './Avatar'
import { InstallAppButton } from './InstallAppButton'

export function ProfileSelector() {
  const { setProfile } = useProfile()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchProfiles() {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, name, lang, theme_color, is_online, is_typing, last_seen')
        .order('lang', { ascending: true })

      if (cancelled) return

      if (fetchError) {
        setError('Impossibile caricare i profili. Controlla la connessione a Supabase.')
        setLoading(false)
        return
      }

      setProfiles((data ?? []) as Profile[])
      setLoading(false)
    }

    void fetchProfiles()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center overflow-hidden">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-sky-300"
          aria-label="Caricamento"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[100dvh] items-center justify-center overflow-hidden px-5">
        <div className="glass-strong w-full max-w-sm space-y-3 rounded-[1.5rem] p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-slate-400 underline decoration-white/20 underline-offset-4 hover:text-slate-200"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {/* Brand — compact hero */}
        <header className="flex shrink-0 flex-col items-center pt-2 text-center">
          <div className="relative mb-3">
            <div
              className="absolute -inset-4 rounded-[1.5rem] opacity-70 blur-xl"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.4), transparent 60%), radial-gradient(circle at 75% 70%, rgba(236,72,153,0.32), transparent 60%)',
              }}
            />
            <img
              src="/icon-512.png?v=3"
              alt=""
              className="relative h-[4.5rem] w-[4.5rem] rounded-[1.25rem] shadow-lift ring-1 ring-white/25"
            />
          </div>
          <h1 className="font-display brand-mark text-[2.15rem] font-extrabold leading-none tracking-tight">
            Traduttore
          </h1>
          <p className="mt-1.5 text-[13px] font-medium text-slate-400">
            Italiano ↔ Russo · solo voi due
          </p>
        </header>

        {/* Profiles — fill middle, no scroll */}
        <div className="flex min-h-0 flex-1 flex-col justify-center py-4">
          <p className="mb-3 text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Chi sei?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProfile(p)}
                className="group relative flex flex-col items-center gap-2.5 overflow-hidden rounded-[1.35rem] px-3 py-5 text-center transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400/50"
              >
                <span
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(165deg, ${p.theme_color}28, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.25))`,
                  }}
                />
                <span className="absolute inset-0 rounded-[1.35rem] ring-1 ring-inset ring-white/12 transition group-active:ring-white/25" />
                <span
                  className="pointer-events-none absolute -right-5 -top-6 h-20 w-20 rounded-full opacity-45 blur-2xl"
                  style={{ background: p.theme_color }}
                />
                <span className="relative">
                  <Avatar name={p.name} themeColor={p.theme_color} size="md" />
                </span>
                <span className="relative font-display text-lg font-bold text-white">{p.name}</span>
                <span
                  className="relative text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: p.theme_color }}
                >
                  {p.lang === 'it' ? 'Italiano' : 'Русский'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Install — compact footer, never pushes scroll */}
        <footer className="shrink-0 pb-1">
          <InstallAppButton variant="card" lang="it" />
        </footer>
      </div>
    </div>
  )
}
