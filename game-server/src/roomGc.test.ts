import { describe, it, expect } from 'vitest'
import { ROOM_GC_MS, PRIVATE_ROOM_GC_MS, gcWindowMs, shouldPushGc, GC_TOUCH_MIN_GAP_MS } from './roomGc'

describe('room GC window', () => {
    it('collects public rooms promptly so quick-match never serves a dead room', () => {
        expect(gcWindowMs(true)).toBe(ROOM_GC_MS)
        expect(ROOM_GC_MS).toBe(10 * 60 * 1000)
    })

    it('lets a private (invite-link) room linger so a shared link survives a join-later gap', () => {
        expect(gcWindowMs(false)).toBe(PRIVATE_ROOM_GC_MS)
        expect(PRIVATE_ROOM_GC_MS).toBe(6 * 60 * 60 * 1000)
    })

    it('keeps a private room alive long enough to span a working day gap', () => {
        // An hour was shorter than the way links actually get shared, which showed
        // up as invite links failing with "Room not found".
        expect(PRIVATE_ROOM_GC_MS).toBeGreaterThanOrEqual(4 * 60 * 60 * 1000)
    })

    it('always keeps a private room alive at least as long as a public one', () => {
        expect(gcWindowMs(false)).toBeGreaterThan(gcWindowMs(true))
    })
})

describe('pushing the GC deadline', () => {
    const now = 1_000_000

    it('writes when the room has no deadline yet, or it is never collected', () => {
        expect(shouldPushGc(undefined, now + ROOM_GC_MS)).toBe(true)
    })

    it('skips the write for a move seconds after the last one', () => {
        const stored = now + ROOM_GC_MS
        expect(shouldPushGc(stored, now + 5_000 + ROOM_GC_MS)).toBe(false)
    })

    it('writes once the gap reaches the minimum', () => {
        const stored = now + ROOM_GC_MS
        expect(shouldPushGc(stored, now + GC_TOUCH_MIN_GAP_MS + ROOM_GC_MS)).toBe(true)
    })

    // A missed alarm leaves a deadline in the past. The gap is then larger than
    // the window itself, so the room is re-armed rather than left uncollected.
    it('writes when the stored deadline has already passed', () => {
        expect(shouldPushGc(now - ROOM_GC_MS, now + ROOM_GC_MS)).toBe(true)
    })

    it('never lets a skipped write cost more than the minimum gap', () => {
        expect(GC_TOUCH_MIN_GAP_MS).toBeLessThan(ROOM_GC_MS)
        expect(GC_TOUCH_MIN_GAP_MS).toBeLessThan(PRIVATE_ROOM_GC_MS)
    })
})

