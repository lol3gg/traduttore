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
      <div className="flex items-center gap-1.5 text-xs font-medium text-sky-300/90">
        <span>{t.typing}</span>
        <TypingIndicator />
      </div>
    )
  }

  if (isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/90">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span>{t.online}</span>
      </div>
    )
  }

  return <p className="text-xs text-slate-500">{formatLastSeen(lastSeen, lang)}</p>
}
