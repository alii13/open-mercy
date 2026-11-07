import { describe, expect, it } from 'vitest'
import { AUTO_START_MS, autoStartTick, canDeal } from './autoStart'

const NOW = 1_700_000_000_000
const lobby = { isPublic: true, phase: 'lobby' as const, now: NOW }

describe('autoStartTick', () => {
    it('runs no clock while the table fills', () => {
        for (const connected of [1, 2, 6]) expect(autoStartTick(undefined, { ...lobby, connected })).toEqual({})
    })

    it('starts a 15 second countdown when the seventh player sits', () => {
        expect(AUTO_START_MS).toBe(15_000)
        expect(autoStartTick(undefined, { ...lobby, connected: 7 }).at).toBe(NOW + 15_000)
    })

    it('locks the seven in: someone leaving never stops or moves the countdown', () => {
        const s = autoStartTick(undefined, { ...lobby, connected: 7 })
        expect(autoStartTick(s, { ...lobby, connected: 6, now: NOW + 9_000 }).at).toBe(NOW + 15_000)
        expect(autoStartTick(s, { ...lobby, connected: 1, now: NOW + 12_000 }).at).toBe(NOW + 15_000)
    })

    it('never runs in a private room or outside the lobby', () => {
        expect(autoStartTick(undefined, { ...lobby, connected: 7, isPublic: false })).toEqual({})
        expect(autoStartTick({ at: NOW }, { ...lobby, connected: 7, phase: 'playing' })).toEqual({})
    })
})

describe('canDeal', () => {
    it('deals with whoever is still at the table, down to two', () => {
        expect(canDeal(7)).toBe(true)
        expect(canDeal(2)).toBe(true)
    })

    it('cannot deal a game to one player', () => {
        expect(canDeal(1)).toBe(false)
        expect(canDeal(0)).toBe(false)
    })
})
