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
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-slate-200"
          aria-label="Caricamento"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-sm text-red-400">{error}</p>
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
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/icon-192.png"
            alt="Traduttore"
            className="h-20 w-20 rounded-[1.25rem] shadow-xl ring-2 ring-white/10"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Traduttore
            </h1>
            <p className="mt-1 text-sm text-slate-400">Chat privata · IT ↔ RU</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-6 shadow-md transition-transform duration-200 hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 28px -6px ${p.theme_color}66`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <Avatar name={p.name} themeColor={p.theme_color} size="lg" />
              <span className="text-lg font-medium text-slate-100">{p.name}</span>
              <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                {p.lang}
              </span>
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">Seleziona chi sei</p>

        <div className="w-full pt-1">
          <InstallAppButton variant="card" lang="it" />
        </div>
      </div>
    </div>
  )
}
