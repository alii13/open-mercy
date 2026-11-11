import { describe, it, expect } from 'vitest'
import { promotionHistory } from '../promotions'
import { POINT_WEIGHTS, badgeFor, pointsFromRows } from '../badges'
import type { ResultRow } from '../gameStats'

function row(overrides: Partial<ResultRow>): ResultRow {
    return {
        result: 'lost',
        game_id: 'bot-1',
        cards_remaining: 3,
        peak_cards: 9,
        draw_cards_played: 0,
        wild_cards_played: 0,
        cards_played_total: 25,
        skips_dealt: 0,
        swaps_made: 0,
        draws_taken: 0,
        biggest_stack_survived: 0,
        uno_calls: 0,
        uno_penalties: 0,
        game_duration_secs: 200,
        is_bot_game: true,
        played_at: '2026-07-01T00:00:00Z',
        ...overrides,
    }
}

/** A win on a given UTC day, worth `win + dayPlayed` the first time that day
 *  appears (100 + 25 = 125) and `win` (100) on a day already counted. */
function winOn(day: string): ResultRow {
    return row({ result: 'won', played_at: `${day}T12:00:00Z` })
}

describe('promotionHistory', () => {
    it('is empty for a player who has never finished a game', () => {
        expect(promotionHistory([])).toEqual([])
    })

    it('awards Recruit on the first game', () => {
        const history = promotionHistory([winOn('2026-06-02')])
        expect(history[0]!.badge.title).toBe('Recruit')
        expect(history[0]!.at).toBe('2026-06-02T12:00:00Z')
        expect(history[0]!.daysSincePrevious).toBeNull()
    })

    it('records the game that crossed each threshold, in ascending order', () => {
        // 125 points per fresh-day win. Scrapper (250) lands on the 2nd,
        // Enforcer (600) on the 5th.
        const rows = [
            winOn('2026-06-02'),
            winOn('2026-06-03'),
            winOn('2026-06-04'),
            winOn('2026-06-05'),
            winOn('2026-06-06'),
        ]
        const history = promotionHistory(rows)
        expect(history.map(p => p.badge.title)).toEqual(['Recruit', 'Scrapper', 'Enforcer'])
        expect(history[1]!.at).toBe('2026-06-03T12:00:00Z')
        expect(history[2]!.at).toBe('2026-06-06T12:00:00Z')
    })

    it('reports whole days between promotions', () => {
        const rows = [winOn('2026-06-02'), winOn('2026-06-09')]
        const history = promotionHistory(rows)
        expect(history[1]!.badge.title).toBe('Scrapper')
        expect(history[1]!.daysSincePrevious).toBe(7)
    })

    it('accepts rows newest-first, as the stats query returns them', () => {
        const ascending = [winOn('2026-06-02'), winOn('2026-06-03')]
        const descending = [...ascending].reverse()
        expect(promotionHistory(descending)).toEqual(promotionHistory(ascending))
    })

    it('emits every tier a single big game vaults through, at that one moment', () => {
        // One monstrous game: enough draw cards to clear Scrapper and Enforcer
        // together, so both promotions share the crossing game's timestamp.
        const rows = [
            row({
                result: 'won',
                played_at: '2026-06-02T12:00:00Z',
                draw_cards_played: 300, // 600 points
            }),
        ]
        const history = promotionHistory(rows)
        expect(history.map(p => p.badge.title)).toEqual(['Recruit', 'Scrapper', 'Enforcer'])
        expect(history.every(p => p.at === '2026-06-02T12:00:00Z')).toBe(true)
        expect(history[1]!.daysSincePrevious).toBe(0)
    })

    it('ignores walkover wins the points formula also refuses to count', () => {
        // cards_played_total below the MIN_PLAYS guard: no win points, so the
        // player never leaves Recruit however many walkovers they collect.
        const walkovers = Array.from({ length: 5 }, (_, i) =>
            row({ result: 'won', cards_played_total: 1, is_bot_game: false, played_at: `2026-06-0${i + 2}T12:00:00Z` }),
        )
        const history = promotionHistory(walkovers)
        expect(history.map(p => p.badge.title)).toEqual(['Recruit'])
    })

    it('never regresses: promotions only ever climb the ladder', () => {
        const rows = Array.from({ length: 40 }, (_, i) =>
            winOn(`2026-06-${String((i % 28) + 1).padStart(2, '0')}`),
        )
        const tiers = promotionHistory(rows).map(p => p.badge.tier)
        expect(tiers).toEqual([...tiers].sort((a, b) => a - b))
        expect(new Set(tiers).size).toBe(tiers.length)
    })

    it('skips rows with an unusable played_at rather than dating a promotion NaN', () => {
        const rows = [row({ result: 'won', played_at: '' }), winOn('2026-06-02')]
        const history = promotionHistory(rows)
        expect(history).toHaveLength(1)
        expect(history[0]!.at).toBe('2026-06-02T12:00:00Z')
    })

    it('lands on the same badge pointsFromRows does, over a varied history', () => {
        // The replay keeps its own running aggregate, so it could drift from
        // aggregateRows. This pins the two together the way the repo pins the
        // SQL and TS points formulas.
        const rows: ResultRow[] = [
            winOn('2026-06-02'),
            row({ result: 'lost', played_at: '2026-06-02T18:00:00Z', draw_cards_played: 4 }),
            row({ result: 'won', played_at: '2026-06-05T10:00:00Z', biggest_stack_survived: 12, uno_calls: 3 }),
            row({ result: 'eliminated', played_at: '2026-06-09T10:00:00Z', cards_played_total: 2 }),
            row({ result: 'won', played_at: '2026-06-11T10:00:00Z', draw_cards_played: 9, uno_calls: 1 }),
            row({ result: 'abandoned', played_at: '2026-06-12T10:00:00Z' }),
        ]
        const history = promotionHistory(rows)
        const finalTier = history[history.length - 1]!.badge
        expect(finalTier).toEqual(badgeFor(pointsFromRows(rows)))
    })

    it('agrees with the points weights it is derived from', () => {
        // Guard against the ladder and the weights drifting apart: two
        // fresh-day wins must be exactly 2 * (win + dayPlayed).
        const rows = [winOn('2026-06-02'), winOn('2026-06-03')]
        const expected = 2 * (POINT_WEIGHTS.win + POINT_WEIGHTS.dayPlayed)
        expect(expected).toBe(250)
        expect(promotionHistory(rows).map(p => p.badge.title)).toContain('Scrapper')
    })
})
