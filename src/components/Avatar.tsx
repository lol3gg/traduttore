interface AvatarProps {
  name: string
  themeColor: string
  size?: 'sm' | 'md' | 'lg'
  isOnline?: boolean
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-14 w-14 text-xl',
} as const

const dotSizeClasses = {
  sm: 'h-2.5 w-2.5 border-[1.5px]',
  md: 'h-3 w-3 border-2',
  lg: 'h-3.5 w-3.5 border-2',
} as const

export function Avatar({ name, themeColor, size = 'md', isOnline = false }: AvatarProps) {
  return (
    <div className={`relative inline-flex shrink-0 ${sizeClasses[size]}`}>
      <span
        className={`flex h-full w-full items-center justify-center rounded-full font-semibold text-white shadow-sm`}
        style={{ backgroundColor: themeColor }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      {isOnline && (
        <span
          className={`absolute bottom-0 right-0 rounded-full bg-emerald-500 animate-pulse ${dotSizeClasses[size]}`}
          style={{ borderColor: '#1E293B' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
