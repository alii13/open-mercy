import { TURN_LIMIT_MS } from './protocol'

/** The room's turn clock: who it is running for and when it runs out (epoch ms). */
export interface TurnClock {
    seat?: string
    at?: number
}

/**
 * Where the clock points after a state change. A new seat on turn, the same
 * seat starting a new turn (an extra-turn card) or a clock that already fired
 * start a fresh limit. Anything else leaves the running clock alone: a choice
 * inside the turn (swap target, a drawn wild's colour), an off-turn MERCY call
 * or a catch, so no move can stretch a turn past the limit.
 */
export function nextTurnClock(clock: TurnClock, currentSeat: string | null, newTurn: boolean, now: number): TurnClock {
    if (!currentSeat) return {}
    if (clock.seat !== currentSeat || !clock.at || newTurn) {
        return { seat: currentSeat, at: now + TURN_LIMIT_MS }
    }
    return clock
}

/**
 * The clock for `dueSeat` ran out. If that seat still holds the turn it times
 * out whether or not it is connected, so dropping off across the deadline
 * cannot stop the clock; a seat that is offline gets the absent resolution.
 */
export function dueTimeout(dueSeat: string | undefined, currentSeat: string | null, connected: Set<string>): { seat: string; present: boolean } | null {
    if (!dueSeat || dueSeat !== currentSeat) return null
    return { seat: dueSeat, present: connected.has(dueSeat) }
}
