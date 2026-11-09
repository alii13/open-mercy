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
        // Chrome on Android and desktop shows these under the text. "Turn off"
        // is there so a player who has had enough can stop reminders in one
        // tap, instead of blocking the whole site.
        actions: [{ action: 'play', title: 'Play now' }, { action: 'off', title: 'Turn off' }],
        data: { url: data.url || '/?src=push' },
    }))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    // Dropping the browser's subscription is enough: the game server's next
    // send gets a 410, deletes the row and counts it as 'unsubscribed'.
    if (event.action === 'off') {
        event.waitUntil(self.registration.pushManager.getSubscription().then((s) => s && s.unsubscribe()))
        return
    }
    const url = new URL(event.notification.data?.url || '/?src=push', self.location.origin).href
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const tab = open.find((c) => new URL(c.url).origin === self.location.origin)
        // An open tab is never navigated: it may be mid-game. It is focused and
        // told, and the app opens today's deal only if the player is idle (App.vue).
        if (tab) {
            await tab.focus()
            tab.postMessage({ type: 'reminder-open', url })
            return
        }
        return self.clients.openWindow(url)
    })())
})
