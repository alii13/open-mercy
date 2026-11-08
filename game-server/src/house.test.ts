import { describe, expect, it } from 'vitest'
import { HOUSE_FILL, houseClockFor, housePlanAtDeal, houseStep, houseTarget, leavesTable, newHouseSeat, thinkMs, walkDelayMs } from './house'

const seq = (...xs: number[]) => {
    let i = 0
    return () => xs[i++ % xs.length]!
}

describe('houseTarget', () => {
    it('fills a table with one or more people up to four seats', () => {
        expect(HOUSE_FILL).toBe(4)
        expect(houseTarget(1)).toBe(3)
        expect(houseTarget(3)).toBe(1)
    })

    it('sits nobody at a table with no person, or four or more', () => {
        expect(houseTarget(0)).toBe(0)
        expect(houseTarget(4)).toBe(0)
        expect(houseTarget(6)).toBe(0)
    })
})

describe('houseStep', () => {
    it('moves one seat at a time toward the target', () => {
        expect(houseStep(1, 0)).toBe(1)
        expect(houseStep(1, 2)).toBe(1)
        expect(houseStep(1, 3)).toBe(0)
        expect(houseStep(3, 3)).toBe(-1)
        expect(houseStep(0, 2)).toBe(-1)
    })
})

describe('newHouseSeat', () => {
    it('looks like any guest: a generated handle, a common card back, an unsuspicious id', () => {
        const { id, seat } = newHouseSeat(Math.random, 1000)
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(seat.name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/)
        expect(['ember', 'toxic', 'ice', 'hazard']).toContain(seat.skin)
        expect(seat.joinedAt).toBe(1000)
        expect(seat.hands).toBe(0)
    })

    it('plays a beatable game without lookahead', () => {
        for (let i = 0; i < 30; i++) {
            const { dials } = newHouseSeat(Math.random, 0).seat
            expect(dials.search ?? 0).toBe(0)
            expect(dials.skill ?? 0).toBeLessThanOrEqual(0.7)
        }
    })

    it('stays for two to five hands', () => {
        expect(newHouseSeat(() => 0, 0).seat.leaveAfter).toBe(2)
        expect(newHouseSeat(() => 0.9999, 0).seat.leaveAfter).toBe(5)
    })
})

describe('leavesTable', () => {
    it('goes once it has played its hands', () => {
        const { seat } = newHouseSeat(() => 0, 0)
        expect(leavesTable({ ...seat, hands: 1 })).toBe(false)
        expect(leavesTable({ ...seat, hands: 2 })).toBe(true)
    })
})

describe('thinkMs', () => {
    const within = (pace: 'brisk' | 'rush', lo: number, hi: number) => {
        for (const r of [0, 0.05, 0.5, 0.9999]) {
            const ms = thinkMs(seq(r, r), pace)
            expect(ms).toBeGreaterThanOrEqual(lo)
            expect(ms).toBeLessThan(hi)
        }
    }

    it('takes one to four seconds on most turns', () => {
        expect(thinkMs(seq(0.5, 0), 'normal')).toBe(1100)
        expect(thinkMs(seq(0.5, 0.9999), 'normal')).toBe(3899)
    })

    it('now and then takes a long one', () => {
        expect(thinkMs(seq(0.05, 0), 'normal')).toBe(5000)
        expect(thinkMs(seq(0.05, 0.9999), 'normal')).toBe(8999)
    })

    it('plays briskly, still at a person\'s pace, when the only people left are watching', () => {
        within('brisk', 800, 1600)
    })

    it('rushes only when nobody is watching', () => {
        within('rush', 350, 700)
    })
})

describe('houseClockFor', () => {
    const house = ['h1', 'h2']

    it('runs in the lobby while seats need filling or house seats are there to idle', () => {
        expect(houseClockFor({ status: 'lobby', humans: 1, houseIds: [] })).toBe('lobby')
        expect(houseClockFor({ status: 'lobby', humans: 0, houseIds: house })).toBe('lobby')
        expect(houseClockFor({ status: 'lobby', humans: 0, houseIds: [] })).toBeNull()
        expect(houseClockFor({ status: 'lobby', humans: 5, houseIds: [] })).toBeNull()
    })

    it('belongs to the house seat on turn, so a lobby timer never carries into the game', () => {
        expect(houseClockFor({ status: 'playing', humans: 1, houseIds: house, current: { id: 'h2', isEliminated: false } })).toBe('h2')
        expect(houseClockFor({ status: 'playing', humans: 1, houseIds: house, current: { id: 'u1', isEliminated: false } })).toBeNull()
        expect(houseClockFor({ status: 'playing', humans: 1, houseIds: house, current: { id: 'h1', isEliminated: true } })).toBeNull()
    })

    it('is off once the game is over', () => {
        expect(houseClockFor({ status: 'finished', humans: 1, houseIds: house, current: { id: 'h1', isEliminated: false } })).toBeNull()
    })
})

describe('housePlanAtDeal', () => {
    it('keeps the earliest arrivals and drops the rest when people took the seats', () => {
        expect(housePlanAtDeal(['h1', 'h2', 'h3'], 3)).toEqual({ keep: ['h1'], drop: ['h2', 'h3'], add: 0 })
    })

    it('sits whoever had not walked in yet', () => {
        expect(housePlanAtDeal(['h1'], 1)).toEqual({ keep: ['h1'], drop: [], add: 2 })
    })

    it('deals no house seats at a table of four people', () => {
        expect(housePlanAtDeal(['h1'], 4)).toEqual({ keep: [], drop: ['h1'], add: 0 })
    })
})

describe('walkDelayMs', () => {
    it('spaces arrivals two and a half to four and a half seconds apart', () => {
        expect(walkDelayMs(() => 0)).toBe(2500)
        expect(walkDelayMs(() => 0.9999)).toBe(4499)
    })
})
