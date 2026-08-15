import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'

type OnlineMap = Record<string, boolean>

const PRESENCE_TOPIC = 'chat-presence'

function presenceToOnlineMap(
  state: Record<string, Array<{ user_id?: string }>>,
): OnlineMap {
  const next: OnlineMap = {}

  for (const [key, presences] of Object.entries(state)) {
    const online = Array.isArray(presences) && presences.length > 0
    if (!online) continue

    const userId = (presences[0]?.user_id as string | undefined) ?? key
    next[userId] = true
  }

  return next
}

async function removeTopic(name: string) {
  const topic = `realtime:${name}`
  const existing = supabase.getChannels().filter((c) => c.topic === topic)
  await Promise.all(existing.map((c) => supabase.removeChannel(c)))
}

export function usePresence(profile: Profile | null) {
  const [onlineStatus, setOnlineStatus] = useState<OnlineMap>({})
  const profileId = profile?.id

  useEffect(() => {
    if (!profileId) return

    let cancelled = false
    let channel: RealtimeChannel | null = null

    const markOnline = async (userId: string) => {
      await supabase.from('profiles').update({ is_online: true }).eq('id', userId)
    }

    const markOffline = async (userId: string) => {
      await supabase
        .from('profiles')
        .update({
          is_online: false,
          last_seen: new Date().toISOString(),
        })
        .eq('id', userId)
    }

    async function setup() {
      // Must await: supabase.channel() reuses an existing subscribed channel
      await removeTopic(PRESENCE_TOPIC)
      if (cancelled) return

      channel = supabase.channel(PRESENCE_TOPIC, {
        config: {
          presence: {
            key: profileId!,
          },
        },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          if (!channel) return
          setOnlineStatus(presenceToOnlineMap(channel.presenceState()))
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          const userId =
            (newPresences[0] as { user_id?: string } | undefined)?.user_id ?? key

          setOnlineStatus((prev) => ({ ...prev, [userId]: true }))

          if (userId === profileId) {
            void markOnline(profileId!)
          }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          const userId =
            (leftPresences[0] as { user_id?: string } | undefined)?.user_id ?? key

          setOnlineStatus((prev) => {
            const next = { ...prev }
            next[userId] = false
            return next
          })

          void markOffline(userId)
        })
        .subscribe(async (status) => {
          if (cancelled || !channel) return
          if (status === 'SUBSCRIBED') {
            await channel.track({
              user_id: profileId,
              online_at: new Date().toISOString(),
            })
            await markOnline(profileId!)
          }
        })
    }

    void setup()

    return () => {
      cancelled = true
      if (channel) {
        void supabase.removeChannel(channel)
      } else {
        void removeTopic(PRESENCE_TOPIC)
      }
      void markOffline(profileId)
    }
  }, [profileId])

  const isOnline = useCallback(
    (id: string) => Boolean(onlineStatus[id]),
    [onlineStatus],
  )

  return { onlineStatus, isOnline }
}
