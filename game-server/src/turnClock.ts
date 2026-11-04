import { TURN_LIMIT_MS } from './protocol'

/** The room's turn clock: who it is running for and when it runs out (epoch ms). */
export interface TurnClock {
    seat?: string
    at?: number
}

/**
 * Where the clock points after a state change. A new seat on turn, the seat on
 * turn acting and keeping it (a colour pick, an extra turn), or a clock that
 * already fired all start a fresh limit. Anything else, such as an off-turn
 * MERCY call or a catch, leaves the running clock alone so it cannot be reset
 * by someone else.
 */
export function nextTurnClock(clock: TurnClock, currentSeat: string | null, actor: string | undefined, now: number): TurnClock {
    if (!currentSeat) return {}
    if (clock.seat !== currentSeat || !clock.at || actor === currentSeat) {
        return { seat: currentSeat, at: now + TURN_LIMIT_MS }
    }
    return clock
}
