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

/** `permission` is null where the browser cannot take push at all (iPhone outside a home-screen app). */
export function shouldAskReminder(permission: NotificationPermission | null): boolean {
    if (permission !== 'default') return false
    if (read(ANSWERED_KEY)) return false
    return Number(read(ASKS_KEY) ?? 0) < MAX_ASKS
}

export function markReminderAsked(): void {
    write(ASKS_KEY, String(Number(read(ASKS_KEY) ?? 0) + 1))
}

export function markReminderAnswered(): void {
    write(ANSWERED_KEY, '1')
}
