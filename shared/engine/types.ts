export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild'

export type CardType =
    | 'number'
    | 'skip'
    | 'reverse'
    | 'draw2'
    | 'skipEveryone'
    | 'discardAll'
    | 'wild'
    | 'draw4'
    | 'draw6'
    | 'draw10'
    | 'wildReverseDraw4'
    | 'wildColorRoulette'
    | 'fateSwap'
    | 'curseMirror'
    | 'diceCurse'
    | 'runeShield'
    | 'runeWhirl'

export interface Card {
    id: string
    color: CardColor
    type: CardType
    value?: number // 0-9
    isPlayable?: boolean
}

export interface Player {
    id: string
    name: string
    hand: Card[]
    isEliminated: boolean
    isBot?: boolean
    score?: number
}

export type GameState = 'LOBBY' | 'PLAYING' | 'GAME_OVER'

export type GameRuleset = 'mercy' | 'classic' | 'chaos'

export type TurnState =
    | 'WAITING_FOR_ACTION'
    | 'CHOOSING_COLOR'
    | 'CHOOSING_PLAYER_TO_SWAP'
    | 'STACKING_RESPONSE'
    | 'ROULETTE_DRAWING'
    | 'CHOOSING_ROULETTE_COLOR'
    | 'CHOOSING_DRAWN_WILD_COLOR'
    | 'CHOOSING_DRAWN_CARD'
    | 'AWAITING_DRAW4_CHALLENGE'
    | 'AWAITING_CHAOS_REACTION'
    | 'CHAOS_EVENT'
    | 'CHOOSING_DISCARD_ALL_TOP'
    | 'DEALING'

export type StackingMode = 'official' | 'house' | 'casual'

export type Rng = () => number

/**
 * The complete rules-relevant state of a game. Engine functions mutate it in
 * place; hosts (Pinia store, Durable Object) own where it lives. Anything not
 * here — timers, sounds, animation flags, bot policy — is host concern.
 */
export interface EngineState {
    players: Player[]
    deck: Card[]
    discardPile: Card[]
    currentPlayerIndex: number
    direction: 1 | -1
    drawStack: number
    currentColor: CardColor
    turnState: TurnState
    gameState: GameState
    winnerId: string | null
    rouletteTargetColor: CardColor | null
    pendingDiscardAllCards: Card[]
    swapInitiatorId: string | null
    hasCalledUno: Record<string, boolean>
    stackingMode: StackingMode
    /** Undefined on legacy state means the original Mercy ruleset. */
    ruleset?: GameRuleset
}

/**
 * What happened during a transition, for the host to map onto sounds, stats,
 * announcements, and policy (e.g. whether a bot auto-calls UNO).
 */
export type EngineEvent =
    | { t: 'RESHUFFLE' }
    | { t: 'DRAW'; playerId: string; card: Card }
    | { t: 'ELIMINATED'; playerId: string }
    | { t: 'GAME_OVER'; winnerId: string }
    | { t: 'UNO_PENALTY'; playerId: string }
    | { t: 'AT_ONE_UNCALLED'; playerId: string }
    | { t: 'TURN_ADVANCED' }
    | { t: 'PLAY_AGAIN' }
    | { t: 'CHOOSE_DISCARD_ALL_TOP'; playerId: string }
