/**
 * Promotion history — the dates a player crossed each badge threshold.
 *
 * Derived, never stored: replaying the same weighted sum badges.ts already
 * defines over the player's games in order tells us which game bought each
 * tier. Nothing new is recorded per game, so a player who had history before
 * badges shipped still gets a full career.
 *
 * Promotions run on EARNED points, which only ever grow. Inactivity decay bites
 * the surplus toward the next tier, never the tiers already taken, so this list
 * is stable: a badge that appears here can never disappear from it later.
 */

import { BADGES, earnedPoints, isRealGame, type Badge } from './badges'
import type { ResultRow } from './gameStats'

export interface Promotion {
    badge: Badge
    /** `played_at` of the game that crossed the threshold. */
    at: string
    /** Whole days since the previous promotion; null for the first. */
    daysSincePrevious: number | null
}

const MS_PER_DAY = 86_400_000

function playedAtMs(row: ResultRow): number {
    return row.played_at ? Date.parse(row.played_at) : NaN
}

/** Every tier the player has taken, oldest first. Accepts rows in any order —
 *  the stats query returns them newest-first. */
export function promotionHistory(rows: ResultRow[]): Promotion[] {
    const ordered = rows
        .filter(r => !Number.isNaN(playedAtMs(r)))
        .sort((a, b) => playedAtMs(a) - playedAtMs(b))

    const days = new Set<string>()
    let wins = 0
    let completedLosses = 0
    let drawCardsPlayed = 0
    let stackSurvivedTotal = 0
    let unoCalls = 0

    const promotions: Promotion[] = []
    let nextTier = 0
    let previousAt: number | null = null

    for (const r of ordered) {
        // Same walkover guard as aggregateRows — a quitter's opponent must not
        // mint win points here either.
        const real = isRealGame(r)
        if (r.result === 'won' && real) wins++
        else if ((r.result === 'lost' || r.result === 'eliminated') && real) completedLosses++
        drawCardsPlayed += r.draw_cards_played
        stackSurvivedTotal += r.biggest_stack_survived
        unoCalls += r.uno_calls
        days.add(r.played_at.slice(0, 10))

        const points = earnedPoints({
            wins,
            completedLosses,
            drawCardsPlayed,
            stackSurvivedTotal,
            unoCalls,
            daysPlayed: days.size,
        })

        // A single huge game can vault several tiers; each is a real promotion
        // and they share that game's timestamp.
        while (nextTier < BADGES.length && points >= BADGES[nextTier]!.threshold) {
            const at = playedAtMs(r)
            promotions.push({
                badge: BADGES[nextTier]!,
                at: r.played_at,
                daysSincePrevious:
                    previousAt === null ? null : Math.max(0, Math.floor((at - previousAt) / MS_PER_DAY)),
            })
            previousAt = at
            nextTier++
        }
    }

    return promotions
}
