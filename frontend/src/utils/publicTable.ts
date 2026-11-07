/**
 * Copy for the home screen's public table card, from the live directory.
 *
 * The card describes the table quick match will seat you at: the fullest open
 * public room by connected players, the same measure the directory sorts on.
 * A table seats seven and deals itself once all seven are in, so a full one is
 * never shown: the next player starts a new House table.
 */

import { PUBLIC_SEATS } from '@lounge'
import type { LiveTable } from '../composables/useLiveTables'

/** Rules a new public table opens with. */
export const PUBLIC_TABLE_RULES = 'house'

export interface PublicTableView {
    /** The room quick match will pick, or null when a tap opens a new one. */
    target: LiveTable | null
    headline: string
    status: string
    body: string
    rules: string
}

const SIT_DOWN = 'Play people from anywhere, right now. No code to share, and the game starts on its own.'

/** People actually at the table: a closed tab keeps its seat but not its socket. */
const present = (t: LiveTable) => t.connected ?? t.players

export function publicTableView(joinable: LiveTable[], loaded: boolean): PublicTableView {
    const target = joinable
        // A full table is locked into its countdown, even once someone leaves it.
        .filter((t) => present(t) > 0 && present(t) < PUBLIC_SEATS && t.seatsFree > 0)
        .reduce<LiveTable | null>((best, t) => (!best || present(t) > present(best) ? t : best), null)
    if (target) {
        const left = PUBLIC_SEATS - present(target)
        return {
            target,
            headline: `${present(target)} AT THE TABLE`,
            status: `${left} SEAT${left === 1 ? '' : 'S'} LEFT`,
            body: SIT_DOWN,
            rules: `${(target.mode || PUBLIC_TABLE_RULES).toUpperCase()} RULES`,
        }
    }
    const rules = `${PUBLIC_TABLE_RULES.toUpperCase()} RULES`
    // Before the first fetch lands, say nothing about who is or is not waiting.
    if (!loaded) return { target: null, headline: 'OPEN TABLE', status: '', body: SIT_DOWN, rules }
    return {
        target: null,
        headline: 'OPEN TABLE',
        status: '',
        body: `Take a seat. It deals itself when all ${PUBLIC_SEATS} are in.`,
        rules,
    }
}
