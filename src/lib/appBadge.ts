/** Home-screen icon badge (PWA / installed app). */

export async function setUnreadBadge(count: number) {
  try {
    if (!('setAppBadge' in navigator)) return
    if (count > 0) {
      await navigator.setAppBadge(count)
    } else {
      await navigator.clearAppBadge()
    }
  } catch {
    /* unsupported / permission */
  }
}

export async function clearUnreadBadge() {
  await setUnreadBadge(0)
}
