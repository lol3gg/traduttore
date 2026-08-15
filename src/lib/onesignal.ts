import OneSignal from 'react-onesignal'

/** Provided OneSignal Web App ID */
export const ONESIGNAL_APP_ID = '1815d233-b8ca-4472-8c01-cb1a5c415cb4'

const VERIFICATION_SHOWN_KEY = 'onesignal_verification_shown'

let initialized = false
let initFailed = false
let initPromise: Promise<void> | null = null

/**
 * Web Push on iOS works only when the site is added to the Home Screen
 * (standalone PWA, iOS 16.4+). Safari browser tabs cannot receive push.
 *
 * Existing vite-plugin-pwa owns root SW scope — OneSignal uses a dedicated
 * subdirectory scope so the two workers do not collide.
 */
export async function initOneSignal(): Promise<void> {
  if (initialized || initFailed) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: import.meta.env.DEV,
        serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/push/onesignal/' },
        notifyButton: { enable: false },
      } as unknown as Parameters<typeof OneSignal.init>[0])
      initialized = true
    } catch (error) {
      initFailed = true
      // Never block the chat UI if OneSignal dashboard / site URL is misconfigured
      console.warn('OneSignal init failed (chat still works):', error)
    }
  })()

  return initPromise
}

export function hasShownVerificationDialog(): boolean {
  return localStorage.getItem(VERIFICATION_SHOWN_KEY) === '1'
}

export function markVerificationDialogShown(): void {
  localStorage.setItem(VERIFICATION_SHOWN_KEY, '1')
}

/** Permission may only be requested from the verification dialog (OneSignal web guide). */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await initOneSignal()
    if (initFailed || !initialized) return false
    const granted = await OneSignal.Notifications.requestPermission()
    return Boolean(granted)
  } catch (error) {
    console.warn('Notification permission request failed:', error)
    return false
  }
}

export function getPushSubscriptionId(): string | null {
  try {
    if (!initialized) return null
    const id = OneSignal.User.PushSubscription.id
    return id ?? null
  } catch {
    return null
  }
}

export function addPushSubscriptionChangeListener(
  listener: (subscriptionId: string | null) => void,
): () => void {
  const handler = () => {
    listener(getPushSubscriptionId())
  }

  try {
    if (!initialized) {
      handler()
      return () => undefined
    }
    OneSignal.User.PushSubscription.addEventListener('change', handler)
    handler()
    return () => {
      try {
        OneSignal.User.PushSubscription.removeEventListener('change', handler)
      } catch {
        /* ignore */
      }
    }
  } catch {
    handler()
    return () => undefined
  }
}

export async function loginOneSignalUser(externalId: string): Promise<void> {
  try {
    await initOneSignal()
    if (initFailed || !initialized) return
    await OneSignal.login(externalId)
  } catch (error) {
    console.warn('OneSignal login failed:', error)
  }
}

export async function logoutOneSignalUser(): Promise<void> {
  try {
    await initOneSignal()
    if (initFailed || !initialized) return
    await OneSignal.logout()
  } catch (error) {
    console.warn('OneSignal logout failed:', error)
  }
}
