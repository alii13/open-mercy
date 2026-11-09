/**
 * When the game-over screen asks about the daily reminder. Never on a first
 * visit: it rides a finished game. At most three game-overs, and either answer
 * retires it for good; the settings switch stays for anyone who changes their
 * mind. Per device, like claimSpotlight, because the browser permission is.
 */
const ASKS_KEY = 'om_reminder_asks'
const ANSWERED_KEY = 'om_reminder_answered'
const MAX_ASKS = 3

function read(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string): void {
    try { localStorage.setItem(key, value) } catch { /* private mode: settings still has the switch */ }
}

function budgetLeft(): boolean {
    return !read(ANSWERED_KEY) && Number(read(ASKS_KEY) ?? 0) < MAX_ASKS
}

/** `permission` is null where the browser cannot take push at all (iPhone outside a home-screen app). */
export function shouldAskReminder(permission: NotificationPermission | null): boolean {
    return permission === 'default' && budgetLeft()
}

/**
 * An iPhone or iPad browser tab on iOS 16.4 or later. Push exists there only
 * inside a home-screen app (Share, then Add to Home Screen), so the ask
 * explains that instead. iPadOS reports itself as a Mac; touch gives it away.
 */
export function needsHomeScreen(nav: { userAgent: string; maxTouchPoints?: number; standalone?: boolean }): boolean {
    const ua = nav.userAgent
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
    if (!ios || nav.standalone === true) return false
    const v = ua.match(/OS (\d+)_(\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/)
    if (!v) return false
    const [major, minor] = [Number(v[1]), Number(v[2])]
    return major > 16 || (major === 16 && minor >= 4)
}

/** Which ask the game-over card shows: the reminder itself, the iPhone home-screen note, or none. */
export function reminderAskKind(permission: NotificationPermission | null, iosTab: boolean): 'ask' | 'ios' | null {
    if (!budgetLeft()) return null
    if (permission === 'default') return 'ask'
    if (permission === null && iosTab) return 'ios'
    return null
}

export function markReminderAsked(): void {
    write(ASKS_KEY, String(Number(read(ASKS_KEY) ?? 0) + 1))
}

export function markReminderAnswered(): void {
    write(ANSWERED_KEY, '1')
}
