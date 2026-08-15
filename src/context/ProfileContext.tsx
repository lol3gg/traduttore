import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { loginOneSignalUser, logoutOneSignalUser } from '../lib/onesignal'
import type { Profile } from '../types'

interface ProfileContextValue {
  profile: Profile | null
  setProfile: (profile: Profile | null) => void
  loading: boolean
  saveOneSignalSubscriptionId: (subscriptionId: string) => Promise<void>
}

const PROFILE_STORAGE_KEY = 'chat_profile_id'

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const setProfile = useCallback((next: Profile | null) => {
    if (next) {
      localStorage.setItem(PROFILE_STORAGE_KEY, next.id)
      void loginOneSignalUser(next.id)
    } else {
      localStorage.removeItem(PROFILE_STORAGE_KEY)
      void logoutOneSignalUser()
    }
    setProfileState(next)
  }, [])

  const saveOneSignalSubscriptionId = useCallback(
    async (subscriptionId: string) => {
      const profileId = profile?.id ?? localStorage.getItem(PROFILE_STORAGE_KEY)
      if (!profileId || !subscriptionId) return

      const { error } = await supabase
        .from('profiles')
        .update({ onesignal_player_id: subscriptionId })
        .eq('id', profileId)

      if (error) {
        console.warn('Failed to save onesignal_player_id:', error.message)
      }
    },
    [profile?.id],
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
          void loginOneSignalUser(data.id)
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
  }, [])

  return (
    <ProfileContext.Provider
      value={{ profile, setProfile, loading, saveOneSignalSubscriptionId }}
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
