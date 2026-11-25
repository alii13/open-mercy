import { describe, expect, it } from 'vitest'
import { headToHeadLine, opponentLine } from '../profileGames'

const now = new Date('2026-11-25T12:00:00Z').getTime()

describe('opponentLine', () => {
    it('names two players and counts the rest', () => {
        const g = { is_bot_game: false, is_daily: false, opponent_count: 3, opponents: [
            { name: 'Rook', code: 'a', you: false },
            { name: 'Sana', code: 'b', you: false },
            { name: 'Mo', code: 'c', you: false },
        ] }
        expect(opponentLine(g)).toBe('vs Rook, Sana and 1 more')
    })

    it('counts house players the list cannot name', () => {
        const g = { is_bot_game: false, is_daily: false, opponent_count: 3, opponents: [{ name: 'Kite', code: 'k', you: true }] }
        expect(opponentLine(g)).toBe('vs you and 2 more')
    })

    it('says what a bot game was', () => {
        expect(opponentLine({ is_bot_game: true, is_daily: true, opponent_count: 3, opponents: [] })).toBe('Daily challenge')
        expect(opponentLine({ is_bot_game: true, is_daily: false, opponent_count: 1, opponents: [] })).toBe('vs 1 bot')
    })
})

describe('headToHeadLine', () => {
    it('says who won the last game and how it ended for you', () => {
        expect(headToHeadLine({
            last_played_at: '2026-11-12T10:00:00Z',
            last_my_result: 'eliminated',
            last_my_cards: 0,
            last_my_peak: 25,
            last_their_result: 'won',
        }, now)).toBe('They won your last game on Nov 12. You were eliminated at 25 cards.')
    })

    it('says when you won it, or when somebody else did', () => {
        expect(headToHeadLine({
            last_played_at: '2026-11-25T09:00:00Z',
            last_my_result: 'won',
            last_my_cards: 0,
            last_my_peak: 12,
            last_their_result: 'eliminated',
        }, now)).toBe('You won your last game today.')
        expect(headToHeadLine({
            last_played_at: '2026-11-24T09:00:00Z',
            last_my_result: 'lost',
            last_my_cards: 9,
            last_my_peak: 14,
            last_their_result: 'lost',
        }, now)).toBe('Someone else won your last game yesterday. You held 9 cards at the end.')
    })
})
