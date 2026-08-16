export function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-sky-300/90" />
      <span className="h-1.5 w-1.5 animate-bounce-dot-delay-1 rounded-full bg-sky-300/90" />
      <span className="h-1.5 w-1.5 animate-bounce-dot-delay-2 rounded-full bg-sky-300/90" />
    </span>
  )
}
