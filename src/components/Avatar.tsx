import { themeGradient } from '../lib/color'

interface AvatarProps {
  name: string
  themeColor: string
  size?: 'sm' | 'md' | 'lg'
  isOnline?: boolean
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-11 w-11 text-base',
  lg: 'h-16 w-16 text-2xl',
} as const

const dotSizeClasses = {
  sm: 'h-2.5 w-2.5 border-[1.5px]',
  md: 'h-3 w-3 border-2',
  lg: 'h-3.5 w-3.5 border-2',
} as const

export function Avatar({ name, themeColor, size = 'md', isOnline = false }: AvatarProps) {
  const gradient = themeGradient(themeColor)

  return (
    <div className={`relative inline-flex shrink-0 ${sizeClasses[size]}`}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-display font-semibold text-white shadow-soft ring-2 ring-white/10"
        style={{
          backgroundImage: `linear-gradient(145deg, ${gradient.from}, ${gradient.to})`,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      {isOnline && (
        <span
          className={`absolute bottom-0 right-0 rounded-full bg-emerald-400 ${dotSizeClasses[size]}`}
          style={{ borderColor: '#111827', boxShadow: '0 0 0 2px #111827' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
