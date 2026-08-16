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

function isLang(value: unknown): value is Lang {
  return value === 'it' || value === 'ru'
}

function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text)
}

function hasLatinLetters(text: string): boolean {
  return /[A-Za-zÀ-ÿ]/.test(text)
}

/** Reject junk translations (e.g. MyMemory returning Spanish for it→ru). */
function isPlausibleTranslation(text: string, target: Lang): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  // Same as source with only punctuation / numbers is ok for short noise
  if (target === 'ru') {
    if (hasCyrillic(trimmed)) return true
    // Allow non-letter content (emoji, numbers)
    return !hasLatinLetters(trimmed)
  }
  // target it: must look Italian/Latin, not Cyrillic-only wrong dump
  if (hasLatinLetters(trimmed)) return true
  return !hasCyrillic(trimmed)
}

async function translateWithDeepL(
  text: string,
  source: Lang,
  target: Lang,
  apiKey: string,
): Promise<string> {
  const endpoint = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'

  const deeplResponse = await fetch(endpoint, {
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

/**
 * Google Translate (unofficial gtx client) — reliable for it↔ru.
 * Used when DeepL is missing or fails.
 */
async function translateWithGoogle(text: string, source: Lang, target: Lang): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', source)
  url.searchParams.set('tl', target)
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Google Translate ${res.status}`)

  const data = await res.json()
  // Response shape: [[["translated","original",...], ...], ...]
  const chunks = data?.[0]
  if (!Array.isArray(chunks)) throw new Error('Unexpected Google Translate payload')

  const translated = chunks
    .map((part: unknown) => (Array.isArray(part) ? String(part[0] ?? '') : ''))
    .join('')
    .trim()

  if (!translated) throw new Error('Empty Google translation')
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

    if (!message_id || !text?.trim() || !isLang(source_lang) || !isLang(target_lang)) {
      return new Response(
        JSON.stringify({
          error:
            'Invalid request: message_id, text, and source_lang/target_lang must be it or ru only',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (source_lang === target_lang) {
      return new Response(
        JSON.stringify({ error: 'source_lang and target_lang must differ (it ↔ ru)' }),
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

    const deeplApiKey = Deno.env.get('DEEPL_API_KEY')
    let translatedText: string | null = null
    const errors: string[] = []

    if (deeplApiKey) {
      try {
        const candidate = await translateWithDeepL(
          text,
          source_lang,
          target_lang,
          deeplApiKey,
        )
        if (isPlausibleTranslation(candidate, target_lang)) {
          translatedText = candidate
        } else {
          errors.push(`DeepL implausible for ${target_lang}: ${candidate}`)
        }
      } catch (err) {
        errors.push(`DeepL: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (!translatedText) {
      try {
        const candidate = await translateWithGoogle(text, source_lang, target_lang)
        if (isPlausibleTranslation(candidate, target_lang)) {
          translatedText = candidate
        } else {
          errors.push(`Google implausible for ${target_lang}: ${candidate}`)
        }
      } catch (err) {
        errors.push(`Google: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (!translatedText) {
      console.error('Translation failed:', errors.join(' | '))
      return new Response(
        JSON.stringify({ error: 'Translation failed', details: errors }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
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
