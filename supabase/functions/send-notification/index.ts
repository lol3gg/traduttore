import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const ONESIGNAL_APP_ID = '1815d233-b8ca-4472-8c01-cb1a5c415cb4'

interface NotifyRequest {
  message_id: string
  recipient_id: string
  text_preview: string
  sender_name: string
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
    const onesignalRestKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
    const appUrl = Deno.env.get('APP_URL')
    const onesignalAppId = Deno.env.get('ONESIGNAL_APP_ID') || ONESIGNAL_APP_ID

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Supabase credentials not configured')
      return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!onesignalRestKey) {
      console.error('ONESIGNAL_REST_API_KEY is not set')
      return new Response(JSON.stringify({ error: 'OneSignal REST API key missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: recipient, error: recipientError } = await supabase
      .from('profiles')
      .select('onesignal_player_id')
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

    const subscriptionId = recipient?.onesignal_player_id as string | null | undefined

    if (!subscriptionId) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no_player_id' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const preview = truncatePreview(text_preview)

    const onesignalResponse = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${onesignalRestKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        include_subscription_ids: [subscriptionId],
        headings: { en: sender_name, it: sender_name, ru: sender_name },
        contents: { en: preview, it: preview, ru: preview },
        url: appUrl || undefined,
        data: { message_id },
      }),
    })

    if (!onesignalResponse.ok) {
      const errorBody = await onesignalResponse.text()
      console.error('OneSignal API error:', onesignalResponse.status, errorBody)
      return new Response(
        JSON.stringify({ error: 'OneSignal notification failed', details: errorBody }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const result = await onesignalResponse.json()

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Unexpected error in send-notification:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
