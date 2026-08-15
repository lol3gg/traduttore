import { formatLastSeen } from '../lib/formatLastSeen'
import { translations, type AppLang } from '../i18n/translations'
import { TypingIndicator } from './TypingIndicator'

interface OnlineStatusProps {
  isOnline: boolean
  isTyping: boolean
  lastSeen: string
  lang: AppLang
}

export function OnlineStatus({ isOnline, isTyping, lastSeen, lang }: OnlineStatusProps) {
  const t = translations[lang]

  if (isTyping) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span>{t.typing}</span>
        <TypingIndicator />
      </div>
    )
  }

  if (isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>{t.online}</span>
      </div>
    )
  }

  return <p className="text-xs text-slate-500">{formatLastSeen(lastSeen, lang)}</p>
}
