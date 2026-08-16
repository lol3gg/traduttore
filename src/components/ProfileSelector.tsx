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
          className="h-9 w-9 animate-spin rounded-full border-2 border-border-subtle border-t-sky-300"
          aria-label="Caricamento"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center px-4">
        <div className="glass-panel max-w-md space-y-3 rounded-3xl p-6 text-center shadow-soft">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-slate-400 underline hover:text-slate-200"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md animate-fade-rise flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="absolute -inset-3 rounded-[1.75rem] bg-gradient-to-br from-blue-500/25 via-transparent to-pink-500/20 blur-xl" />
            <img
              src="/icon-192.png"
              alt="Traduttore"
              className="relative h-[5.5rem] w-[5.5rem] rounded-[1.35rem] shadow-glow ring-1 ring-white/15"
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Private chat
            </p>
            <h1 className="font-display mt-1.5 text-3xl font-semibold tracking-tight text-white">
              Traduttore
            </h1>
            <p className="mt-2 text-sm text-slate-400">Italiano ↔ Russo · solo voi due</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {profiles.map((p, index) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              style={{ animationDelay: `${120 + index * 80}ms` }}
              className="group animate-fade-rise glass-panel flex flex-col items-center gap-3 rounded-3xl p-6 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400/60"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 18px 40px -18px ${p.theme_color}88`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <Avatar name={p.name} themeColor={p.theme_color} size="lg" />
              <span className="font-display text-lg font-semibold text-slate-50">{p.name}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/90"
                style={{ backgroundColor: `${p.theme_color}33`, color: p.theme_color }}
              >
                {p.lang}
              </span>
            </button>
          ))}
        </div>

        <p className="text-sm text-slate-500">Seleziona chi sei</p>

        <div className="w-full">
          <InstallAppButton variant="card" lang="it" />
        </div>
      </div>
    </div>
  )
}
