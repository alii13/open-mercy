import { describe, it, expect } from 'vitest'
import { personalRecords } from '../personalRecords'
import type { ResultRow } from '../gameStats'

function row(overrides: Partial<ResultRow>): ResultRow {
    return {
        result: 'won',
        game_id: 'bot-1',
        cards_remaining: 0,
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

describe('personalRecords', () => {
    it('has no records before the first win', () => {
        expect(personalRecords([])).toEqual({ fastestWinSecs: null, leanestWinCards: null })
    })

    it('takes the quickest and the leanest win', () => {
        const records = personalRecords([
            row({ game_duration_secs: 300, cards_played_total: 30 }),
            row({ game_duration_secs: 107, cards_played_total: 22 }),
            row({ game_duration_secs: 240, cards_played_total: 11 }),
        ])
        expect(records.fastestWinSecs).toBe(107)
        expect(records.leanestWinCards).toBe(11)
    })

    it('reads records only from wins', () => {
        const records = personalRecords([
            row({ result: 'lost', game_duration_secs: 5, cards_played_total: 6 }),
            row({ result: 'eliminated', game_duration_secs: 6, cards_played_total: 7 }),
            row({ result: 'won', game_duration_secs: 300, cards_played_total: 30 }),
        ])
        expect(records.fastestWinSecs).toBe(300)
        expect(records.leanestWinCards).toBe(30)
    })

    it('refuses walkovers, which would otherwise own every speed record', () => {
        // Every opponent quit: seconds long, almost no cards played. The same
        // cards_played_total >= 5 guard the points formula and the SQL use.
        const records = personalRecords([
            row({ game_duration_secs: 3, cards_played_total: 1, is_bot_game: false }),
            row({ game_duration_secs: 240, cards_played_total: 18 }),
        ])
        expect(records.fastestWinSecs).toBe(240)
        expect(records.leanestWinCards).toBe(18)
    })

    it('returns null when every win is a walkover', () => {
        expect(personalRecords([row({ cards_played_total: 2, is_bot_game: false })])).toEqual({
            fastestWinSecs: null,
            leanestWinCards: null,
        })
    })

    it('counts a win sitting exactly on the walkover boundary', () => {
        const records = personalRecords([row({ cards_played_total: 5, game_duration_secs: 42 })])
        expect(records.fastestWinSecs).toBe(42)
        expect(records.leanestWinCards).toBe(5)
    })
})
