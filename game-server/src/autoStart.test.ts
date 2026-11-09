import { describe, expect, it } from 'vitest'
import { AUTO_START_MS, autoStartTick, canDeal } from './autoStart'

const NOW = 1_700_000_000_000
const lobby = { isPublic: true, phase: 'lobby' as const, now: NOW }

describe('autoStartTick', () => {
    it('runs no clock at an empty table', () => {
        expect(autoStartTick(undefined, { ...lobby, humans: 0 })).toEqual({})
    })

    it('starts a 30 second countdown when the first person sits', () => {
        expect(AUTO_START_MS).toBe(30_000)
        expect(autoStartTick(undefined, { ...lobby, humans: 1 }).at).toBe(NOW + 30_000)
    })

    it('keeps the deadline as people come and go', () => {
        const s = autoStartTick(undefined, { ...lobby, humans: 1 })
        expect(autoStartTick(s, { ...lobby, humans: 4, now: NOW + 9_000 }).at).toBe(NOW + 30_000)
        expect(autoStartTick(s, { ...lobby, humans: 2, now: NOW + 24_000 }).at).toBe(NOW + 30_000)
    })

    it('stops when the last person leaves, and starts over for the next one', () => {
        const s = autoStartTick(undefined, { ...lobby, humans: 1 })
        expect(autoStartTick(s, { ...lobby, humans: 0, now: NOW + 5_000 })).toEqual({})
        expect(autoStartTick({}, { ...lobby, humans: 1, now: NOW + 6_000 }).at).toBe(NOW + 36_000)
    })

    it('never runs in a private room or outside the lobby', () => {
        expect(autoStartTick(undefined, { ...lobby, humans: 3, isPublic: false })).toEqual({})
        expect(autoStartTick({ at: NOW }, { ...lobby, humans: 3, phase: 'playing' })).toEqual({})
    })
})

describe('canDeal', () => {
    it('deals when a person is at the table with at least one opponent', () => {
        expect(canDeal(1, 4)).toBe(true)
        expect(canDeal(2, 2)).toBe(true)
    })

    it('never deals a table with no person at it, or one seat', () => {
        expect(canDeal(0, 4)).toBe(false)
        expect(canDeal(1, 1)).toBe(false)
    })
})
