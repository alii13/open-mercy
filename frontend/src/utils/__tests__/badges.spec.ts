import { describe, it, expect } from 'vitest'
import {
    BADGES,
    badgeFor,
    botBadge,
    earnedPoints,
    aggregateRows,
    pointsFromRows,
    pointsFromRetention,
    gameContribution,
    POINT_WEIGHTS,
    decayFactor,
    applyDecay,
    daysIdleFromRows,
    progressToNext,
    DECAY,
} from '../badges'
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

describe('badgeFor', () => {
    it('maps points onto the 20-tier ladder at the boundaries', () => {
        expect(badgeFor(0).title).toBe('Recruit')
        expect(badgeFor(249).title).toBe('Recruit')
        expect(badgeFor(250).title).toBe('Scrapper')
        expect(badgeFor(599).title).toBe('Scrapper')
        expect(badgeFor(600).title).toBe('Enforcer')
        expect(badgeFor(99_999).title).toBe('Merciless')
        expect(badgeFor(100_000).title).toBe('No Mercy King')
        expect(badgeFor(139_999).title).toBe('No Mercy King')
        expect(badgeFor(140_000).title).toBe('Tyrant')
        // The leader on the day ranks 11-20 shipped.
        expect(badgeFor(215_040).title).toBe('Butcher')
        expect(badgeFor(2_889_999).title).toBe('Apocalypse')
        expect(badgeFor(2_890_000).title).toBe('God of No Mercy')
        expect(badgeFor(50_000_000).tier).toBe(20)
    })

    // Past the King every rank costs more than the one before, so the top
    // keeps getting harder rather than flattening into a grind of equal steps.
    it('makes each rank past the King a bigger step than the last', () => {
        for (let i = 11; i < BADGES.length; i++) {
            const gap = BADGES[i]!.threshold - BADGES[i - 1]!.threshold
            const prev = BADGES[i - 1]!.threshold - BADGES[i - 2]!.threshold
            expect(gap).toBeGreaterThan(prev)
        }
    })

    it('has 20 tiers, strictly increasing thresholds', () => {
        expect(BADGES).toHaveLength(20)
        for (let i = 1; i < BADGES.length; i++) {
            expect(BADGES[i]!.threshold).toBeGreaterThan(BADGES[i - 1]!.threshold)
            expect(BADGES[i]!.tier).toBe(i + 1)
        }
    })
})

describe('botBadge', () => {
    it('scales with rung and never reaches the apex (human-only)', () => {
        expect(botBadge(1).tier).toBe(2)   // scrap → Scrapper
        expect(botBadge(8).tier).toBe(9)   // terminator → Merciless
        expect(botBadge(1).tier).toBeGreaterThanOrEqual(2)
        expect(botBadge(99).tier).toBe(9)  // the King and above are human-only
        expect(botBadge(0).tier).toBe(2)   // clamps low
    })
})

describe('earnedPoints', () => {
    it('applies the weights', () => {
        expect(
            earnedPoints({ wins: 1, completedLosses: 1, drawCardsPlayed: 3, stackSurvivedTotal: 4, unoCalls: 2, daysPlayed: 1 }),
        ).toBe(POINT_WEIGHTS.win + POINT_WEIGHTS.completedLoss + 3 * POINT_WEIGHTS.drawCard + 4 * POINT_WEIGHTS.stackSurvived + 2 * POINT_WEIGHTS.unoCall + POINT_WEIGHTS.dayPlayed)
    })
})

describe('aggregateRows (mirrors badges.sql)', () => {
    it('gates win and loss points on cards_played_total >= 5 (walkover guard)', () => {
        const rows = [
            row({ result: 'won', cards_played_total: 20 }),   // real win
            row({ result: 'won', cards_played_total: 2 }),    // walkover, ignored
            row({ result: 'lost', cards_played_total: 12 }),  // completed loss
            row({ result: 'eliminated', cards_played_total: 3 }), // walkover loss, ignored
            row({ result: 'abandoned', cards_played_total: 30 }), // rage-quit, never counts
        ]
        const agg = aggregateRows(rows)
        expect(agg.wins).toBe(1)
        expect(agg.completedLosses).toBe(1)
    })

    it('sums draw cards, stack survived, uno calls across all rows', () => {
        const rows = [
            row({ draw_cards_played: 4, biggest_stack_survived: 10, uno_calls: 2 }),
            row({ draw_cards_played: 1, biggest_stack_survived: 6, uno_calls: 1 }),
        ]
        const agg = aggregateRows(rows)
        expect(agg.drawCardsPlayed).toBe(5)
        expect(agg.stackSurvivedTotal).toBe(16)
        expect(agg.unoCalls).toBe(3)
    })

    it('counts distinct calendar days played', () => {
        const rows = [
            row({ played_at: '2026-07-01T10:00:00Z' }),
            row({ played_at: '2026-07-01T22:00:00Z' }), // same day
            row({ played_at: '2026-07-03T08:00:00Z' }),
        ]
        expect(aggregateRows(rows).daysPlayed).toBe(2)
    })

    it('pointsFromRows composes aggregate + weights', () => {
        const rows = [
            row({ result: 'won', cards_played_total: 20, draw_cards_played: 3, biggest_stack_survived: 8, uno_calls: 1, played_at: '2026-07-01T00:00:00Z' }),
        ]
        // 1 win(100) + 3 draw(6) + 8 stack(24) + 1 uno(4) + 1 day(25) = 159
        expect(pointsFromRows(rows)).toBe(159)
    })
})

