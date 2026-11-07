/**
 * Copy for the home screen's public table card, from the live directory.
 *
 * The card describes the table a tap actually seats you at: the fullest open
 * public room, so its count is the table you land at. With nothing open, a tap
 * opens a new House table. The wording follows today's server: a public room
 * deals itself on a clock that starts once two players are in.
 */

import type { LiveTable } from '../composables/useLiveTables'

/** Rules a new public table opens with. */
export const PUBLIC_TABLE_RULES = 'house'

export interface PublicTableView {
    /** The room a tap joins, or null when a tap opens a new one. */
    target: LiveTable | null
    headline: string
    status: string
    body: string
    rules: string
}

const SIT_DOWN = 'Strangers, no room code. Sit down and it deals itself.'

export function publicTableView(joinable: LiveTable[], inProgress: number, loaded: boolean): PublicTableView {
    const target = joinable.reduce<LiveTable | null>((best, t) => (!best || t.players > best.players ? t : best), null)
    if (target) {
        return {
            target,
            headline: `${target.players} AT THE TABLE`,
            status: target.players >= 2 ? 'CLOCK IS RUNNING · DEALS ITSELF' : 'STARTS ITSELF ONCE 2 ARE IN',
            body: SIT_DOWN,
            rules: `${(target.mode || PUBLIC_TABLE_RULES).toUpperCase()} RULES`,
        }
    }
    const rules = `${PUBLIC_TABLE_RULES.toUpperCase()} RULES`
    // Before the first fetch lands, say nothing about who is or is not waiting.
    if (!loaded) return { target: null, headline: 'OPEN TABLE', status: 'STARTS ITSELF ONCE 2 ARE IN', body: SIT_DOWN, rules }
    return {
        target: null,
        headline: 'OPEN TABLE',
        status: inProgress > 0
            ? `${inProgress} GAME${inProgress === 1 ? '' : 'S'} IN PROGRESS · START THE NEXT`
            : 'BE THE FIRST SEAT',
        body: 'Nobody is waiting yet. Sit down and it deals itself once a second player joins.',
        rules,
    }
}
