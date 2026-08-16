import type { Message, MessageDeliveryStatus } from '../types'
import type { AppLang } from '../i18n/translations'

export type TickStatus = 'pending' | 'delivered' | 'read' | 'failed'

export function getTickStatus(message: Message): TickStatus {
  const delivery = (message.delivery_status ?? 'sent') as MessageDeliveryStatus
  if (delivery === 'failed') return 'failed'
  if (delivery === 'pending' || message.id.startsWith('temp-')) return 'pending'
  if (message.read_at) return 'read'
  return 'delivered'
}

const labels = {
  it: {
    pending: 'Non ancora arrivato',
    delivered: 'Arrivato, non letto',
    read: 'Visualizzato',
    failed: 'Invio non riuscito',
  },
  ru: {
    pending: 'Ещё не доставлено',
    delivered: 'Доставлено, не прочитано',
    read: 'Просмотрено',
    failed: 'Не отправлено',
  },
} as const

function SingleCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 11"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 5.5 4.8 9.2 14.5 1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DoubleCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 11"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 5.5 4.5 9 11.5 1.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 5.5 10.7 9 18.5 1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PendingClock({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 3.6V6.2L7.8 7.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface MessageTicksProps {
  message: Message
  lang: AppLang
  /** Lighter ticks on colored “mine” bubbles */
  onColoredBubble?: boolean
}

export function MessageTicks({
  message,
  lang,
  onColoredBubble = true,
}: MessageTicksProps) {
  const status = getTickStatus(message)
  const label = labels[lang][status]

  const base =
    onColoredBubble
      ? status === 'read'
        ? 'text-[#B8F0FF]'
        : 'text-white/60'
      : status === 'read'
        ? 'text-sky-300'
        : 'text-slate-400'

  return (
    <span
      className={`inline-flex items-center ${base}`}
      title={label}
      aria-label={label}
    >
      {status === 'pending' && <PendingClock className="h-[11px] w-[11px]" />}
      {status === 'delivered' && <DoubleCheck className="h-[11px] w-[18px]" />}
      {status === 'read' && <DoubleCheck className="h-[11px] w-[18px]" />}
      {status === 'failed' && <SingleCheck className="h-[11px] w-[14px] text-red-200" />}
    </span>
  )
}