describe('pointsFromRetention (guest estimate)', () => {
    it('scores wins, completed losses, and mercy calls from local stats', () => {
        // 3 wins(300) + 2 losses(24) + 5 mercy(20) = 344
        expect(pointsFromRetention({ gamesPlayed: 5, gamesWon: 3, unoCalls: 5 })).toBe(344)
    })

    it('is an undercount vs the full formula, so claiming only bumps up', () => {
        const guest = pointsFromRetention({ gamesPlayed: 1, gamesWon: 1, unoCalls: 1 })
        // Same game through the full formula also scores draw cards + stack + day.
        const server = pointsFromRows([
            row({ result: 'won', cards_played_total: 20, draw_cards_played: 3, biggest_stack_survived: 8, uno_calls: 1, played_at: '2026-07-01T00:00:00Z' }),
        ])
        expect(guest).toBeLessThan(server)
    })

    it('never goes negative on odd inputs', () => {
        expect(pointsFromRetention({ gamesPlayed: 0, gamesWon: 5, unoCalls: 0 })).toBe(500)
        expect(pointsFromRetention({ gamesPlayed: 0, gamesWon: 0, unoCalls: 0 })).toBe(0)
    })
})

describe('gameContribution (signed-in live badge-up)', () => {
    it('adds a win, draw cards, stack, and mercy for a real game', () => {
        // win(100) + 3 draw(6) + 8 stack(24) + 2 mercy(8) = 138
        expect(gameContribution({ won: true, completedLoss: false, cardsPlayedTotal: 20, drawCardsPlayed: 3, biggestStackSurvived: 8, unoCalls: 2 })).toBe(138)
    })

    it('does not mint win/loss points for a walkover (< 5 cards)', () => {
        expect(gameContribution({ won: true, completedLoss: false, cardsPlayedTotal: 2, drawCardsPlayed: 0, biggestStackSurvived: 0, unoCalls: 0 })).toBe(0)
    })

    it('a baseline + contribution can cross a tier', () => {
        const before = 590 // Scrapper, just under Enforcer (600)
        const after = before + gameContribution({ won: true, completedLoss: false, cardsPlayedTotal: 20, drawCardsPlayed: 0, biggestStackSurvived: 0, unoCalls: 0 })
        expect(badgeFor(before).title).toBe('Scrapper')
        expect(badgeFor(after).title).toBe('Enforcer')
    })
})

describe('decay', () => {
    it('no decay within the grace window', () => {
        expect(decayFactor(0)).toBe(1)
        expect(decayFactor(DECAY.graceDays)).toBe(1)
    })

    it('geometric bleed past grace', () => {
        expect(decayFactor(DECAY.graceDays + 1)).toBeCloseTo(DECAY.dailyRetention, 10)
        expect(decayFactor(DECAY.graceDays + 6)).toBeCloseTo(Math.pow(DECAY.dailyRetention, 6), 10)
    })

    it('floors at the current tier so a badge never demotes', () => {
        const earned = 3_700 // Brute (floor 2,700), 1,000 surplus toward Warlord
        const decayed = applyDecay(earned, 60) // very idle
        expect(decayed).toBeGreaterThanOrEqual(2_700)
        expect(badgeFor(decayed).title).toBe('Brute')
        expect(badgeFor(decayed).tier).toBe(badgeFor(earned).tier)
    })

    it('bleeds only the surplus (worked example: Brute, 3 days past grace)', () => {
        const earned = 3_700 // Brute floor 2,700, surplus 1,000 toward Warlord
        const idle = DECAY.graceDays + 3
        expect(applyDecay(earned, idle)).toBe(2_700 + Math.round(1_000 * Math.pow(0.95, 3)))
    })

    it('never demotes below any earned tier, for any surplus and idleness', () => {
        for (const earned of [0, 249, 250, 5_600, 44_999, 100_500]) {
            for (const idle of [0, 5, 30, 365]) {
                expect(badgeFor(applyDecay(earned, idle)).tier).toBe(badgeFor(earned).tier)
            }
        }
    })
})

describe('daysIdleFromRows', () => {
    it('measures whole days since the newest row', () => {
        const now = Date.parse('2026-07-11T00:00:00Z')
        const rows = [
            row({ played_at: '2026-07-01T00:00:00Z' }),
            row({ played_at: '2026-07-08T00:00:00Z' }), // newest
        ]
        expect(daysIdleFromRows(rows, now)).toBe(3)
    })
})

describe('progressToNext', () => {
    it('reports have/needed/pct within the tier', () => {
        const p = progressToNext(3_700) // Brute 2,700 → Warlord 5,500
        expect(p.current.title).toBe('Brute')
        expect(p.next?.title).toBe('Warlord')
        expect(p.have).toBe(1_000)
        expect(p.needed).toBe(1_800)
        expect(p.pct).toBeCloseTo(1_000 / 2_800, 10)
    })

    it('caps out at the apex', () => {
        const p = progressToNext(3_000_000)
        expect(p.current.title).toBe('God of No Mercy')
        expect(p.next).toBeNull()
        expect(p.pct).toBe(1)
    })
})
