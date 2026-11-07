import { describe, expect, it } from 'vitest'
import { AUTO_START_MS, autoStartTick } from './autoStart'

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

    it('keeps the deadline while the table stays full', () => {
        const s = autoStartTick(undefined, { ...lobby, connected: 7 })
        expect(autoStartTick(s, { ...lobby, connected: 7, now: NOW + 9_000 }).at).toBe(NOW + 15_000)
    })

    it('cancels when someone leaves, and a full table again starts a fresh 15 seconds', () => {
        const s = autoStartTick(undefined, { ...lobby, connected: 7 })
        const left = autoStartTick(s, { ...lobby, connected: 6, now: NOW + 9_000 })
        expect(left).toEqual({})
        expect(autoStartTick(left, { ...lobby, connected: 7, now: NOW + 20_000 }).at).toBe(NOW + 35_000)
    })

    it('never runs in a private room or outside the lobby', () => {
        expect(autoStartTick(undefined, { ...lobby, connected: 7, isPublic: false })).toEqual({})
        expect(autoStartTick({ at: NOW }, { ...lobby, connected: 7, phase: 'playing' })).toEqual({})
    })
})
