/**
 * The day streak, with one free shield a week that carries it over a single
 * missed day. Dates are YYYY-MM-DD on the player's own calendar.
 *
 * Shared because two places must agree: the browser keeps the streak, and the
 * game server decides from the same numbers what tonight's reminder may claim.
 */

export interface StreakState {
    streak: number
    lastPlayed: string | null
    /** The day the shield last carried the streak; null when never spent. */
    shieldUsedOn: string | null
}

/** A spent shield comes back this many days later. */
export const SHIELD_DAYS = 7

export function daysBetween(a: string, b: string): number {
    const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
    return Math.round((utc(b) - utc(a)) / 86_400_000)
}

export function shieldReady(s: StreakState, today: string): boolean {
    return s.shieldUsedOn === null || daysBetween(s.shieldUsedOn, today) >= SHIELD_DAYS
}

/** The streak as it stands today, before today's game. `holding`: the shield is covering yesterday. */
export function liveStreak(s: StreakState, today: string): { streak: number; holding: boolean } {
    if (!s.lastPlayed || s.streak === 0) return { streak: 0, holding: false }
    const gap = daysBetween(s.lastPlayed, today)
    if (gap <= 1) return { streak: s.streak, holding: false }
    if (gap === 2 && s.streak >= 2 && shieldReady(s, today)) return { streak: s.streak, holding: true }
    return { streak: 0, holding: false }
}

/** The streak once a game finishes today. */
export function afterGame(s: StreakState, today: string): StreakState {
    if (!s.lastPlayed) return { streak: 1, lastPlayed: today, shieldUsedOn: s.shieldUsedOn }
    const gap = daysBetween(s.lastPlayed, today)
    if (gap === 0) return { ...s, lastPlayed: today }
    if (gap === 1) return { ...s, streak: s.streak + 1, lastPlayed: today }
    if (liveStreak(s, today).holding) return { streak: s.streak + 1, lastPlayed: today, shieldUsedOn: today }
    return { streak: 1, lastPlayed: today, shieldUsedOn: s.shieldUsedOn }
}
