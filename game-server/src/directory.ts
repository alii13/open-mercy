/**
 * The public-rooms directory: which quick-match rooms are open, and enough
 * about each to render a live-tables strip without one round trip per room.
 *
 * Entries used to be a bare timestamp (`Record<code, number>`), and rooms
 * registered once at creation. That is enough to pick a room to join but not
 * to show one, so entries now carry a snapshot the room DO refreshes whenever
 * its roster or game state changes.
 *
 * Deliberately carries NO player names. Clicking "quick match" is consent to
 * play with a stranger, not consent to appear on the landing page, so the
 * strip shows activity (seats, rules, card backs) and never identity. Names
 * are visible only after someone chooses to spectate.
 */

import { MAX_PLAYERS } from './seats'
import { isRoomCode } from '../../shared/roomCode'

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export interface DirEntry {
    /** When the room first registered. Ordering key — oldest first. */
    at: number
    /** Last snapshot refresh. */
    updatedAt?: number
    players?: number
    /** Sockets actually open right now. `players` is the roster, which keeps
     *  abandoned seats until GC — sorting on it funnels quick-matchers into
     *  ghost towns. */
    connected?: number
    seatsFree?: number
    inProgress?: boolean
    mode?: string
    /** Equipped card-back ids, cosmetic only. */
    skins?: string[]
    /**
     * The room's phase. `inProgress` alone cannot say "finished", and a
     * finished game reports inProgress: false — which put dead rooms back in
     * the quick-match pool, where every joiner rendered someone else's
     * game-over on arrival.
     */
    status?: RoomPhase
}

/** What a room looks like to the landing page. */
export interface PublicTable {
    code: string
    players: number
    seatsFree: number
    inProgress: boolean
    mode: string
    skins: string[]
    status: RoomPhase
}

/** Entries written before `status` existed only know started-or-not. */
function entryStatus(e: DirEntry): RoomPhase {
    return e.status ?? (e.inProgress ? 'playing' : 'lobby')
}

/**
 * A room that stopped heartbeating this long ago is treated as gone. Rooms
 * normally leave via dir-unregister at GC; this only catches a DO that died
 * without cleaning up, so it is far longer than any real refresh gap.
 */
export const DIR_STALE_MS = 2 * 60 * 60 * 1000

/**
 * Entries written before the snapshot change are bare numbers. Reading has to
 * cope with both or a deploy would blank the directory for every live room.
 */
export function normalizeDir(raw: Record<string, DirEntry | number> | undefined): Record<string, DirEntry> {
    const out: Record<string, DirEntry> = {}
    for (const [code, value] of Object.entries(raw ?? {})) {
        out[code] = typeof value === 'number' ? { at: value } : value
    }
    return out
}

/**
 * Joinable codes, fullest first, so players concentrate into the room
 * closest to starting instead of spreading one per lobby; age breaks ties.
 *
 * Started rooms stay registered now — the landing strip wants to show a game
 * in progress, and evicting them on start meant the directory only ever held
 * empty lobbies. Quick match must therefore filter here, on the room's phase:
 * only a room still in its lobby has a seat to offer. A playing room would
 * drop the joiner into a game under way; a finished one would seat them in
 * front of someone else's game-over.
 */
export function dirCodes(raw: Record<string, DirEntry | number> | undefined): string[] {
    const dir = normalizeDir(raw)
    const filling = (e: DirEntry) => e.connected ?? e.players ?? 0
    return Object.entries(dir)
        .filter(([, e]) => entryStatus(e) === 'lobby')
        .sort((a, b) => filling(b[1]) - filling(a[1]) || a[1].at - b[1].at)
        .map(([code]) => code)
}

/**
 * Rooms worth showing: not stale, and with someone actually in them. An empty
 * room is a worse advert than no room at all, and a room registered but never
 * joined would otherwise sit on the landing page indefinitely.
 */
export function liveTables(
    raw: Record<string, DirEntry | number> | undefined,
    now: number,
    limit = 3,
): PublicTable[] {
    const dir = normalizeDir(raw)
    return Object.entries(dir)
        .filter(([, e]) => (e.players ?? 0) > 0)
        // A finished game is not an invitation to anything.
        .filter(([, e]) => entryStatus(e) !== 'finished')
        .filter(([, e]) => now - (e.updatedAt ?? e.at) < DIR_STALE_MS)
        // Fullest first: a table with people on it is the better invitation,
        // and a nearly-empty room reads as a dead game.
        .sort((a, b) => (b[1].players ?? 0) - (a[1].players ?? 0) || a[1].at - b[1].at)
        .slice(0, limit)
        .map(([code, e]) => ({
            code,
            players: e.players ?? 0,
            seatsFree: e.seatsFree ?? 0,
            inProgress: !!e.inProgress,
            mode: e.mode ?? 'official',
            skins: e.skins ?? [],
            status: entryStatus(e),
        }))
}

/** Most rooms the directory will hold. Sized well past real traffic; it only
 *  keeps the single stored `dir` value under the storage value limit. */
export const DIR_MAX_ENTRIES = 500
const MODE_MAX = 16
const SKIN_MAX = 32
const STATUSES: readonly RoomPhase[] = ['lobby', 'playing', 'finished']

function count(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(MAX_PLAYERS, Math.floor(v))) : undefined
}

/** Keep only known snapshot fields, each bounded in size. */
export function cleanSnapshot(raw: unknown): Partial<DirEntry> {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const out: Partial<DirEntry> = {}
    const players = count(s.players)
    if (players !== undefined) out.players = players
    const connected = count(s.connected)
    if (connected !== undefined) out.connected = connected
    const seatsFree = count(s.seatsFree)
    if (seatsFree !== undefined) out.seatsFree = seatsFree
    if (typeof s.inProgress === 'boolean') out.inProgress = s.inProgress
    if (typeof s.mode === 'string') out.mode = s.mode.slice(0, MODE_MAX)
    if (Array.isArray(s.skins)) {
        out.skins = s.skins
            .filter((k): k is string => typeof k === 'string' && k.length <= SKIN_MAX)
            .slice(0, MAX_PLAYERS)
    }
    if (typeof s.status === 'string' && (STATUSES as readonly string[]).includes(s.status)) {
        out.status = s.status as RoomPhase
    }
    return out
}

/**
 * Register or refresh one room in place. A code not already listed is refused
 * once the directory holds DIR_MAX_ENTRIES; listed rooms always refresh.
 */
export function dirRegister(dir: Record<string, DirEntry>, code: string, snapshot: unknown, now: number): boolean {
    if (typeof code !== 'string' || !isRoomCode(code)) return false
    const prev = dir[code]
    if (!prev && Object.keys(dir).length >= DIR_MAX_ENTRIES) return false
    dir[code] = {
        // Keep the original registration time: it is the ordering key for
        // quick match, and a re-register on every roster change would
        // otherwise send a room to the back forever.
        at: prev?.at ?? now,
        updatedAt: now,
        ...cleanSnapshot(snapshot),
    }
    return true
}
