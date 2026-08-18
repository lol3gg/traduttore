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
const PROFILE_CACHE_KEY = 'chatlook_profile'

function readCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Profile
    if (!parsed?.id || !parsed?.name) return null
    return parsed
  } catch {
    return null
  }
}

function writeCachedProfile(profile: Profile | null) {
  try {
    if (profile) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
    else localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(() => readCachedProfile())
  const [loading, setLoading] = useState(() => {
    if (readCachedProfile()) return false
    return Boolean(localStorage.getItem(PROFILE_STORAGE_KEY))
  })

  const savePushSubscription = useCallback(
    async (subscription: PushSubscriptionJSON) => {
      const profileId = profile?.id ?? localStorage.getItem(PROFILE_STORAGE_KEY)
      if (!profileId || !subscription?.endpoint) return

      const { error } = await supabase
        .from('profiles')
        .update({
          push_subscription: subscription,
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
        writeCachedProfile(next)
        // Refresh subscription when switching profile (permission already granted)
        void enableWebPush().then((sub) => {
          if (sub) void savePushSubscription(sub)
        })
      } else {
        localStorage.removeItem(PROFILE_STORAGE_KEY)
        writeCachedProfile(null)
      }
      setProfileState(next)
    },
    [savePushSubscription],
  )

  useEffect(() => {
    let cancelled = false
    let pushTimer: number | undefined

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

        if (error) {
          console.warn('Failed to restore profile:', error.message)
          return
        }

        if (!data) {
          localStorage.removeItem(PROFILE_STORAGE_KEY)
          writeCachedProfile(null)
          setProfileState(null)
        } else {
          setProfileState(data as Profile)
          writeCachedProfile(data as Profile)
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            pushTimer = window.setTimeout(() => {
              void enableWebPush().then((sub) => {
                if (sub) void savePushSubscription(sub)
              })
            }, 2500)
          }
        }
      } catch (err) {
        console.error('Failed to restore profile:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void restoreProfile()

    return () => {
      cancelled = true
      if (pushTimer) window.clearTimeout(pushTimer)
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
