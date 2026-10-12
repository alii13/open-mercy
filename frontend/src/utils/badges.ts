/**
 * Badge ladder — the points-based evolution of the win-only rank ladder
 * (utils/ranks.ts). One number (points) drives one badge, shown on every
 * player everywhere they appear.
 *
 * Points are a weighted sum over stats we already record per game. The badge
 * is cumulative and permanent: once earned, a tier can never be lost. What
 * bleeds during inactivity is only the surplus above your current tier — the
 * progress toward the NEXT badge — floored so a badge never demotes.
 *
 * The weighted sum is mirrored by supabase/badges.sql's player_points(), which
 * returns the same `points` plus `days_idle`; the client applies the decay
 * (applyDecay) so the tier table lives in exactly one place — here.
 *
 * supabase/leaderboards-alltime.sql repeats the same sum a third time to rank
 * the whole field. A weight change here must be made in both SQL files too.
 */

import type { ResultRow } from './gameStats'

export interface Badge {
    /** 1-20, also the emblem art index. */
    tier: number
    threshold: number
    title: string
    color: string
}

/** Escalating heat to the King's gold, then ten prestige ranks above it.
 *  Steepening thresholds toward the top so the apex is genuinely more than a
 *  year of sustained play (decay makes it harder). */
export const BADGES: Badge[] = [
    { tier: 1, threshold: 0, title: 'Recruit', color: '#8a8f98' },
    { tier: 2, threshold: 250, title: 'Scrapper', color: '#5ed17c' },
    { tier: 3, threshold: 600, title: 'Enforcer', color: '#22d3ee' },
    { tier: 4, threshold: 1_300, title: 'Savage', color: '#f59e0b' },
    { tier: 5, threshold: 2_700, title: 'Brute', color: '#f97316' },
    { tier: 6, threshold: 5_500, title: 'Warlord', color: '#ef4444' },
    { tier: 7, threshold: 11_000, title: 'Overlord', color: '#ec4899' },
    { tier: 8, threshold: 22_000, title: 'Executioner', color: '#a855f7' },
    { tier: 9, threshold: 45_000, title: 'Merciless', color: '#7c3aed' },
    { tier: 10, threshold: 100_000, title: 'No Mercy King', color: '#ffd700' },
    // Prestige ranks: x1.4 per rank, rounded. At the fastest player's pace
    // when these shipped (~140k points a month) the top is well over a year
    // away - reachable, so it still pulls, but nobody walks into it.
    { tier: 11, threshold: 140_000, title: 'Tyrant', color: '#d4a73a' },
    { tier: 12, threshold: 196_000, title: 'Butcher', color: '#d0383c' },
    { tier: 13, threshold: 274_000, title: 'Dreadlord', color: '#9aa4ac' },
    { tier: 14, threshold: 384_000, title: 'Harbinger', color: '#5b84d6' },
    { tier: 15, threshold: 538_000, title: 'Annihilator', color: '#d08a4a' },
    { tier: 16, threshold: 753_000, title: 'Wraith', color: '#4fb0a8' },
    { tier: 17, threshold: 1_050_000, title: 'Reaper', color: '#c9d0d6' },
    { tier: 18, threshold: 1_480_000, title: 'Doombringer', color: '#d0453a' },
    { tier: 19, threshold: 2_070_000, title: 'Apocalypse', color: '#9b6bd6' },
    { tier: 20, threshold: 2_890_000, title: 'God of No Mercy', color: '#ffcc33' },
]

export function badgeFor(points: number): Badge {
    let current = BADGES[0]!
    for (const b of BADGES) {
        if (points >= b.threshold) current = b
    }
    return current
}

/** The canonical aggregate the points formula runs on. supabase/badges.sql
 *  computes the identical arithmetic server-side for any user id. */
export interface PointsInput {
    wins: number
    completedLosses: number
    drawCardsPlayed: number
    stackSurvivedTotal: number
    unoCalls: number
    daysPlayed: number
}

export const POINT_WEIGHTS = {
    win: 100,
    completedLoss: 12,
    drawCard: 2,
    stackSurvived: 3,
    unoCall: 4,
    dayPlayed: 25,
} as const

export function earnedPoints(input: PointsInput): number {
    return (
        input.wins * POINT_WEIGHTS.win +
        input.completedLosses * POINT_WEIGHTS.completedLoss +
        input.drawCardsPlayed * POINT_WEIGHTS.drawCard +
        input.stackSurvivedTotal * POINT_WEIGHTS.stackSurvived +
        input.unoCalls * POINT_WEIGHTS.unoCall +
        input.daysPlayed * POINT_WEIGHTS.dayPlayed
    )
}

/** Walkover games (every opponent left) record near-zero plays; the same
 *  `cards_played_total >= 5` guard the achievements/records use keeps a
 *  quitter from minting win or loss points. Mirrored in badges.sql. */
export const MIN_PLAYS = 5

