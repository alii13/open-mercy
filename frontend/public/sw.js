// Service worker for the daily reminder, and nothing else: no fetch handler,
// so it never caches or touches a page load. Registered only once a player
// says yes to reminders (composables/useReminders.ts).

self.addEventListener('push', (event) => {
    let data = {}
    try { data = event.data ? event.data.json() : {} } catch { /* not ours */ }
    if (!data.title) return
    event.waitUntil(self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/push-icon.png',
        badge: '/push-badge.png',
        // One reminder on screen at a time; a newer one replaces it.
        tag: 'daily',
        // Chrome on Android and desktop shows it under the text; a tap on it or on the body opens the same link.
        actions: [{ action: 'play', title: 'Play now' }],
        data: { url: data.url || '/?src=push' },
    }))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = new URL(event.notification.data?.url || '/?src=push', self.location.origin).href
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const tab = open.find((c) => new URL(c.url).origin === self.location.origin)
        // navigate() rejects for a tab opened before this worker took over; open a fresh one then.
        if (tab) {
            try {
                await tab.focus()
                await tab.navigate(url)
                return
            } catch { /* fall through */ }
        }
        return self.clients.openWindow(url)
    })())
})
