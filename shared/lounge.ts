/**
 * The 3D public table's relayed actions: a player moving their card, flicking a
 * card at someone, drawing from the deck. The room relays them to everyone else
 * at the table and stores nothing but each player's last spot. Emotes are not
 * here: they ride quick chat, which is already id-only and rate-limited.
 *
 * Units are the table's: an ellipse LOUNGE_TABLE.rx by LOUNGE_TABLE.rz around
 * the deck at the origin.
 */

/** A public table seats seven; the next stranger starts a new table. */
export const PUBLIC_SEATS = 7

export const LOUNGE_TABLE = { rx: 4.9, rz: 3.05 } as const

/** Card art the deck can show, by file name in frontend/src/assets/cards-webp. */
export const LOUNGE_FACES = [
    'wild-ten-draw', 'wild-draw-six', 'wild-reverse-four-draw', 'wild-roulette',
    'skip-everyone-red', 'discard-all-blue', 'four-draw-green', 'two-draw-yellow',
    'seven-swap-red', 'zero-blue', 'reverse-yellow', 'nine-green', 'skip-blue', 'five-red',
] as const
export type LoungeFace = (typeof LOUNGE_FACES)[number]

export type LoungeAct =
    | { kind: 'move'; x: number; z: number; drag: boolean }
    /**
     * The sender's own simulation of the skid: the points it passes through and,
     * when it hits someone, who and at which point. Every client plays this path
     * rather than simulating, so one flick lands on the same card on every screen.
     */
    | { kind: 'flick'; path: [number, number][]; hit?: string; hitAt?: number }
    | { kind: 'draw'; face: LoungeFace }

/** Longest flick path a client may send: a few bounces plus where it stops. */
export const LOUNGE_PATH_MAX = 24
const USER_ID = /^[A-Za-z0-9-]{1,64}$/

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const onTable = (x: number, z: number): [number, number] =>
    [clamp(x, -LOUNGE_TABLE.rx, LOUNGE_TABLE.rx), clamp(z, -LOUNGE_TABLE.rz, LOUNGE_TABLE.rz)]

/**
 * A relayable act, rebuilt from scratch so nothing the sender added rides along,
 * or null when the frame is not one. Positions are clamped onto the table.
 */
export function cleanLoungeAct(raw: unknown): LoungeAct | null {
    if (!raw || typeof raw !== 'object') return null
    const a = raw as Record<string, unknown>
    if (a.kind === 'move') {
        if (!finite(a.x) || !finite(a.z)) return null
        const [x, z] = onTable(a.x, a.z)
        return { kind: 'move', x, z, drag: a.drag === true }
    }
    if (a.kind === 'flick') {
        const path = a.path
        if (!Array.isArray(path) || path.length < 2 || path.length > LOUNGE_PATH_MAX) return null
        const points: [number, number][] = []
        for (const p of path) {
            if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) return null
            points.push(onTable(p[0], p[1]))
        }
        const act: Extract<LoungeAct, { kind: 'flick' }> = { kind: 'flick', path: points }
        const hitAt = a.hitAt
        if (typeof a.hit === 'string' && USER_ID.test(a.hit) && Number.isInteger(hitAt) && (hitAt as number) > 0 && (hitAt as number) < points.length) {
            act.hit = a.hit
            act.hitAt = hitAt as number
        }
        return act
    }
    if (a.kind === 'draw') {
        return (LOUNGE_FACES as readonly unknown[]).includes(a.face) ? { kind: 'draw', face: a.face as LoungeFace } : null
    }
    return null
}

/**
 * Where seat `i` of `n` stands before its player first moves. Every client
 * computes the same spot from the room's player order, so a late joiner and a
 * room that woke from hibernation agree without the server remembering anything.
 */
export function seatSpot(i: number, n: number): [number, number] {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n)
    return [Math.cos(a) * (LOUNGE_TABLE.rx - 0.55) * 0.85, Math.sin(a) * (LOUNGE_TABLE.rz - 0.45) * 0.85]
}
