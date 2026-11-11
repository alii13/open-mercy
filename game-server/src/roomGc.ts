// How long a room with no connected players survives before it's garbage-
// collected. Public and private rooms want opposite things:
//  - public rooms back quick-match, so a dead one must leave the pool fast;
//  - private rooms are reached by a shared invite link, so they should linger
//    long enough that a friend clicking the link "later" still lands in the room.
// An hour turned out to be shorter than the way people actually share a link:
// 67 recorded join failures were invite links opened after the room had gone.
// Six hours covers "sent it at lunch, opened it after work" without holding empty
// rooms for days. Public stays at 10 minutes — quick match must never hand out a
// dead room, and that constraint has not changed.
export const ROOM_GC_MS = 10 * 60 * 1000
export const PRIVATE_ROOM_GC_MS = 6 * 60 * 60 * 1000

export function gcWindowMs(isPublic: boolean): number {
    return isPublic ? ROOM_GC_MS : PRIVATE_ROOM_GC_MS
}

/**
 * The smallest gap worth a storage write when pushing the GC deadline out.
 *
 * Room activity pushes the deadline, and the write costs a `put` plus an
 * alarm re-arm. Doing that on every card played is the single largest source
 * of Durable Object row writes: a busy day of 47,000 player actions spent
 * roughly two thirds of its write budget refreshing a clock that only matters
 * once a room is empty.
 *
 * A minute of lag against a ten-minute window is not a behaviour change worth
 * naming - the room is collected up to a minute earlier than it otherwise
 * would be, and only when nobody is connected to it.
 */
export const GC_TOUCH_MIN_GAP_MS = 60 * 1000

/**
 * Whether a fresh deadline is far enough past the stored one to write.
 *
 * No stored deadline means the room has never been touched: always write, or
 * it is never collected. A deadline already past means an alarm was missed,
 * and the gap is large, so that writes too.
 */
export function shouldPushGc(
    storedGcAt: number | undefined,
    nextGcAt: number,
    minGapMs: number = GC_TOUCH_MIN_GAP_MS,
): boolean {
    if (!storedGcAt) return true
    return nextGcAt - storedGcAt >= minGapMs
}

