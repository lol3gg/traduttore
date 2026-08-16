/* Handlers imported into the Workbox service worker for native Web Push */

self.addEventListener('push', (event) => {
  let data = {
    title: 'Nuovo messaggio',
    body: '',
    url: '/',
    unread_count: 1,
    soft_only: false,
  }

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() }
    }
  } catch {
    try {
      data.body = event.data ? event.data.text() : ''
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    (async () => {
      const unread = Math.max(1, Number(data.unread_count) || 1)

      if (self.registration.setAppBadge) {
        try {
          await self.registration.setAppBadge(unread)
        } catch {
          /* ignore */
        }
      }

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const focused = clients.some((client) => client.focused)

      if (focused) {
        for (const client of clients) {
          client.postMessage({
            type: 'soft-chime',
            title: data.title,
            body: data.body,
          })
        }
        return
      }

      await self.registration.showNotification(data.title || 'Nuovo messaggio', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'traduttore-message',
        renotify: true,
        data: { url: data.url || '/', unread_count: unread },
        vibrate: [80, 40, 80],
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            if (typeof client.navigate === 'function') {
              client.navigate(targetUrl)
            }
          } catch {
            /* ignore */
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'clear-badge' && self.registration.clearAppBadge) {
    event.waitUntil(self.registration.clearAppBadge().catch(() => {}))
  }
  if (data.type === 'set-badge' && self.registration.setAppBadge) {
    const count = Number(data.count) || 0
    event.waitUntil(
      (count > 0
        ? self.registration.setAppBadge(count)
        : self.registration.clearAppBadge()
      ).catch(() => {}),
    )
  }
})
