/**
 * The auto-start clock for public tables. It starts when the first person
 * sits: 30 seconds, then the deal. People coming and going never move it, and
 * the table stays open to strangers until it deals. The last person leaving
 * stops it; the next one to sit starts it over. House players (house.ts) fill
 * the empty seats, so a table with one person still deals.
 *
 * Pure state transitions live here so they are testable without the
 * Cloudflare runtime; the DO stores the result in its RoomTimers and arms its
 * alarm off `at`. All timestamps are epoch ms supplied by the caller.
 */

export const AUTO_START_MS = 30_000

export interface AutoStartState {
    /** Deadline while the countdown runs. */
    at?: number
}

export function autoStartTick(prev: AutoStartState | undefined, input: {
    isPublic: boolean
    phase: 'lobby' | 'playing' | 'finished'
    /** People connected; house seats do not count. */
    humans: number
    now: number
}): AutoStartState {
    if (!input.isPublic || input.phase !== 'lobby' || input.humans < 1) return {}
    if (prev?.at !== undefined) return { at: prev.at }
    return { at: input.now + AUTO_START_MS }
}

/** Whether the room can deal at zero: a person at the table and someone to play. */
export function canDeal(humans: number, seats: number): boolean {
    return humans >= 1 && seats >= 2
}
