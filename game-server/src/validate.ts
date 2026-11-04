/**
 * Input checks for client-supplied values. Everything that arrives over the
 * socket or the /rooms body is untyped at runtime whatever the TypeScript
 * says, so these take `unknown`.
 */

import type { CardColor, StackingMode } from '../../shared/engine'

const STACKING_MODES: readonly StackingMode[] = ['official', 'house', 'casual']
const WILD_COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue']

export const NAME_MAX = 40
export const COUCH_NAME_MIN = 2
export const COUCH_NAME_MAX = 16
export const SKIN_MAX = 32

export function isStackingMode(v: unknown): v is StackingMode {
    return typeof v === 'string' && (STACKING_MODES as readonly string[]).includes(v)
}

/** The colour a wild may be declared as. 'wild' itself is not one. */
export function isWildColor(v: unknown): v is CardColor {
    return typeof v === 'string' && (WILD_COLORS as readonly string[]).includes(v)
}

/** A card-back id, or undefined when the value is not a plausible one. */
export function cleanSkin(v: unknown): string | undefined {
    if (typeof v !== 'string' || v.length > SKIN_MAX) return undefined
    return /^[a-z0-9_-]+$/.test(v) ? v : undefined
}

/** Display name: control characters stripped, trimmed, capped; empty -> 'PLAYER'. */
export function cleanName(v: unknown): string {
    if (typeof v !== 'string') return 'PLAYER'
    // eslint-disable-next-line no-control-regex
    const name = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, NAME_MAX).trim()
    return name || 'PLAYER'
}

/** Couch names are deliberately compact for phone and TV layouts. */
export function cleanCouchName(v: unknown): string | null {
    if (typeof v !== 'string') return null
    // Count Unicode code points, not UTF-16 code units, so emoji and accented
    // names are handled consistently.
    // eslint-disable-next-line no-control-regex
    const compact = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().replace(/\s+/g, ' ')
    const points = [...compact]
    if (points.length < COUCH_NAME_MIN || points.length > COUCH_NAME_MAX) return null
    return compact
}

export function couchNameTaken(roster: Record<string, { name: string }>, name: string, exceptUserId?: string): boolean {
    const folded = name.normalize('NFKC').toLocaleLowerCase('und')
    return Object.entries(roster).some(([id, entry]) =>
        id !== exceptUserId && entry.name.normalize('NFKC').toLocaleLowerCase('und') === folded)
}
