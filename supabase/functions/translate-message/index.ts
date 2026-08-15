import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Lang = 'it' | 'ru'

interface TranslateRequest {
  message_id: string
  text: string
  source_lang: Lang
  target_lang: Lang
}

async function translateWithDeepL(
  text: string,
  source: Lang,
  target: Lang,
  apiKey: string,
): Promise<string> {
  const deeplResponse = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: source.toUpperCase(),
      target_lang: target.toUpperCase(),
    }),
  })

  if (!deeplResponse.ok) {
    const errorBody = await deeplResponse.text()
    throw new Error(`DeepL ${deeplResponse.status}: ${errorBody}`)
  }

  const deeplData = await deeplResponse.json()
  const translated = deeplData?.translations?.[0]?.text as string | undefined
  if (!translated) throw new Error('Empty DeepL translation')
  return translated
}

/** Free fallback so chat works even without DEEPL_API_KEY */
async function translateWithMyMemory(
  text: string,
  source: Lang,
  target: Lang,
): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', `${source}|${target}`)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`MyMemory ${res.status}`)
  const data = await res.json()
  const translated = data?.responseData?.translatedText as string | undefined
  if (!translated) throw new Error('Empty MyMemory translation')
  return translated
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

    const body = (await req.json()) as TranslateRequest
    const { message_id, text, source_lang, target_lang } = body

    if (!message_id || !text?.trim() || !source_lang || !target_lang) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: message_id, text, source_lang, target_lang',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
      return new Response(JSON.stringify({ error: 'Supabase credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let translatedText: string
    const deeplApiKey = Deno.env.get('DEEPL_API_KEY')

    try {
      if (deeplApiKey) {
        translatedText = await translateWithDeepL(
          text,
          source_lang,
          target_lang,
          deeplApiKey,
        )
      } else {
        console.warn('DEEPL_API_KEY missing — using MyMemory fallback')
        translatedText = await translateWithMyMemory(text, source_lang, target_lang)
      }
    } catch (primaryError) {
      console.error('Primary translate failed, trying MyMemory:', primaryError)
      try {
        translatedText = await translateWithMyMemory(text, source_lang, target_lang)
      } catch (fallbackError) {
        console.error('All translation providers failed:', fallbackError)
        return new Response(JSON.stringify({ error: 'Translation failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { error: updateError } = await supabase
      .from('messages')
      .update({
        translated_text: translatedText,
        translated_lang: target_lang,
      })
      .eq('id', message_id)

    if (updateError) {
      console.error('Failed to update message:', updateError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to save translation', details: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id,
        translated_text: translatedText,
        translated_lang: target_lang,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Unexpected error in translate-message:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
