import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

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
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()

  const { data: expired, error: selectError } = await admin
    .from('messages')
    .select('id, image_url')
    .lt('created_at', cutoff)

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const paths = [
    ...new Set(
      (expired ?? [])
        .map((row) => pathFromImageUrl(row.image_url as string | null))
        .filter((path): path is string => Boolean(path)),
    ),
  ]

  if (paths.length > 0) {
    await admin.storage.from('chat-images').remove(paths)
  }

  const { data: profiles } = await admin.from('profiles').select('id')
  for (const profile of profiles ?? []) {
    const folder = profile.id as string
    const { data: files } = await admin.storage.from('chat-images').list(folder, {
      limit: 1000,
    })
    const stale = (files ?? [])
      .filter((file) => {
        const created = file.created_at || file.updated_at
        if (!created) return false
        return new Date(created).getTime() < Date.now() - RETENTION_MS
      })
      .map((file) => `${folder}/${file.name}`)
    if (stale.length > 0) {
      await admin.storage.from('chat-images').remove(stale)
    }
  }

  const { error: deleteError, count } = await admin
    .from('messages')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      deleted_messages: count ?? expired?.length ?? 0,
      removed_files: paths.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
