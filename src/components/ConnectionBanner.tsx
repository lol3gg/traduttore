import { translations, type AppLang } from '../i18n/translations'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

interface ConnectionBannerProps {
  lang: AppLang
}

export function ConnectionBanner({ lang }: ConnectionBannerProps) {
  const { isOnline } = useOnlineStatus()
  const t = translations[lang]

  if (isOnline) return null

  return (
    <div
      role="status"
      className="animate-slide-down bg-amber-600/90 px-3 py-1.5 text-center text-[12px] font-medium text-amber-50"
    >
      {t.connectionLost}
    </div>
  )
}
