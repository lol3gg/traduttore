import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { translations, type AppLang } from '../i18n/translations'

interface ThemeToggleProps {
  lang?: AppLang
}

export function ThemeToggle({ lang = 'it' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const t = translations[lang]
  const isLight = theme === 'light'
  const label = isLight ? t.themeDark : t.themeLight

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
    >
      {isLight ? <Moon className="h-4 w-4" strokeWidth={2} /> : <Sun className="h-4 w-4" strokeWidth={2} />}
    </button>
  )
}
