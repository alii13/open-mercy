/** Room capacity, enforced at the door. The product claim ("2 to 20
 * players") lives in frontend copy; this is the only place it's real. */
export const MAX_PLAYERS = 20
export const MAX_COUCH_PLAYERS = 8

/** A returning player always gets their seat back — the cap only stops
 * strangers from squeezing into a full room. */
export function canSeat(roster: Record<string, unknown>, userId: string): boolean {
    return userId in roster || Object.keys(roster).length < MAX_PLAYERS
}

export function canSeatCouch(roster: Record<string, unknown>, userId: string): boolean {
    return userId in roster || Object.keys(roster).length < MAX_COUCH_PLAYERS
}
