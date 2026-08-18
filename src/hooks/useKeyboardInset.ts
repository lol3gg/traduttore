import { useEffect } from 'react'

/** Keeps --keyboard-inset in sync so composer/sheets sit above the mobile keyboard. */
export function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport

    function sync() {
      const visibleHeight = viewport?.height ?? window.innerHeight
      const offsetTop = viewport?.offsetTop ?? 0
      const inset = Math.max(0, window.innerHeight - visibleHeight - offsetTop)
      const keyboard = inset > 48 ? Math.round(inset) : 0
      root.style.setProperty('--keyboard-inset', `${keyboard}px`)
      root.classList.toggle('keyboard-open', keyboard > 0)
    }

    sync()
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)

    return () => {
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
      root.style.removeProperty('--keyboard-inset')
      root.classList.remove('keyboard-open')
    }
  }, [])
}
