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

function isPlausibleTranslation(text: string, target: Lang): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (target === 'ru') {
    if (hasCyrillic(trimmed)) return true
    return !hasLatinLetters(trimmed)
  }
  if (hasLatinLetters(trimmed)) return true
  return !hasCyrillic(trimmed)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function translateWithMyMemory(text: string, source: Lang, target: Lang): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', `${source}|${target}`)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`MyMemory ${res.status}`)
  const data = await res.json()
  const translated = String(data?.responseData?.translatedText ?? '').trim()
  if (!translated) throw new Error('Empty MyMemory')
  if (/mymemory warning/i.test(translated)) throw new Error(translated)
  return translated
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
  const chunks = data?.[0]
  if (!Array.isArray(chunks)) throw new Error('Unexpected Google Translate payload')

  const translated = chunks
    .map((part: unknown) => (Array.isArray(part) ? String(part[0] ?? '') : ''))
    .join('')
    .trim()

  if (!translated) throw new Error('Empty Google translation')
  return translated
}

type Candidate = { translated: string; via: string }

async function translateFast(
  text: string,
  source: Lang,
  target: Lang,
  deeplApiKey: string | undefined,
): Promise<Candidate> {
  const errors: string[] = []

  const attempt = async (
    label: string,
    run: () => Promise<string>,
    ms = 4500,
  ): Promise<Candidate | null> => {
    try {
      const translated = await withTimeout(run(), ms, label)
      if (isPlausibleTranslation(translated, target)) {
        return { translated, via: label }
      }
      errors.push(`${label} implausible: ${translated}`)
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return null
  }

  // MyMemory is reliable from edge IPs; Google often 429s from datacenters
  const primary: Array<Promise<Candidate | null>> = [
    attempt('mymemory', () => translateWithMyMemory(text, source, target)),
    attempt('google', () => translateWithGoogle(text, source, target), 3500),
  ]
  if (deeplApiKey) {
    primary.push(
      attempt('deepl', () => translateWithDeepL(text, source, target, deeplApiKey), 4500),
    )
  }

  const first = await new Promise<Candidate | null>((resolve) => {
    let remaining = primary.length
    let done = false

    for (const p of primary) {
      void p.then((result) => {
        if (done) return
        if (result) {
          done = true
          resolve(result)
          return
        }
        remaining -= 1
        if (remaining === 0) resolve(null)
      })
    }
  })

  if (first) return first
  throw new Error(errors.join(' | ') || 'Translation failed')
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

    let translatedText: string
    let via: string

    try {
      const result = await translateFast(
        text,
        source_lang,
        target_lang,
        Deno.env.get('DEEPL_API_KEY'),
      )
      translatedText = result.translated
      via = result.via
    } catch (err) {
      console.error('Translation failed:', err)
      return new Response(
        JSON.stringify({
          error: 'Translation failed',
          details: err instanceof Error ? err.message : String(err),
        }),
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
        via,
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
