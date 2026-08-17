import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Reaction = {
  profile_id: string
  emoji: string
}

type ReactionRow = {
  id: string
  message_id: string
  profile_id: string
  emoji: string
}

export type ReactionsByMessage = Record<string, Reaction[]>

export function useReactions() {
  const [reactionsByMessage, setReactionsByMessage] = useState<ReactionsByMessage>({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('id, message_id, profile_id, emoji')

      if (cancelled || error || !data) return
      setReactionsByMessage(groupReactions(data as ReactionRow[]))
    }

    void load()

    const channel = supabase
      .channel('message-reactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [])

  const toggleReaction = useCallback(async (messageId: string, profileId: string, emoji: string) => {
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id, emoji')
      .eq('message_id', messageId)
      .eq('profile_id', profileId)
      .maybeSingle()

    if (existing?.emoji === emoji) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id)
      if (error) console.error('Failed to remove reaction:', error.message)
      return
    }

    const { error } = await supabase.from('message_reactions').upsert(
      {
        message_id: messageId,
        profile_id: profileId,
        emoji,
      },
      { onConflict: 'message_id,profile_id' },
    )

    if (error) console.error('Failed to save reaction:', error.message)
  }, [])

  return { reactionsByMessage, toggleReaction }
}

function groupReactions(rows: ReactionRow[]): ReactionsByMessage {
  const next: ReactionsByMessage = {}
  for (const row of rows) {
    const list = next[row.message_id] ?? []
    list.push({ profile_id: row.profile_id, emoji: row.emoji })
    next[row.message_id] = list
  }
  return next
}
