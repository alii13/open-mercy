import type { Card, CardColor, StackingMode, TurnState } from './engine'
import type { LoungeAct } from './lounge'

// --- Turn clock: the room plays a turn for anyone who lets it run out ---

export const TURN_LIMIT_MS = 2 * 60 * 1000
/** Clients start counting down out loud at this much time left. */
export const TURN_WARNING_MS = 30 * 1000
/** Turns in a row a seat may run out the clock before it is out of the game. */
export const MAX_TURN_TIMEOUTS = 3

export interface PresencePlayer {
    userId: string
    name: string
    connected: boolean
    /** Equipped card-back skin id — cosmetic, client-reported. */
    skin?: string
}

// --- Intents: what a client may ask the authoritative room to do ---

export type IntentAction =
    | { kind: 'PLAY_CARD'; cardId: string; chosenColor?: CardColor }
    | { kind: 'DRAW' }
    | { kind: 'PICK_DISCARD_ALL_TOP'; cardId: string }
    | { kind: 'CHOOSE_DRAWN_WILD_COLOR'; color: CardColor }
    | { kind: 'SET_ROULETTE_COLOR'; color: CardColor }
    | { kind: 'SWAP_HANDS'; targetUserId: string }
    | { kind: 'SKIP_SWAP' }
    | { kind: 'CALL_UNO' }
    | { kind: 'CATCH_UNO'; targetUserId: string }

export type ClientMsg =
    | { t: 'auth'; token: string; name: string; skin?: string }
    | { t: 'ping'; now: number }
    | { t: 'leave' }
    | { t: 'rename'; name: string }
    | { t: 'kick'; userId: string }
    | { t: 'start'; stackingMode?: StackingMode }
    // Hold the public lobby open a minute longer. Anyone at the table may
    // press it; the allowance is the room's, not the player's.
    | { t: 'extend-start' }
    // Ask a player to this room. It rides the room socket rather than going
    // to Supabase from the client, because only the room can confirm the
    // sender is in it - see game-server/src/invites.ts.
    | { t: 'invite'; userId: string }
    | { t: 'voice-join' }
    | { t: 'badge-up'; tier: number }
    // Quick chat is id-only (see shared/quickChat.ts) — no free text crosses
    // the socket, so there is nothing to moderate.
    | { t: 'chat'; phraseId: string }
    | { t: 'intent'; id: string; action: IntentAction }
    // The 3D public table: a move, flick or draw, relayed to the rest of the
    // table while a public room is in its lobby. See shared/lounge.ts.
    | { t: 'lounge'; act: LoungeAct }

// --- Game events: animation-grade facts, personalized per viewer ---

export type GameEvent =
    | { t: 'STARTED' }
    | { t: 'CARD_PLAYED'; by: string; card: Card; chosenColor?: CardColor }
    | { t: 'YOU_DREW'; cards: Card[] }
    | { t: 'PLAYER_DREW'; playerId: string; count: number }
    | { t: 'STACK_EATEN'; playerId: string; amount: number }
    | { t: 'RESHUFFLED' }
    | { t: 'ELIMINATED'; playerId: string }
    | { t: 'UNO_PENALTY'; playerId: string }
    | { t: 'AT_ONE'; playerId: string }
    | { t: 'UNO_CALLED'; playerId: string }
    | { t: 'UNO_WINDOW_OPEN'; playerId: string }
    | { t: 'UNO_WINDOW_CLOSED'; playerId: string }
    | { t: 'TURN_AUTO_RESOLVED'; playerId: string }
    // The clock ran out; `timeouts` counts this seat's misses in a row, and
    // reaching MAX_TURN_TIMEOUTS takes it out (an ELIMINATED follows).
    | { t: 'TURN_TIMED_OUT'; playerId: string; timeouts: number }
    | { t: 'ROULETTE_ENDED'; playerId: string; outcome: 'match' | 'eliminated' | 'exhausted'; matchCard?: Card }
    | { t: 'GAME_OVER'; winnerId: string }

// --- Personalized snapshot: everything a client may know ---

export interface SnapshotPlayer {
    userId: string
    name: string
    seat: number
    handCount: number
    isEliminated: boolean
    connected: boolean
    calledUno: boolean
    /** Turns in a row this seat ran out the clock on. Older servers omit it. */
    timeouts?: number
    /** Out of the game for running out the clock, not by the mercy rule. */
    timedOut?: boolean
}

export interface PersonalView {
    status: 'lobby' | 'playing' | 'finished'
    /** Distinct per dealt game (rematches in one room get new ids); null in the lobby. */
    gameId: string | null
    hostUserId: string | null
    players: SnapshotPlayer[]
    you: { userId: string; seat: number; hand: Card[] } | null
    currentPlayerId: string | null
    turnState: TurnState
    direction: 1 | -1
    drawStack: number
    currentColor: CardColor
    discardTop: Card | null
    deckCount: number
    discardCount: number
    rouletteTargetColor: CardColor | null
    /** Only present for the player who must pick a Discard All top card. */
    pendingDiscardAllCards: Card[] | null
    /** Only present for the player who drew a playable wild. */
    pendingDrawnWildCard: Card | null
    stackingMode: StackingMode
    winnerId: string | null
    /** Time left on the current turn when this snapshot was sent, as a duration
     *  so client clock skew cannot bend it. Absent or null = no clock running. */
    turnEndsInMs?: number | null
}

export type ServerMsg =
    // isPublic: a quick-match room, which the client shows as the 3D table.
    // Older servers omit it, and the client keeps the list view.
    | { t: 'hello'; roomCode: string; userId: string; hostUserId: string | null; isPublic?: boolean }
    // autoStartInMs: countdown remaining for a public lobby, sent as a
    // duration so client clock skew cannot bend it; absent = no countdown.
    // autoStartPaused: the room dipped below the minimum and the clock froze.
    // autoStartBumpsLeft: extensions the room can still buy; 0 hides the button.
    // spots: each seated player's last spot on the 3D table, for a late joiner.
    | { t: 'presence'; players: PresencePlayer[]; autoStartInMs?: number; autoStartPaused?: boolean; autoStartBumpsLeft?: number; spots?: Record<string, [number, number]> }
    | { t: 'pong'; now: number }
    | { t: 'snapshot'; seq: number; game: PersonalView }
    | { t: 'event'; seq: number; ev: GameEvent; intentId?: string }
    | { t: 'voice-token'; token: string; meetingId: string }
    | { t: 'badge-up'; userId: string; tier: number }
    | { t: 'chat'; userId: string; phraseId: string }
    | { t: 'lounge'; userId: string; act: LoungeAct }
    // The outcome of one invite, back to whoever asked. Every value is a
    // normal answer, including the refusals.
    | { t: 'invite-result'; userId: string; result: string }
    | { t: 'error'; code: 'unauthorized' | 'bad-message' | 'room-not-found' | 'room-full' | 'not-host' | 'not-started' | 'already-started' | 'need-players' | 'not-in-lobby' | 'invalid-intent' | 'voice-unavailable'; intentId?: string }
