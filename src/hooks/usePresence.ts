import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'

type OnlineMap = Record<string, boolean>

type DbPresence = {
  is_online: boolean
  last_seen: string
}

const PRESENCE_TOPIC = 'chat-presence'
const HEARTBEAT_MS = 12_000
const ONLINE_TTL_MS = 40_000
const HIDE_OFFLINE_MS = 1_500
const CLEANUP_OFFLINE_MS = 500
const CLOCK_MS = 5_000

function presenceToOnlineMap(state: Record<string, unknown>): OnlineMap {
  const next: OnlineMap = {}

  for (const [key, raw] of Object.entries(state)) {
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    if (list.length === 0) continue

    for (const entry of list as Array<{ user_id?: string }>) {
      const userId = entry?.user_id ?? key
      if (userId) next[userId] = true
    }
  }

  return next
}

function isFreshOnline(row: DbPresence | undefined, now = Date.now()): boolean {
  if (!row?.is_online || !row.last_seen) return false
  const seen = new Date(row.last_seen).getTime()
  if (Number.isNaN(seen)) return false
  return now - seen < ONLINE_TTL_MS
}

async function markOnlineDb(userId: string) {
  await supabase
    .from('profiles')
    .update({
      is_online: true,
      last_seen: new Date().toISOString(),
    })
    .eq('id', userId)
}

function markOfflineDb(userId: string, { keepalive = false } = {}) {
  const body = JSON.stringify({
    is_online: false,
    last_seen: new Date().toISOString(),
  })

  if (keepalive && supabaseUrl && supabaseAnonKey) {
    void fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
      keepalive: true,
    })
    return
  }

  void supabase
    .from('profiles')
    .update({
      is_online: false,
      last_seen: new Date().toISOString(),
    })
    .eq('id', userId)
}

export function usePresence(profile: Profile | null) {
  const [presenceOnline, setPresenceOnline] = useState<OnlineMap>({})
  const [dbStatus, setDbStatus] = useState<Record<string, DbPresence>>({})
  const [now, setNow] = useState(() => Date.now())
  const profileId = profile?.id
  const channelRef = useRef<RealtimeChannel | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const activeProfileIdRef = useRef<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const isOnline = useCallback(
    (id: string) => Boolean(presenceOnline[id]) || isFreshOnline(dbStatus[id], now),
    [presenceOnline, dbStatus, now],
  )

  const lastSeenOf = useCallback(
    (id: string) => dbStatus[id]?.last_seen,
    [dbStatus],
  )

  useEffect(() => {
    if (!profileId) return
    const userId = profileId

    const gen = ++generationRef.current
    activeProfileIdRef.current = userId

    let cancelled = false
    let channel: RealtimeChannel | null = null
    let heartbeat: number | null = null

    async function goOnline() {
      if (cancelled || !channel) return
      try {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        })
      } catch {
        /* ignore */
      }
      await markOnlineDb(userId)
    }

    function goOffline(keepalive = false) {
      if (channel) {
        void channel.untrack()
      }
      markOfflineDb(userId, { keepalive })
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
        void goOnline()
        return
      }

      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => {
        goOffline(true)
        hideTimerRef.current = null
      }, HIDE_OFFLINE_MS)
    }

    function onPageHide() {
      goOffline(true)
    }

    async function setup() {
      const existing = supabase
        .getChannels()
        .filter((c) => c.topic === `realtime:${PRESENCE_TOPIC}`)
      await Promise.all(existing.map((c) => supabase.removeChannel(c)))
      if (cancelled) return

      const { data: rows } = await supabase
        .from('profiles')
        .select('id, is_online, last_seen')

      if (!cancelled && rows) {
        const next: Record<string, DbPresence> = {}
        for (const row of rows as Array<{ id: string; is_online: boolean; last_seen: string }>) {
          next[row.id] = { is_online: Boolean(row.is_online), last_seen: row.last_seen }
        }
        setDbStatus(next)
      }

      channel = supabase.channel(PRESENCE_TOPIC, {
        config: {
          presence: { key: userId },
        },
      })
      channelRef.current = channel

      channel
        .on('presence', { event: 'sync' }, () => {
          if (!channel) return
          setPresenceOnline(presenceToOnlineMap(channel.presenceState()))
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          const userId =
            (newPresences[0] as { user_id?: string } | undefined)?.user_id ?? key
          if (!userId) return
          setPresenceOnline((prev) => ({ ...prev, [userId]: true }))
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          const userId =
            (leftPresences[0] as { user_id?: string } | undefined)?.user_id ?? key
          if (!userId) return
          setPresenceOnline((prev) => ({ ...prev, [userId]: false }))
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles' },
          (payload) => {
            const row = payload.new as { id: string; is_online?: boolean; last_seen?: string }
            if (!row?.id) return
            setDbStatus((prev) => ({
              ...prev,
              [row.id]: {
                is_online: Boolean(row.is_online),
                last_seen: row.last_seen ?? prev[row.id]?.last_seen ?? new Date().toISOString(),
              },
            }))
          },
        )
        .subscribe(async (status) => {
          if (cancelled || !channel) return
          if (status === 'SUBSCRIBED') {
            await goOnline()
          }
        })

      heartbeat = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        void goOnline()
      }, HEARTBEAT_MS)
    }

    void setup()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    window.addEventListener('online', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
      window.removeEventListener('online', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      if (heartbeat) window.clearInterval(heartbeat)

      const leavingId = userId
      window.setTimeout(() => {
        const remountedSameUser =
          generationRef.current !== gen && activeProfileIdRef.current === leavingId
        if (remountedSameUser) return
        markOfflineDb(leavingId, { keepalive: true })
      }, CLEANUP_OFFLINE_MS)

      if (channel) {
        void channel.untrack()
        void supabase.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [profileId])

  return { isOnline, lastSeenOf }
}
