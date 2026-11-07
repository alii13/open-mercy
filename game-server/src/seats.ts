/** Room capacity, enforced at the door. The product claim ("2 to 20
 * players") lives in frontend copy; this is the only place it's real. */
export const MAX_PLAYERS = 20

export { PUBLIC_SEATS } from '../../shared/lounge'

/** A returning player always gets their seat back — the cap only stops
 * strangers from squeezing into a full room. */
export function canSeat(roster: Record<string, unknown>, userId: string, cap = MAX_PLAYERS): boolean {
    return userId in roster || Object.keys(roster).length < cap
}
