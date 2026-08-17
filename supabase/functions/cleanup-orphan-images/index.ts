import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function pathFromImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = '/chat-images/'
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0] || '') || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing service config' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: rows, error: selectError } = await admin
    .from('messages')
    .select('image_url')
    .is('deleted_at', null)
    .not('image_url', 'is', null)

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const referenced = new Set(
    (rows ?? [])
      .map((row) => pathFromImageUrl(row.image_url as string | null))
      .filter((path): path is string => Boolean(path)),
  )

  const { data: profiles, error: profileError } = await admin.from('profiles').select('id')
  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const orphans: string[] = []
  for (const profile of profiles ?? []) {
    const folder = profile.id as string
    const { data: files, error: listError } = await admin.storage
      .from('chat-images')
      .list(folder, { limit: 1000 })

    if (listError) {
      console.error('Failed to list chat-images folder:', folder, listError.message)
      continue
    }

    for (const file of files ?? []) {
      if (!file.name) continue
      const path = `${folder}/${file.name}`
      if (!referenced.has(path)) orphans.push(path)
    }
  }

  let removed = 0
  if (orphans.length > 0) {
    const { data, error: removeError } = await admin.storage.from('chat-images').remove(orphans)
    if (removeError) {
      return new Response(JSON.stringify({ error: removeError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    removed = data?.length ?? orphans.length
  }

  return new Response(
    JSON.stringify({
      ok: true,
      referenced: referenced.size,
      removed,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
