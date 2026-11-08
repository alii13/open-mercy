import { describe, it, expect } from 'vitest'
import { MAX_PLAYERS, SEAT_GRACE_MS, canSeat, doorVerdict } from './seats'

function rosterOf(n: number): Record<string, unknown> {
    return Object.fromEntries(Array.from({ length: n }, (_, i) => [`u-${i}`, { name: `P${i}` }]))
}

describe('canSeat', () => {
    it('caps the room at MAX_PLAYERS', () => {
        expect(MAX_PLAYERS).toBe(20)
        expect(canSeat(rosterOf(MAX_PLAYERS), 'u-new')).toBe(false)
    })

    it('seats a new player while the room has space', () => {
        expect(canSeat(rosterOf(MAX_PLAYERS - 1), 'u-new')).toBe(true)
        expect(canSeat({}, 'u-new')).toBe(true)
    })

    it('always lets an already-seated player back in, even at the cap', () => {
        expect(canSeat(rosterOf(MAX_PLAYERS), 'u-0')).toBe(true)
    })
})

describe('doorVerdict', () => {
    const NOW = 1_700_000_000_000
    const seven = Object.keys(rosterOf(7))
    const base = { isPublic: true, phase: 'lobby' as const, now: NOW, goneAt: {} as Record<string, number> }
    const live = (except: string[] = []) => seven.filter((id) => !except.includes(id))

    it('lets a seated player back in, even at a full table', () => {
        expect(doorVerdict({ ...base, userId: 'u-3', rosterIds: seven, liveIds: seven })).toEqual({ seat: true })
    })

    it('seats a stranger while the table has room', () => {
        expect(doorVerdict({ ...base, userId: 'new', rosterIds: seven.slice(0, 6), liveIds: seven.slice(0, 6) })).toEqual({ seat: true })
    })

    it('keeps a dropped player\'s seat for the grace period', () => {
        const goneAt = { 'u-2': NOW - SEAT_GRACE_MS + 1000 }
        expect(doorVerdict({ ...base, goneAt, userId: 'new', rosterIds: seven, liveIds: live(['u-2']) })).toEqual({ seat: false })
    })

    it('hands the seat on once they have been gone longer than that', () => {
        const goneAt = { 'u-2': NOW - SEAT_GRACE_MS - 1 }
        expect(doorVerdict({ ...base, goneAt, userId: 'new', rosterIds: seven, liveIds: live(['u-2']) })).toEqual({ seat: true, evict: 'u-2' })
    })

    it('treats a seat with no record of when it emptied as long gone (the room hibernated)', () => {
        expect(doorVerdict({ ...base, userId: 'new', rosterIds: seven, liveIds: live(['u-5']) })).toEqual({ seat: true, evict: 'u-5' })
    })

    it('never hands on a seat in a private room or a running game', () => {
        expect(doorVerdict({ ...base, isPublic: false, userId: 'new', rosterIds: Object.keys(rosterOf(MAX_PLAYERS)), liveIds: [] })).toEqual({ seat: false })
        expect(doorVerdict({ ...base, phase: 'playing', userId: 'new', rosterIds: seven, liveIds: live(['u-1']) })).toEqual({ seat: false })
    })
})
