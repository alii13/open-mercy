import { describe, expect, it } from 'vitest'
import {
    BOT_LADDER, dailyBot, chooseCard, chooseDiscardAllTop, chooseRouletteColor, wantsSwap,
    type BotProfile,
} from '../bot'
import { simulateGame } from '../sim'
import type { Card, Player } from '../types'

const card = (id: string, over: Partial<Card> = {}): Card =>
    ({ id, color: 'red', type: 'number', value: 5, ...over })
const seat = (id: string, hand: Card[]): Player => ({ id, name: id, hand, isEliminated: false })
const sharp: BotProfile = { id: 's', name: 'S', aggression: 0, wildDiscipline: 0, catchRate: 1, targeting: 0, skill: 1 }

describe('ladder strength dials', () => {
    it('never gets weaker as the ladder climbs', () => {
        for (let i = 1; i < BOT_LADDER.length; i++) {
            const lo = BOT_LADDER[i - 1]!
            const hi = BOT_LADDER[i]!
            const dials = (b: BotProfile) => [b.search ?? 0, b.skill ?? 0, b.catchRate]
            dials(hi).forEach((v, k) => expect(v).toBeGreaterThanOrEqual(dials(lo)[k]!))
            expect(dials(hi)).not.toEqual(dials(lo))
        }
    })

    it('keeps skill in range', () => {
        for (const b of BOT_LADDER) {
            expect(b.skill ?? 0).toBeGreaterThanOrEqual(0)
            expect(b.skill ?? 0).toBeLessThanOrEqual(1)
        }
    })
})

describe('sharp policy', () => {
    it('holds a draw card back while a plain card will do', () => {
        const d2 = card('d2', { type: 'draw2' })
        const n = card('n', { value: 3 })
        const me = seat('me', [d2, n, card('x', { color: 'blue' })])
        const ctx = { playable: [d2, n], drawStack: 0, opponents: [seat('opp', Array(7).fill(card('o')))], self: me }
        expect(chooseCard(ctx, sharp, () => 0)).toBe(n)
    })

    it('swings for the finish when the opponent is on one card', () => {
        const d2 = card('d2', { type: 'draw2' })
        const n = card('n', { value: 3 })
        const me = seat('me', [d2, n, card('x', { color: 'blue' })])
        const ctx = { playable: [d2, n], drawStack: 0, opponents: [seat('opp', [card('o')])], self: me }
        expect(chooseCard(ctx, sharp, () => 0)).toBe(d2)
    })

    it('passes a stack with the smallest legal draw', () => {
        const d4 = card('d4', { type: 'draw4' })
        const d10 = card('d10', { color: 'wild', type: 'draw10' })
        const me = seat('me', [d4, d10])
        const ctx = { playable: [d4, d10], drawStack: 4, opponents: [seat('opp', Array(7).fill(card('o')))], self: me }
        expect(chooseCard(ctx, sharp, () => 0)).toBe(d4)
    })

    it('only swaps into a smaller hand', () => {
        const big = seat('big', Array(9).fill(card('b')))
        const small = seat('small', Array(2).fill(card('s')))
        expect(wantsSwap(big, small, sharp, () => 0)).toBe(true)
        expect(wantsSwap(small, big, sharp, () => 0)).toBe(false)
    })

    it('tops a Discard All with its biggest draw', () => {
        const cards = [card('n'), card('d4', { type: 'draw4' }), card('s', { type: 'skip' })]
        expect(chooseDiscardAllTop(cards, sharp, () => 0).id).toBe('d4')
    })

    it('names the roulette colour it has seen least of', () => {
        const hand = [card('r1'), card('r2'), card('b1', { color: 'blue' }), card('g1', { color: 'green' })]
        const seen = [card('y1', { color: 'blue' })]
        expect(chooseRouletteColor(hand, sharp, () => 0, seen)).toBe('yellow')
    })
})

describe('simulated games', () => {
    it('replays identically from the same seed, lookahead included', () => {
        const a = simulateGame(42, dailyBot())
        const b = simulateGame(42, dailyBot())
        expect(a.trace.length).toBeGreaterThan(0)
        expect(b.trace).toEqual(a.trace)
        expect(b.winner).toBe(a.winner)
    }, 15_000)

    it('finishes games', () => {
        for (let seed = 1; seed <= 5; seed++) {
            expect(simulateGame(seed, BOT_LADDER[0]!).winner).not.toBe('none')
        }
    })
})
