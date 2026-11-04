/**
 * Daily challenge record — one scored attempt per local day.
 *
 * The scored row rides the normal game_results insert with
 * game_id = daily-YYYY-MM-DD. This module holds the device-local copy the
 * lobby card gates and displays on, plus the server lookup that covers the
 * case where the same player already played today's deal somewhere else.
 */

import { localDateString } from './seededRng'
import { supabase } from '../lib/supabase'

const KEY = 'uno_daily_v1'

export interface DailyRecord {
    date: string
    result: 'won' | 'lost' | 'eliminated'
    turns: number
    /**
     * One character per human turn, from gameStore.turnLog. Absent when the
     * record came from the server, which stores the outcome but not the run.
     * See CELL_KINDS for the mapping.
     */
    log?: string
}

/**
 * Sharing a daily result splits across two surfaces on purpose.
 *
 * The run itself — the sequence of turns — is drawn, never typed. Wordle put
 * its grid in the shared text because coloured emoji squares were the only
 * thing a 2021 tweet could carry, and every clone inherited that constraint.
 * A rendered image has no such limit and can use the game's real type, colour
 * and iconography, so the grid lives there (see shareImage.ts) and in the
 * in-app card, which draws it with CSS.
 *
 * This module owns only the text half: a clean line with no glyphs, for the
 * clipboard and for share sheets that take text but not an image.
 */

export type DailyCell = 'played' | 'drew' | 'stacked'

const CELL_KINDS: Record<string, DailyCell> = {
    p: 'played',
    d: 'drew',
    x: 'stacked',
}

/** Turn log to renderer-friendly cells. Consumed by both the card and canvas. */
export function dailyGridCells(log: string | undefined): DailyCell[] {
    return Array.from(log ?? '', (c) => CELL_KINDS[c]).filter(Boolean) as DailyCell[]
}

function outcomeLine(rec: DailyRecord): string {
    if (rec.result === 'won') return `Cleared in ${rec.turns}`
    if (rec.result === 'eliminated') return 'Ruin claimed me'
    return 'Lost'
}

export interface DailyRank {
    rank: number
    total: number
}

export function buildDailyShareText(rec: DailyRecord, rank?: DailyRank): string {
    const parts = [`RUNE RIOT Daily ${rec.date}`, outcomeLine(rec)]
    if (rank && rank.total > 0) {
        // Ceil so the fastest solver of the day reads "top 1%", not "top 0%".
        parts.push(`top ${Math.max(1, Math.ceil((rank.rank / rank.total) * 100))}%`)
    }
    return `${parts.join(' - ')}\n\nopen-mercy.com/daily`
}

/** Today's record, or null if the player hasn't played today's deal here. */
export function getDailyRecord(): DailyRecord | null {
    try {
        const raw = localStorage.getItem(KEY)
        if (!raw) return null
        const rec = JSON.parse(raw) as DailyRecord
        return rec.date === localDateString() ? rec : null
    } catch {
        return null
    }
}

export function markDailyDone(rec: DailyRecord): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(rec))
    } catch { /* localStorage disabled or quota */ }
}

/**
 * The localStorage gate above is per device, so playing today's deal on a
 * phone and then opening a laptop looks like a fresh day — that is how two
 * players ended up with duplicate rows for the same deal. The unique index on
 * (user_id, game_id) where game_id like 'daily-%' now refuses the second
 * insert, so the client has to be able to say why.
 *
 * Deliberately narrow: this only runs when there is no local record AND the
 * caller has a user id, so the common case (already played here, or never
 * played) costs nothing. game_results RLS is owner-select-only, which is
 * exactly the access needed to read one's own row.
 *
 * Returns null on any failure — a lookup that does not answer must not block
 * someone from playing.
 */
export async function fetchServerDailyRecord(
    userId: string,
    date: string,
): Promise<DailyRecord | null> {
    try {
        const { data, error } = await supabase
            .from('game_results')
            .select('result, cards_played_total, draws_taken')
            .eq('game_id', `daily-${date}`)
            .eq('user_id', userId)
            .maybeSingle()
        if (error || !data) return null
        const result = data.result as DailyRecord['result']
        // No log: the run itself only ever lived on the device that played it,
        // so the card shows the outcome without a grid.
        return {
            date,
            result,
            turns: Number(data.cards_played_total ?? 0) + Number(data.draws_taken ?? 0),
        }
    } catch {
        return null
    }
}
