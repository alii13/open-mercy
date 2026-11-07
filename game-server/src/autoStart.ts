/**
 * The auto-start clock for public tables. No clock while the table fills;
 * when the seventh player is connected a 15 second countdown runs and the
 * seven are locked in: nobody new can sit (the next stranger starts a new
 * table), and someone leaving never stops or moves the clock. At zero the
 * room deals to whoever is still connected, down to two.
 *
 * Pure state transitions live here so they are testable without the
 * Cloudflare runtime; the DO stores the result in its RoomTimers and arms its
 * alarm off `at`. All timestamps are epoch ms supplied by the caller.
 */
import { PUBLIC_SEATS } from './seats'

export const AUTO_START_MS = 15_000

export interface AutoStartState {
    /** Deadline while the countdown runs; set means the table is locked. */
    at?: number
}

export function autoStartTick(prev: AutoStartState | undefined, input: {
    isPublic: boolean
    phase: 'lobby' | 'playing' | 'finished'
    connected: number
    now: number
}): AutoStartState {
    if (!input.isPublic || input.phase !== 'lobby') return {}
    if (prev?.at !== undefined) return { at: prev.at }
    return input.connected >= PUBLIC_SEATS ? { at: input.now + AUTO_START_MS } : {}
}

/** Whether the room can deal at zero. Fewer than two reopens it as a filling table. */
export function canDeal(connected: number): boolean {
    return connected >= 2
}
