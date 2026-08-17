import { useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { downloadTextFile, exportChatAsText } from '../lib/exportChat'
import { translations, type AppLang } from '../i18n/translations'
import type { Message } from '../types'

const MESSAGE_COLUMNS =
  'id, sender_id, original_text, original_lang, translated_text, translated_lang, image_url, created_at, read_at, edited_at, deleted_at'

interface ExportButtonProps {
  lang: AppLang
}

export function ExportButton({ lang }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const t = translations[lang]

  async function handleExport() {
    if (loading) return
    setLoading(true)
    try {
      const [{ data: messages, error: messageError }, { data: profiles, error: profileError }] =
        await Promise.all([
          supabase.from('messages').select(MESSAGE_COLUMNS).order('created_at', { ascending: true }),
          supabase.from('profiles').select('id, name'),
        ])

      if (messageError) throw messageError
      if (profileError) throw profileError

      const text = exportChatAsText(
        (messages ?? []) as Message[],
        (profiles ?? []) as { id: string; name: string }[],
      )
      const today = new Date().toISOString().slice(0, 10)
      downloadTextFile(`chatlook-export-${today}.txt`, text)
    } catch (error) {
      console.error('Failed to export chat:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleExport()}
      disabled={loading}
      title={t.exportChat}
      aria-label={t.exportChat}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-sky-400" />
      ) : (
        <Download className="h-4 w-4" strokeWidth={2} />
      )}
    </button>
  )
}
