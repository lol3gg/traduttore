import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const APP_URL_DEFAULT = 'https://traduttore-six.vercel.app'

/** VAPID keys for native Web Push (private 2-person app) */
const VAPID_PUBLIC_KEY =
  Deno.env.get('VAPID_PUBLIC_KEY') ||
  'BPgdX6Q28x3PO0PXObHluwMRI_9plHhaKnNWvsiMH5IKEHXvX054oREqc2wOKlVflhir2XgYP1AkdIWPHh_Umls'
const VAPID_PRIVATE_KEY =
  Deno.env.get('VAPID_PRIVATE_KEY') || 'FWUK7W0Urt5JORXS4VnptGEjT1qKR3rMJhYsD0c_o_E'
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:nicolacarletti6@gmail.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

interface NotifyRequest {
  message_id: string
  recipient_id: string
  text_preview: string
  sender_name: string
}

interface PushSubscriptionJSON {
  endpoint: string
  expirationTime?: number | null
  keys?: { p256dh?: string; auth?: string }
}

function truncatePreview(text: string, max = 100): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 3)}...`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as NotifyRequest
    const { message_id, recipient_id, text_preview, sender_name } = body

    if (!message_id || !recipient_id || !text_preview || !sender_name) {
      return new Response(
        JSON.stringify({
          error:
            'Missing required fields: message_id, recipient_id, text_preview, sender_name',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const appUrl = Deno.env.get('APP_URL') || APP_URL_DEFAULT

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Supabase credentials not configured')
      return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: recipient, error: recipientError } = await supabase
      .from('profiles')
      .select('push_subscription, onesignal_player_id, is_online')
      .eq('id', recipient_id)
      .maybeSingle()

    if (recipientError) {
      console.error('Failed to load recipient profile:', recipientError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to load recipient', details: recipientError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const subscription = recipient?.push_subscription as PushSubscriptionJSON | null | undefined

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'no_push_subscription',
          hint: 'Recipient must tap Attiva notifiche in the app',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const preview = truncatePreview(text_preview)
    const payload = JSON.stringify({
      title: sender_name,
      body: preview,
      url: appUrl,
      message_id,
    })

    try {
      const result = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
        payload,
        {
          TTL: 60 * 60,
          urgency: 'high',
        },
      )

      return new Response(
        JSON.stringify({
          success: true,
          statusCode: result.statusCode,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    } catch (pushError) {
      const statusCode =
        typeof pushError === 'object' &&
        pushError &&
        'statusCode' in pushError &&
        typeof (pushError as { statusCode?: number }).statusCode === 'number'
          ? (pushError as { statusCode: number }).statusCode
          : undefined

      // Gone / expired subscription — clear it
      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from('profiles')
          .update({ push_subscription: null, onesignal_player_id: null })
          .eq('id', recipient_id)
      }

      console.error('Web Push send failed:', pushError)
      return new Response(
        JSON.stringify({
          error: 'Web Push send failed',
          details: pushError instanceof Error ? pushError.message : String(pushError),
          statusCode,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
  } catch (error) {
    console.error('Unexpected error in send-notification:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
