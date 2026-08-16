import { themeGradient } from '../lib/color'

interface AvatarProps {
  name: string
  themeColor: string
  size?: 'sm' | 'md' | 'lg'
  isOnline?: boolean
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-11 w-11 text-[15px]',
  lg: 'h-[4.25rem] w-[4.25rem] text-2xl',
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
        className="flex h-full w-full items-center justify-center rounded-full font-display font-bold text-white ring-1 ring-white/15"
        style={{
          backgroundImage: `linear-gradient(145deg, ${gradient.from}, ${gradient.to})`,
          boxShadow: `0 10px 24px -12px ${themeColor}99, inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      {isOnline && (
        <span
          className={`absolute bottom-0 right-0 rounded-full bg-emerald-400 ${dotSizeClasses[size]}`}
          style={{
            borderColor: '#05070d',
            boxShadow: '0 0 0 2px #05070d',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
