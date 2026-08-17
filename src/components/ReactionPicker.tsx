export const QUICK_EMOJIS = [
  '❤️',
  '😂',
  '😍',
  '🥰',
  '😮',
  '😢',
  '😭',
  '😡',
  '👍',
  '👎',
  '🙏',
  '🔥',
  '🎉',
  '💯',
  '🤔',
  '😎',
  '🤗',
  '💋',
] as const

interface ReactionPickerProps {
  onPick: (emoji: string) => void
}

export function ReactionPicker({ onPick }: ReactionPickerProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 border-b border-white/8 px-3 py-2.5">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[1.35rem] transition hover:bg-[var(--hover)] active:scale-95"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
