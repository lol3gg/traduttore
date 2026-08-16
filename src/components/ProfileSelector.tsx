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

  function handleSelect(selected: Profile) {
    setProfile(selected)
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-sky-300"
          aria-label="Caricamento"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center px-4">
        <div className="glass-strong max-w-md space-y-3 rounded-[1.75rem] p-7 text-center">
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
    <div className="flex min-h-svh flex-col items-center justify-center px-5 py-12">
      <div className="flex w-full max-w-md animate-fade-rise flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div
              className="absolute -inset-6 rounded-[2rem] opacity-70 blur-2xl animate-soft-pulse"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.35), transparent 55%), radial-gradient(circle at 70% 70%, rgba(236,72,153,0.28), transparent 55%)',
              }}
            />
            <img
              src="/icon-512.png"
              alt=""
              className="relative h-[6.25rem] w-[6.25rem] animate-icon-float rounded-[1.65rem] shadow-lift ring-1 ring-white/25"
            />
          </div>

          <div className="space-y-2">
            <h1 className="font-display brand-mark text-[2.75rem] font-extrabold leading-none tracking-tight sm:text-5xl">
              Traduttore
            </h1>
            <p className="text-[15px] font-medium tracking-wide text-slate-400">
              Italiano ↔ Russo
            </p>
            <p className="text-sm text-slate-500">Chat privata · solo voi due</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2">
          {profiles.map((p, index) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              style={{ animationDelay: `${140 + index * 90}ms` }}
              className="group animate-fade-rise relative flex flex-col items-center gap-3.5 overflow-hidden rounded-[1.75rem] px-5 py-7 text-center transition duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400/50"
            >
              <span
                className="absolute inset-0 opacity-90 transition duration-300 group-hover:opacity-100"
                style={{
                  background: `linear-gradient(160deg, ${p.theme_color}22, rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.2))`,
                }}
              />
              <span className="absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />
              <span
                className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full opacity-40 blur-2xl transition duration-500 group-hover:opacity-70"
                style={{ background: p.theme_color }}
              />

              <span className="relative">
                <Avatar name={p.name} themeColor={p.theme_color} size="lg" />
              </span>
              <span className="relative font-display text-xl font-bold text-white">{p.name}</span>
              <span
                className="relative text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: p.theme_color }}
              >
                {p.lang === 'it' ? 'Italiano' : 'Русский'}
              </span>
            </button>
          ))}
        </div>

        <p className="text-[13px] font-medium tracking-wide text-slate-500">
          Tocca il tuo profilo per entrare
        </p>

        <div className="w-full">
          <InstallAppButton variant="card" lang="it" />
        </div>
      </div>
    </div>
  )
}
