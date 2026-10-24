/**
 * Per-socket message rate limit: a token bucket refilling at RATE per second
 * up to BURST. Excess messages are dropped; a socket that keeps getting
 * dropped for CLOSE_AFTER_MS is told to close. In-memory per DO instance -
 * hibernation resets it, which is fine: a socket flooding the room keeps the
 * DO awake.
 */

export const SOCKET_RATE = 10
export const SOCKET_BURST = 20
export const SOCKET_CLOSE_AFTER_MS = 5_000
/** A gap this long with no dropped message ends an overflow streak. */
const STREAK_GAP_MS = 1_000

export interface Bucket {
    tokens: number
    at: number
    /** First drop of the current overflow streak. */
    overSince?: number
    lastDropAt?: number
}

export function newBucket(now: number): Bucket {
    return { tokens: SOCKET_BURST, at: now }
}

/** Mutates the bucket; 'close' once the socket has been over the limit for CLOSE_AFTER_MS. */
export function socketVerdict(b: Bucket, now: number): 'ok' | 'drop' | 'close' {
    b.tokens = Math.min(SOCKET_BURST, b.tokens + ((now - b.at) / 1000) * SOCKET_RATE)
    b.at = now
    if (b.tokens >= 1) {
        b.tokens -= 1
        return 'ok'
    }
    // A flood still trickles through at the refill rate, so an 'ok' alone
    // must not end the streak - only a quiet gap does.
    if (b.overSince === undefined || now - (b.lastDropAt ?? 0) >= STREAK_GAP_MS) b.overSince = now
    b.lastDropAt = now
    return now - b.overSince >= SOCKET_CLOSE_AFTER_MS ? 'close' : 'drop'
}
