import type { LoungeAct } from '@lounge'

/** What a tap or a drag on the table asks for: a relayable act, or a wave (sent as quick chat). */
export type LoungeIntent = LoungeAct | { kind: 'wave' }

/** A player's badge tier (1-based, utils/badges.ts) and all-time global rank. */
export interface LoungeRank { tier: number; global: number }

export interface LoungeJoin {
    id: string
    name: string
    skin?: string
    /** Omitted while it loads (plain card back); null for a player with no games (UNRANKED). */
    rank?: LoungeRank | null
    you?: boolean
    x?: number
    z?: number
    /** Already at the table when you arrived: no 'joined' toast or shockwave. */
    quiet?: boolean
}

export interface Lounge {
    join(p: LoungeJoin): unknown
    leave(id: string): void
    move(id: string, x: number, z: number, drag?: boolean): void
    flick(id: string, path: [number, number][], hit?: string, hitAt?: number): void
    simulateFlick(id: string, angle: number, speed: number): LoungeAct | null
    draw(id: string, face: string): void
    emote(id: string, text: string): void
    /** Redraws a seated player's card with their badge and rank, or UNRANKED for null. */
    setRank(id: string, rank: LoungeRank | null): void
    /** Resolves true when the deal finishes, false when reset() or dispose() cuts it short. */
    deal(): Promise<boolean>
    reset(): void
    pulse(strength?: number): void
    readonly players: Map<string, unknown>
    onIntent(fn: (i: LoungeIntent) => void): void
    /** `kind` marks the moments that make a sound: a card leaving the deck, a flick landing. */
    onEvent(fn: (e: { text: string; kind?: 'draw' | 'hit' }) => void): void
    readonly busy: boolean
    stats(): { geometries: number; textures: number }
    dispose(): void
}

export const TABLE: { rx: number; rz: number }

export function createLounge(o: {
    canvas: HTMLCanvasElement
    overlay: HTMLElement
    artUrl: (name: string) => string
    badgeUrl: (file: string) => string
    reducedMotion?: boolean
}): Promise<Lounge>