export function aggregateRows(rows: ResultRow[]): PointsInput {
    const days = new Set<string>()
    let wins = 0
    let completedLosses = 0
    let drawCardsPlayed = 0
    let stackSurvivedTotal = 0
    let unoCalls = 0
    for (const r of rows) {
        const real = r.cards_played_total >= MIN_PLAYS
        if (r.result === 'won' && real) wins++
        else if ((r.result === 'lost' || r.result === 'eliminated') && real) completedLosses++
        drawCardsPlayed += r.draw_cards_played
        stackSurvivedTotal += r.biggest_stack_survived
        unoCalls += r.uno_calls
        // UTC date portion — matches badges.sql's date() (Supabase runs UTC).
        if (r.played_at) days.add(r.played_at.slice(0, 10))
    }
    return { wins, completedLosses, drawCardsPlayed, stackSurvivedTotal, unoCalls, daysPlayed: days.size }
}

/** Cumulative earned points from the player's own game history. */
export function pointsFromRows(rows: ResultRow[]): number {
    return earnedPoints(aggregateRows(rows))
}

/** Guests have no server history, only a local lifetime tally that can't see
 *  per-game stats (draw cards, stacks, days). A reduced estimate off the fields
 *  the retention store does keep - always an undercount of the real formula, so
 *  claiming an account only ever bumps a guest's badge up. */
export function pointsFromRetention(a: { gamesPlayed: number; gamesWon: number; unoCalls: number }): number {
    const wins = Math.max(0, a.gamesWon)
    const completedLosses = Math.max(0, a.gamesPlayed - a.gamesWon)
    return wins * POINT_WEIGHTS.win + completedLosses * POINT_WEIGHTS.completedLoss + Math.max(0, a.unoCalls) * POINT_WEIGHTS.unoCall
}

/** Inactivity decay: the surplus above your current tier bleeds while you're
 *  away, floored at the tier threshold so a badge never demotes. */
export const DECAY = {
    /** Days since last game before any decay starts (one week). */
    graceDays: 7,
    /** Fraction of surplus retained per day past grace (geometric, self-limiting). */
    dailyRetention: 0.95,
} as const

export function decayFactor(daysIdle: number): number {
    if (daysIdle <= DECAY.graceDays) return 1
    return Math.pow(DECAY.dailyRetention, daysIdle - DECAY.graceDays)
}

/** Apply floored decay to earned points. Result is never below the earned
 *  tier's threshold, so badgeFor(applyDecay(...)) === badgeFor(earned). */
export function applyDecay(earned: number, daysIdle: number): number {
    const floor = badgeFor(earned).threshold
    const surplus = earned - floor
    return Math.round(floor + surplus * decayFactor(daysIdle))
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** Whole days since the newest row's played_at, for the own-player decay path. */
export function daysIdleFromRows(rows: ResultRow[], nowMs: number): number {
    let newest = 0
    for (const r of rows) {
        const t = r.played_at ? Date.parse(r.played_at) : NaN
        if (!Number.isNaN(t) && t > newest) newest = t
    }
    if (newest === 0) return 0
    return Math.max(0, Math.floor((nowMs - newest) / MS_PER_DAY))
}

/** Points a single finished game adds, for the signed-in live badge-up check
 *  (added to a server baseline so no post-game round-trip is needed). The day
 *  bonus is left out, so the check is conservative - it can fire a game late,
 *  never early. Guests reverse their local tally instead (pointsFromRetention). */
export interface GameContribution {
    won: boolean
    completedLoss: boolean
    cardsPlayedTotal: number
    drawCardsPlayed: number
    biggestStackSurvived: number
    unoCalls: number
}

export function gameContribution(g: GameContribution): number {
    const real = g.cardsPlayedTotal >= MIN_PLAYS
    let p = 0
    if (g.won && real) p += POINT_WEIGHTS.win
    else if (g.completedLoss && real) p += POINT_WEIGHTS.completedLoss
    p += Math.max(0, g.unoCalls) * POINT_WEIGHTS.unoCall
    p += Math.max(0, g.drawCardsPlayed) * POINT_WEIGHTS.drawCard
    p += Math.max(0, g.biggestStackSurvived) * POINT_WEIGHTS.stackSurvived
    return p
}

/** Cosmetic badge for a single-player bot, tied to its ladder rung (1-based).
 *  Caps at Merciless so No Mercy King and everything above stay human-only. */
const BOT_MAX_INDEX = 8

export function botBadge(rung: number): Badge {
    const idx = Math.min(Math.max(Math.round(rung), 1), BOT_MAX_INDEX)
    return BADGES[idx]!
}

export interface Progress {
    current: Badge
    next: Badge | null
    have: number
    needed: number
    pct: number
}

/** Progress within the current tier toward the next — drives the nudge. */
export function progressToNext(points: number): Progress {
    const current = badgeFor(points)
    const idx = BADGES.findIndex(b => b.tier === current.tier)
    const next = idx < BADGES.length - 1 ? BADGES[idx + 1]! : null
    if (!next) return { current, next: null, have: 0, needed: 0, pct: 1 }
    const span = next.threshold - current.threshold
    const have = points - current.threshold
    return { current, next, have, needed: Math.max(0, next.threshold - points), pct: span > 0 ? have / span : 1 }
}
