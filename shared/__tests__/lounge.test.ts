import { describe, expect, it } from 'vitest'
import { cleanLoungeAct, seatSpot, LOUNGE_TABLE } from '../lounge'

describe('cleanLoungeAct: what the room relays from one player to the rest', () => {
    it('keeps a move and drops anything else in the frame', () => {
        expect(cleanLoungeAct({ kind: 'move', x: 1.5, z: -0.5, drag: true, extra: 'x' })).toEqual({ kind: 'move', x: 1.5, z: -0.5, drag: true })
    })

    it('refuses a move that is not two finite numbers', () => {
        expect(cleanLoungeAct({ kind: 'move', x: Number.NaN, z: 0 })).toBeNull()
        expect(cleanLoungeAct({ kind: 'move', x: '1', z: 0 })).toBeNull()
        expect(cleanLoungeAct({ kind: 'move', x: 1 })).toBeNull()
    })

    it('clamps a move onto the table', () => {
        expect(cleanLoungeAct({ kind: 'move', x: 99, z: -99 })).toEqual({ kind: 'move', x: LOUNGE_TABLE.rx, z: -LOUNGE_TABLE.rz, drag: false })
    })

    it('keeps a flick path, its hit and where along the path it lands', () => {
        const act = cleanLoungeAct({ kind: 'flick', path: [[0, 0], [1, 1], [2, 0]], hit: 'user-1', hitAt: 1 })
        expect(act).toEqual({ kind: 'flick', path: [[0, 0], [1, 1], [2, 0]], hit: 'user-1', hitAt: 1 })
    })

    it('refuses a flick path that is too short, too long or not numbers', () => {
        expect(cleanLoungeAct({ kind: 'flick', path: [[0, 0]] })).toBeNull()
        expect(cleanLoungeAct({ kind: 'flick', path: Array.from({ length: 40 }, () => [0, 0]) })).toBeNull()
        expect(cleanLoungeAct({ kind: 'flick', path: [[0, 0], [1, Number.POSITIVE_INFINITY]] })).toBeNull()
    })

    it('drops a hit that does not name a seat on the path', () => {
        expect(cleanLoungeAct({ kind: 'flick', path: [[0, 0], [1, 1]], hit: 'user-1', hitAt: 5 })).toEqual({ kind: 'flick', path: [[0, 0], [1, 1]] })
        expect(cleanLoungeAct({ kind: 'flick', path: [[0, 0], [1, 1]], hit: '<b>', hitAt: 1 })).toEqual({ kind: 'flick', path: [[0, 0], [1, 1]] })
    })

    it('only relays a draw of a card the table knows', () => {
        expect(cleanLoungeAct({ kind: 'draw', face: 'wild-ten-draw' })).toEqual({ kind: 'draw', face: 'wild-ten-draw' })
        expect(cleanLoungeAct({ kind: 'draw', face: '__proto__' })).toBeNull()
    })

    it('refuses anything else', () => {
        expect(cleanLoungeAct(null)).toBeNull()
        expect(cleanLoungeAct({ kind: 'emote', text: 'hi' })).toBeNull()
        expect(cleanLoungeAct('move')).toBeNull()
    })
})

describe('seatSpot: where a player stands before they first move', () => {
    it('gives every client the same spot for the same seat', () => {
        expect(seatSpot(2, 5)).toEqual(seatSpot(2, 5))
    })

    it('spreads seats apart and keeps them on the table', () => {
        const spots = Array.from({ length: 7 }, (_, i) => seatSpot(i, 7))
        for (const [x, z] of spots) expect((x / LOUNGE_TABLE.rx) ** 2 + (z / LOUNGE_TABLE.rz) ** 2).toBeLessThan(1)
        const gaps = spots.flatMap(([ax, az], i) => spots.slice(i + 1).map(([bx, bz]) => Math.hypot(ax - bx, az - bz)))
        expect(Math.min(...gaps)).toBeGreaterThan(1)
    })
})
