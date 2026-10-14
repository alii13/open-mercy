/**
 * Unread arithmetic for the What's New panel and the release card.
 *
 * Pure on purpose: `localStorage` throws in a private window and wherever a
 * browser blocks site data, so all of it is caught in one place
 * (composables/useWhatsNew.ts) and never in here.
 *
 * Ids are ISO dates, so a plain string compare orders them.
 */

import type { ChangelogEntry, ChangelogCta } from '../data/changelog'
import type { Route } from './routes'

/** The highest id in the list, whatever order it is written in. */
export function newestId(entries: readonly ChangelogEntry[]): string | null {
    let newest: string | null = null
    for (const e of entries) {
        if (newest === null || e.id > newest) newest = e.id
    }
    return newest
}

/**
 * The id one step below the newest, or '' when there is nothing below it.
 *
 * '' is deliberate rather than null: stored as a last-seen id it makes every
 * entry unread (`id > ''`), while still being a real stored value, so the
 * seeding branch does not fire again on the next load.
 */
export function previousId(entries: readonly ChangelogEntry[]): string {
    const ids = entries.map(e => e.id).sort()
    return ids.length >= 2 ? ids[ids.length - 2]! : ''
}

/**
 * What to store for a browser that has no last-seen id yet.
 *
 * A brand-new visitor is caught up by definition — seed to the newest so they
 * are not met with a backlog and a stale card for features that predate them.
 *
 * A player who has been here before this feature existed is NOT caught up:
 * they have simply never had anywhere to see it. Seeding them one entry back
 * announces the current release and nothing older, which is the whole reason
 * the release card exists on the deploy that introduces it.
 */
export function seedId(entries: readonly ChangelogEntry[], hasPlayedBefore: boolean): string | null {
    return hasPlayedBefore ? previousId(entries) : newestId(entries)
}

/**
 * Entries shipped since the player last looked.
 *
 * A null `lastSeenId` means they have never been here. A first visit has no
 * "before" to catch up on, so it is caught up by definition — otherwise every
 * new player would open the site to a full backlog and a stale release card.
 */
export function unreadEntries(
    entries: readonly ChangelogEntry[],
    lastSeenId: string | null,
): ChangelogEntry[] {
    if (lastSeenId === null) return []
    return entries.filter(e => e.id > lastSeenId)
}

/**
 * True when `id` is the only thing the player has left to read.
 *
 * Closing a release card is reading that entry, so the dot must not point
 * straight back at it. A single last-seen watermark cannot mark one entry read
 * while leaving older ones unread — but when the card IS the only unread
 * entry, advancing the watermark says exactly the right thing.
 */
export function isOnlyUnread(
    entries: readonly ChangelogEntry[],
    lastSeenId: string | null,
    id: string,
): boolean {
    const unread = unreadEntries(entries, lastSeenId)
    return unread.length > 0 && unread.every(e => e.id === id)
}

export function unreadCount(
    entries: readonly ChangelogEntry[],
    lastSeenId: string | null,
): number {
    return unreadEntries(entries, lastSeenId).length
}

/**
 * The one card to show, or null.
 *
 * Only the newest loud entry is ever a candidate. Once it is dismissed nothing
 * takes its place: falling back to an older loud entry would nag rather than
 * announce.
 */
export function pendingLoud(
    entries: readonly ChangelogEntry[],
    lastSeenId: string | null,
    dismissedIds: readonly string[],
): ChangelogEntry | null {
    const unread = unreadEntries(entries, lastSeenId)
    let newest: ChangelogEntry | null = null
    for (const e of unread) {
        if (e.level !== 'loud') continue
        if (newest === null || e.id > newest.id) newest = e
    }
    if (newest === null || dismissedIds.includes(newest.id)) return null
    return newest
}

/** Follow an entry's button: an app route in place, an outside link in a new tab. */
export function followCta(
    cta: ChangelogCta,
    nav: (r: Route) => void,
    open: (url: string, target: string, features: string) => unknown = (u, t, f) => window.open(u, t, f),
    ownCode?: string | null,
): void {
    if ('href' in cta) open(cta.href, '_blank', 'noopener,noreferrer')
    else if ('ownProfile' in cta) { if (ownCode) nav({ name: 'profile', code: ownCode }) }
    else nav(cta.route)
}
