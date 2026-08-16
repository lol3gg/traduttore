/** VAPID public key (safe to expose in the browser) */
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BPgdX6Q28x3PO0PXObHluwMRI_9plHhaKnNWvsiMH5IKEHXvX054oREqc2wOKlVflhir2XgYP1AkdIWPHh_Umls'

const PROMPT_SHOWN_KEY = 'web_push_prompt_shown'

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export function hasShownPushPrompt(): boolean {
  return localStorage.getItem(PROMPT_SHOWN_KEY) === '1'
}

export function markPushPromptShown(): void {
  localStorage.setItem(PROMPT_SHOWN_KEY, '1')
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Wait for the PWA service worker that will receive push events. */
async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * Request permission and create a Web Push subscription bound to the PWA SW.
 */
export async function enableWebPush(): Promise<PushSubscriptionJSON | null> {
  if (!isWebPushSupported()) {
    console.warn('Web Push not supported in this browser')
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('Notification permission not granted:', permission)
    return null
  }

  const registration = await getReadyRegistration()
  if (!registration) {
    console.warn('Service worker not ready for push')
    return null
  }

  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    return existing.toJSON() as PushSubscriptionJSON
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  })

  return subscription.toJSON() as PushSubscriptionJSON
}
