import { describe, expect, it } from 'vitest'
import { afterGame, daysBetween, liveStreak, shieldReady } from '../streak'

const s = (streak: number, lastPlayed: string | null, shieldUsedOn: string | null = null) => ({ streak, lastPlayed, shieldUsedOn })

describe('daysBetween', () => {
    it('counts calendar days, across a month end and a DST change', () => {
        expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1)
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
        expect(daysBetween('2026-07-24', '2026-07-24')).toBe(0)
    })
})

describe('liveStreak', () => {
    it('is alive the day after the last game', () => {
        expect(liveStreak(s(3, '2026-07-23'), '2026-07-24')).toEqual({ streak: 3, holding: false })
    })

    it('is held by the shield after one missed day', () => {
        expect(liveStreak(s(3, '2026-07-22'), '2026-07-24')).toEqual({ streak: 3, holding: true })
    })

    it('is dead after one missed day when the shield was spent this week', () => {
        expect(liveStreak(s(3, '2026-07-22', '2026-07-20'), '2026-07-24')).toEqual({ streak: 0, holding: false })
    })

    it('is dead after two missed days, shield or not', () => {
        expect(liveStreak(s(3, '2026-07-21'), '2026-07-24')).toEqual({ streak: 0, holding: false })
    })

    it('does not shield a one-day streak', () => {
        expect(liveStreak(s(1, '2026-07-22'), '2026-07-24')).toEqual({ streak: 0, holding: false })
    })
})

describe('shieldReady', () => {
    it('comes back seven days after it was spent', () => {
        expect(shieldReady(s(3, '2026-07-23', '2026-07-17'), '2026-07-23')).toBe(false)
        expect(shieldReady(s(3, '2026-07-23', '2026-07-17'), '2026-07-24')).toBe(true)
    })
})

describe('afterGame', () => {
    it('starts at one', () => {
        expect(afterGame(s(0, null), '2026-07-24')).toEqual(s(1, '2026-07-24'))
    })

    it('does not grow on a second game the same day', () => {
        expect(afterGame(s(3, '2026-07-24'), '2026-07-24')).toEqual(s(3, '2026-07-24'))
    })

    it('grows on the next day', () => {
        expect(afterGame(s(3, '2026-07-23'), '2026-07-24')).toEqual(s(4, '2026-07-24'))
    })

    it('spends the shield to carry the streak over a missed day', () => {
        expect(afterGame(s(3, '2026-07-22'), '2026-07-24')).toEqual(s(4, '2026-07-24', '2026-07-24'))
    })

    it('restarts after the streak died', () => {
        expect(afterGame(s(3, '2026-07-21'), '2026-07-24')).toEqual(s(1, '2026-07-24'))
    })
})
