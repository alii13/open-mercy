/**
 * Quick-chat rate limit: at most one message per second, and at most three
 * in any five-second window. In-memory per DO instance — hibernation resets
 * it, which is fine for a best-effort spam guard on id-only phrases.
 */

export const CHAT_MIN_GAP_MS = 1_000
export const CHAT_BURST = 3
export const CHAT_WINDOW_MS = 5_000

/** Prunes the window in place; appends `now` only when the message is allowed. */
export function chatAllowed(times: number[], now: number): boolean {
    while (times.length && now - times[0]! >= CHAT_WINDOW_MS) times.shift()
    const last = times[times.length - 1]
    if (last !== undefined && now - last < CHAT_MIN_GAP_MS) return false
    if (times.length >= CHAT_BURST) return false
    times.push(now)
    return true
}

/** Lounge actions on the 3D public table: a drag sends a move about every
 *  120 ms, so the cap is a per-second count rather than a gap. */
export const LOUNGE_PER_SECOND = 12

export function loungeAllowed(times: number[], now: number): boolean {
    while (times.length && now - times[0]! >= 1_000) times.shift()
    if (times.length >= LOUNGE_PER_SECOND) return false
    times.push(now)
    return true
}
