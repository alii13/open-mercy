/**
 * House players: seats the room fills itself so nobody at the public table
 * waits alone. They walk in one at a time while the deal counts down, take
 * their turns after a human-sized pause, and leave after a few hands. Humans
 * always come first: the room only tops a table up to HOUSE_FILL, and a person
 * sitting down sends one of them away.
 *
 * Nothing on the wire marks a house seat. The room keeps them apart from the
 * roster, never writes a game_results row for one, and counts them in the
 * human rows' house_count so the numbers stay honest.
 *
 * Pure rules here; index.ts owns the clock and the storage.
 */

import { BOT_LADDER, type BotProfile } from '../../shared/engine/bot'
import { randomHandle } from '../../shared/handles'

/** A table with people at it is topped up to this many seats. */
export const HOUSE_FILL = 4

export interface HouseSeat {
    name: string
    skin: string
    joinedAt: number
    /** Hands this seat has been dealt into. */
    hands: number
    /** It leaves at the first return to the table after this many hands. */
    leaveAfter: number
    dials: BotProfile
}

/** How many house seats a table with `humans` people at it should have. */
export function houseTarget(humans: number): number {
    return humans < 1 ? 0 : Math.max(0, HOUSE_FILL - humans)
}

/** One seat at a time, so arrivals and departures read as people. */
export function houseStep(humans: number, house: number): 1 | -1 | 0 {
    const target = houseTarget(humans)
    return house < target ? 1 : house > target ? -1 : 0
}

// The card backs a newish player owns; the rare ones would stand out on an unranked seat.
const SKINS: [string, number][] = [['ember', 0.55], ['toxic', 0.2], ['ice', 0.15], ['hazard', 0.1]]

function pickSkin(r: number): string {
    for (const [id, w] of SKINS) {
        if (r < w) return id
        r -= w
    }
    return 'ember'
}

export function newHouseSeat(rng: () => number, now: number): { id: string; seat: HouseSeat } {
    const rung = BOT_LADDER[Math.floor(rng() * 4)]!
    return {
        // Shaped like a Supabase user id, so the wire says nothing.
        id: crypto.randomUUID(),
        seat: {
            name: randomHandle(rng),
            skin: pickSkin(rng()),
            joinedAt: now,
            hands: 0,
            leaveAfter: 2 + Math.floor(rng() * 4),
            // ponytail: loose ladder dials with no lookahead keep a turn cheap
            // and a newcomer's odds near a coin flip; retune with sim.ts if
            // house tables win or lose too often.
            dials: { ...rung, id: 'house', skill: 0.2 + rng() * 0.5, search: 0 },
        },
    }
}

export function leavesTable(seat: HouseSeat): boolean {
    return seat.hands >= seat.leaveAfter
}

/**
 * The pause before a house turn. One to four seconds, a long think now and
 * then, and a quick one when no person is left in the hand to watch it.
 */
export function thinkMs(rng: () => number, rush: boolean): number {
    if (rush) return 350 + Math.floor(rng() * 350)
    const long = rng() < 0.12
    return long ? 5000 + Math.floor(rng() * 4000) : 1100 + Math.floor(rng() * 2800)
}

/** Gap between one house seat walking in or out and the next. */
export function walkDelayMs(rng: () => number): number {
    return 2500 + Math.floor(rng() * 2000)
}
