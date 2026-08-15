import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'

type TypingMap = Record<string, boolean>

const TYPING_TIMEOUT_MS = 2500
const TYPING_TOPIC = 'chat-typing'

async function removeTopic(name: string) {
  const topic = `realtime:${name}`
  const existing = supabase.getChannels().filter((c) => c.topic === topic)
  await Promise.all(existing.map((c) => supabase.removeChannel(c)))
}

export function useTyping(profile: Profile | null) {
  const [typingStatus, setTypingStatus] = useState<TypingMap>({})
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const profileId = profile?.id

  useEffect(() => {
    if (!profileId) return

    let cancelled = false
    let channel: RealtimeChannel | null = null

    async function setup() {
      await removeTopic(TYPING_TOPIC)
      if (cancelled) return

      channel = supabase.channel(TYPING_TOPIC, {
        config: { broadcast: { self: false } },
      })
      channelRef.current = channel

      channel
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const data = payload as { user_id?: string; is_typing?: boolean }
          if (!data.user_id || data.user_id === profileId) return

          setTypingStatus((prev) => ({
            ...prev,
            [data.user_id!]: Boolean(data.is_typing),
          }))
        })
        .subscribe()
    }

    void setup()

    return () => {
      cancelled = true

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      if (channel) {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: profileId, is_typing: false },
        })
        void supabase.removeChannel(channel)
      } else {
        void removeTopic(TYPING_TOPIC)
      }

      channelRef.current = null
    }
  }, [profileId])

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!profileId || !channelRef.current) return

      void channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: profileId,
          is_typing: isTyping,
        },
      })
    },
    [profileId],
  )

  const notifyTyping = useCallback(() => {
    if (!profileId) return

    sendTyping(true)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      sendTyping(false)
      timeoutRef.current = null
    }, TYPING_TIMEOUT_MS)
  }, [profileId, sendTyping])

  const clearTypingFor = useCallback((userId: string) => {
    setTypingStatus((prev) => {
      if (!prev[userId]) return prev
      return { ...prev, [userId]: false }
    })
  }, [])

  return { typingStatus, notifyTyping, clearTypingFor }
}
