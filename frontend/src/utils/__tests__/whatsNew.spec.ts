import { describe, it, expect, vi } from 'vitest'
import { newestId, previousId, seedId, unreadEntries, unreadCount, isOnlyUnread, pendingLoud, followCta } from '../whatsNew'
import type { ChangelogEntry } from '../../data/changelog'

function entry(id: string, level: ChangelogEntry['level'] = 'quiet'): ChangelogEntry {
    return { id, level, tag: 'NEW', title: `t-${id}`, body: `b-${id}` }
}

// Newest first, the order changelog.ts is written in.
const ENTRIES: ChangelogEntry[] = [
    entry('2026-08-26', 'loud'),
    entry('2026-08-19'),
    entry('2026-08-12'),
    entry('2026-08-04', 'loud'),
]

describe('newestId', () => {
    it('returns the highest id whatever the array order', () => {
        expect(newestId(ENTRIES)).toBe('2026-08-26')
        expect(newestId([...ENTRIES].reverse())).toBe('2026-08-26')
    })

    it('returns null for an empty changelog', () => {
        expect(newestId([])).toBeNull()
    })
})

describe('previousId', () => {
    it('returns the id one step below the newest', () => {
        expect(previousId(ENTRIES)).toBe('2026-08-19')
        expect(previousId([...ENTRIES].reverse())).toBe('2026-08-19')
    })

    it("returns '' when there is nothing below the newest", () => {
        expect(previousId([entry('2026-08-26')])).toBe('')
        expect(previousId([])).toBe('')
    })
})

describe('seedId', () => {
    it('catches a brand-new visitor up, so they see no backlog', () => {
        const seed = seedId(ENTRIES, false)
        expect(seed).toBe('2026-08-26')
        expect(unreadCount(ENTRIES, seed)).toBe(0)
        expect(pendingLoud(ENTRIES, seed, [])).toBeNull()
    })

    it('leaves the newest entry unread for a player who was here before', () => {
        // The deploy that introduces What's New: nobody has a stored id yet,
        // so without this the release announces itself to no one.
        const seed = seedId(ENTRIES, true)
        expect(seed).toBe('2026-08-19')
        expect(unreadCount(ENTRIES, seed)).toBe(1)
        expect(pendingLoud(ENTRIES, seed, [])?.id).toBe('2026-08-26')
    })

    it('does not resurface anything older than the current release', () => {
        expect(unreadEntries(ENTRIES, seedId(ENTRIES, true)).map(e => e.id))
            .toEqual(['2026-08-26'])
    })

    it('makes a lone entry unread for a returning player', () => {
        const one = [entry('2026-08-26', 'loud')]
        expect(seedId(one, true)).toBe('')
        expect(unreadCount(one, '')).toBe(1)
    })
})

describe('unreadEntries', () => {
    it('returns only entries newer than the last seen id', () => {
        expect(unreadEntries(ENTRIES, '2026-08-12').map(e => e.id))
            .toEqual(['2026-08-26', '2026-08-19'])
    })

    it('returns nothing once the newest id has been seen', () => {
        expect(unreadEntries(ENTRIES, '2026-08-26')).toEqual([])
    })

    it('treats a first visit as caught up, not as everything unread', () => {
        // No stored id means the player has never been here. They have no
        // "before" to catch up on, so nothing is new to them.
        expect(unreadEntries(ENTRIES, null)).toEqual([])
    })

    it('handles an id that is older than every entry', () => {
        expect(unreadEntries(ENTRIES, '2026-01-01')).toHaveLength(4)
    })
})

describe('unreadCount', () => {
    it('counts the unread entries', () => {
        expect(unreadCount(ENTRIES, '2026-08-12')).toBe(2)
        expect(unreadCount(ENTRIES, '2026-08-26')).toBe(0)
        expect(unreadCount(ENTRIES, null)).toBe(0)
        expect(unreadCount([], '2026-08-12')).toBe(0)
    })
})

describe('isOnlyUnread', () => {
    it('is true when the card is all that is left to read', () => {
        // The common case after seeding: exactly one unread entry, and the
        // card is it. Closing the card must clear the dot too.
        expect(isOnlyUnread(ENTRIES, '2026-08-19', '2026-08-26')).toBe(true)
    })

    it('is false while other entries are still unread', () => {
        // Three unread, one of them loud. Dismissing the card must leave the
        // dot lit, because it is then telling the truth.
        expect(isOnlyUnread(ENTRIES, '2026-08-04', '2026-08-26')).toBe(false)
    })

    it('is false when nothing is unread at all', () => {
        expect(isOnlyUnread(ENTRIES, '2026-08-26', '2026-08-26')).toBe(false)
        expect(isOnlyUnread(ENTRIES, null, '2026-08-26')).toBe(false)
    })

    it('is false for an id that is not the unread one', () => {
        expect(isOnlyUnread(ENTRIES, '2026-08-19', '2026-08-04')).toBe(false)
    })
})

describe('pendingLoud', () => {
    it('returns the newest unread loud entry', () => {
        expect(pendingLoud(ENTRIES, '2026-08-12', [])?.id).toBe('2026-08-26')
    })

    it('ignores quiet entries however new they are', () => {
        const quietOnly = [entry('2026-09-01'), entry('2026-08-30')]
        expect(pendingLoud(quietOnly, '2026-08-01', [])).toBeNull()
    })

    it('returns null once the card has been dismissed', () => {
        expect(pendingLoud(ENTRIES, '2026-08-12', ['2026-08-26'])).toBeNull()
    })

    it('does not fall back to an older loud entry when the newest is dismissed', () => {
        // 2026-08-04 is loud and unread here, but showing a stale card after
        // the player dismissed the current one is nagging, not announcing.
        expect(pendingLoud(ENTRIES, '2026-01-01', ['2026-08-26'])).toBeNull()
    })

    it('shows nothing on a first visit', () => {
        expect(pendingLoud(ENTRIES, null, [])).toBeNull()
    })

    it('shows nothing when everything is read', () => {
        expect(pendingLoud(ENTRIES, '2026-08-26', [])).toBeNull()
    })
})

describe('followCta', () => {
    it('navigates inside the app for a route', () => {
        const nav = vi.fn(), open = vi.fn()
        followCta({ label: 'X', route: { name: 'badges' } }, nav, open)
        expect(nav).toHaveBeenCalledWith({ name: 'badges' })
        expect(open).not.toHaveBeenCalled()
    })

    it('opens an outside link in a new tab, not the app router', () => {
        const nav = vi.fn(), open = vi.fn()
        followCta({ label: 'JOIN', href: 'https://t.me/openmercy' }, nav, open)
        expect(open).toHaveBeenCalledWith('https://t.me/openmercy', '_blank', 'noopener,noreferrer')
        expect(nav).not.toHaveBeenCalled()
    })
})
