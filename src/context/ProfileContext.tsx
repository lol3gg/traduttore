import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { enableWebPush, type PushSubscriptionJSON } from '../lib/webPush'
import type { Profile } from '../types'

interface ProfileContextValue {
  profile: Profile | null
  setProfile: (profile: Profile | null) => void
  loading: boolean
  savePushSubscription: (subscription: PushSubscriptionJSON) => Promise<void>
}

const PROFILE_STORAGE_KEY = 'chat_profile_id'

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const savePushSubscription = useCallback(
    async (subscription: PushSubscriptionJSON) => {
      const profileId = profile?.id ?? localStorage.getItem(PROFILE_STORAGE_KEY)
      if (!profileId || !subscription?.endpoint) return

      const { error } = await supabase
        .from('profiles')
        .update({
          push_subscription: subscription,
          // Keep legacy column as endpoint marker for debugging
          onesignal_player_id: subscription.endpoint.slice(-64),
        })
        .eq('id', profileId)

      if (error) {
        console.warn('Failed to save push_subscription:', error.message)
      }
    },
    [profile?.id],
  )

  const setProfile = useCallback(
    (next: Profile | null) => {
      if (next) {
        localStorage.setItem(PROFILE_STORAGE_KEY, next.id)
        // Refresh subscription when switching profile (permission already granted)
        void enableWebPush().then((sub) => {
          if (sub) void savePushSubscription(sub)
        })
      } else {
        localStorage.removeItem(PROFILE_STORAGE_KEY)
      }
      setProfileState(next)
    },
    [savePushSubscription],
  )

  useEffect(() => {
    let cancelled = false

    async function restoreProfile() {
      const savedId = localStorage.getItem(PROFILE_STORAGE_KEY)

      if (!savedId) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, lang, theme_color, is_online, is_typing, last_seen')
          .eq('id', savedId)
          .maybeSingle()

        if (cancelled) return

        if (error || !data) {
          localStorage.removeItem(PROFILE_STORAGE_KEY)
          setProfileState(null)
        } else {
          setProfileState(data as Profile)
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            void enableWebPush().then((sub) => {
              if (sub) void savePushSubscription(sub)
            })
          }
        }
      } catch (err) {
        console.error('Failed to restore profile:', err)
        if (!cancelled) {
          localStorage.removeItem(PROFILE_STORAGE_KEY)
          setProfileState(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void restoreProfile()

    return () => {
      cancelled = true
    }
  }, [savePushSubscription])

  return (
    <ProfileContext.Provider
      value={{ profile, setProfile, loading, savePushSubscription }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}

export { PROFILE_STORAGE_KEY }
