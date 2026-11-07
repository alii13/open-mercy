import type { LoungeAct } from '@lounge'

/** What a tap or a drag on the table asks for: a relayable act, or a wave (sent as quick chat). */
export type LoungeIntent = LoungeAct | { kind: 'wave' }

export interface LoungeJoin {
    id: string
    name: string
    skin?: string
    rank?: { tier: number; global: number } | null
    you?: boolean
    x?: number
    z?: number
}

export interface Lounge {
    join(p: LoungeJoin): unknown
    leave(id: string): void
    move(id: string, x: number, z: number, drag?: boolean): void
    flick(id: string, path: [number, number][], hit?: string, hitAt?: number): void
    simulateFlick(id: string, angle: number, speed: number): LoungeAct | null
    draw(id: string, face: string): void
    emote(id: string, text: string): void
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
