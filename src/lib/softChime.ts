/** Soft in-app chime when a message arrives while the chat is open. */
let sharedCtx: AudioContext | null = null
let lastChimeAt = 0

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx) sharedCtx = new AC()
  return sharedCtx
}

export function playSoftChime() {
  try {
    const nowMs = Date.now()
    if (nowMs - lastChimeAt < 700) return
    lastChimeAt = nowMs

    const ctx = getCtx()
    if (!ctx) return

    void ctx.resume()

    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.22)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.3)
  } catch {
    /* ignore autoplay / audio errors */
  }
}
