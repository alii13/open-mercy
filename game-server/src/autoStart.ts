/**
 * The auto-start clock for public tables. No clock while the table fills;
 * when the seventh player is connected a 15 second countdown runs, and at zero
 * the room deals itself. Anyone leaving cancels it, and the next full table
 * starts a fresh 15 seconds. There is no way to buy more time.
 *
 * Pure state transitions live here so they are testable without the
 * Cloudflare runtime; the DO stores the result in its RoomTimers and arms its
 * alarm off `at`. All timestamps are epoch ms supplied by the caller.
 */
import { PUBLIC_SEATS } from './seats'

export const AUTO_START_MS = 15_000

export interface AutoStartState {
    /** Deadline while the countdown runs. */
    at?: number
}

export function autoStartTick(prev: AutoStartState | undefined, input: {
    isPublic: boolean
    phase: 'lobby' | 'playing' | 'finished'
    connected: number
    now: number
}): AutoStartState {
    if (!input.isPublic || input.phase !== 'lobby' || input.connected < PUBLIC_SEATS) return {}
    return { at: prev?.at ?? input.now + AUTO_START_MS }
}
