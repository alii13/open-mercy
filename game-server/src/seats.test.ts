import { describe, it, expect } from 'vitest'
import { MAX_COUCH_PLAYERS, MAX_PLAYERS, canSeat, canSeatCouch } from './seats'

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

describe('canSeatCouch', () => {
    it('caps Couch Mode at eight while preserving reconnects', () => {
        expect(MAX_COUCH_PLAYERS).toBe(8)
        expect(canSeatCouch(rosterOf(8), 'u-new')).toBe(false)
        expect(canSeatCouch(rosterOf(8), 'u-0')).toBe(true)
    })
})
