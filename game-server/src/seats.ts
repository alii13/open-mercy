/** Room capacity, enforced at the door. The product claim ("2 to 20
 * players") lives in frontend copy; this is the only place it's real. */
export const MAX_PLAYERS = 20

export { PUBLIC_SEATS } from '../../shared/lounge'
import { PUBLIC_SEATS } from '../../shared/lounge'

/** How long a dropped player keeps their seat at a filling public table. */
export const SEAT_GRACE_MS = 30_000

/** A returning player always gets their seat back — the cap only stops
 * strangers from squeezing into a full room. */
export function canSeat(roster: Record<string, unknown>, userId: string, cap = MAX_PLAYERS): boolean {
    return userId in roster || Object.keys(roster).length < cap
}

/**
 * Who sits down at the door. A seated player always gets back in. A public
 * table stays open to strangers right up to its deal. A full public table in
 * its lobby hands the seat of someone gone longer than the grace period to the
 * newcomer: otherwise one closed tab would hold a seat a person could use,
 * while a phone that only blinked keeps its seat. A seat with no record of
 * when it emptied (the room hibernated since) counts as long gone.
 */
export function doorVerdict(input: {
    userId: string
    rosterIds: string[]
    liveIds: Iterable<string>
    goneAt: Record<string, number>
    isPublic: boolean
    phase: 'lobby' | 'playing' | 'finished'
    now: number
}): { seat: true; evict?: string } | { seat: false } {
    const roster = Object.fromEntries(input.rosterIds.map((id) => [id, true]))
    if (input.userId in roster) return { seat: true }
    if (canSeat(roster, input.userId, input.isPublic ? PUBLIC_SEATS : MAX_PLAYERS)) return { seat: true }
    if (!input.isPublic || input.phase !== 'lobby') return { seat: false }
    const live = new Set(input.liveIds)
    const evict = input.rosterIds.find((id) => !live.has(id) && input.now - (input.goneAt[id] ?? 0) > SEAT_GRACE_MS)
    return evict ? { seat: true, evict } : { seat: false }
}
