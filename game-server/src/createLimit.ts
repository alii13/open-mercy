// ponytail: room creation is capped at CREATE_MAX rooms per user per
// CREATE_WINDOW_MS. The counter lives in memory in the '!directory' DO, the
// one singleton every create already reaches, so the cap is global. Eviction
// of that DO resets it; that is acceptable for an abuse ceiling, and keeping
// it out of storage avoids a write per create.

export const CREATE_MAX = 10
export const CREATE_WINDOW_MS = 10 * 60 * 1000

/** Prunes the window in place; records `now` only when creation is allowed. */
export function createAllowed(times: number[], now: number): boolean {
    while (times.length && now - times[0]! >= CREATE_WINDOW_MS) times.shift()
    if (times.length >= CREATE_MAX) return false
    times.push(now)
    return true
}
