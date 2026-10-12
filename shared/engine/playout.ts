/**
 * Plays a 1v1 game forward to the end through the real engine, applying the
 * same host policy the solo Pinia store does (frontend/src/stores/gameStore.ts):
 *  - a live stack is eaten whole, then the turn passes
 *  - a normal draw is draw-until-playable, and the playable card auto-plays
 *  - ending an action on one uncalled card: the player may call MERCY, else
 *    the opponent may catch it for a 10-card penalty
 *
 * Who decides what is a Seat. The bot's lookahead search and the difficulty
 * simulator both drive games through here, so they cannot drift apart.
 *
 * Approximation vs the store: catch windows resolve instantly instead of on a
 * timer.
 */

import type { Card, CardColor, EngineEvent, EngineState, Player, Rng } from './types'
import { canPlayCard } from './rules'
import * as engine from './engine'

export interface Seat {
    /** Card to play from WAITING_FOR_ACTION, or null to draw / eat the stack. */
    chooseCard(s: EngineState, me: Player, opp: Player, rng: Rng): Card | null
    /** Colour for a wild `me` is about to play (`me.hand` still holds it). */
    wildColor(s: EngineState, me: Player, opp: Player, rng: Rng): CardColor
    /** Colour named as the victim of a Colour Roulette. */
    rouletteColor(s: EngineState, me: Player, rng: Rng): CardColor
    /** After playing a 7: trade hands with `opp`? */
    wantsSwap(s: EngineState, me: Player, opp: Player, rng: Rng): boolean
    /** Which of a multi-match Discard All lands on top. */
    discardAllTop(s: EngineState, me: Player, cards: Card[], rng: Rng): Card
    /** On one uncalled card: calls MERCY in time? */
    callsMercy(rng: Rng): boolean
    /** The opponent sits on one uncalled card: catches it? */
    catchesMercy(rng: Rng): boolean
}

export const UNO_PENALTY = 10

/** Copy deep enough that a playout never touches the original. Cards are shared; the engine never mutates them. */
export function cloneState(s: EngineState): EngineState {
    return {
        players: s.players.map(p => ({ ...p, hand: [...p.hand] })),
        deck: [...s.deck],
        discardPile: [...s.discardPile],
        currentPlayerIndex: s.currentPlayerIndex,
        direction: s.direction,
        drawStack: s.drawStack,
        currentColor: s.currentColor,
        turnState: s.turnState,
        gameState: s.gameState,
        winnerId: s.winnerId,
        rouletteTargetColor: s.rouletteTargetColor,
        pendingDiscardAllCards: [...s.pendingDiscardAllCards],
        swapInitiatorId: s.swapInitiatorId,
        hasCalledUno: { ...s.hasCalledUno },
        stackingMode: s.stackingMode,
    }
}

export interface Playout {
    s: EngineState
    seats: Record<string, Seat>
    rng: Rng
    /** Optional log of every play and stack eaten, in order. */
    trace?: string[]
}

function other(s: EngineState, p: Player): Player {
    return s.players.find(x => x.id !== p.id)!
}

function applyEvents(g: Playout, ev: EngineEvent[]) {
    const { s, seats, rng } = g
    for (const e of ev) {
        if (e.t !== 'AT_ONE_UNCALLED') continue
        const p = s.players.find(x => x.id === e.playerId)!
        if (seats[p.id]!.callsMercy(rng)) {
            s.hasCalledUno[p.id] = true
        } else if (seats[other(s, p).id]!.catchesMercy(rng)) {
            engine.penalizeUnoDraws(s, p.id, UNO_PENALTY, [], rng)
        }
    }
}

/** Play `card` for `p`, the way the store's playCard does. `color` overrides the seat's wild colour. */
export function playFor(g: Playout, p: Player, card: Card, color?: CardColor) {
    const { s, seats, rng } = g
    const seat = seats[p.id]!
    const opp = other(s, p)
    const selectedColor = card.color === 'wild' && card.type !== 'wildColorRoulette'
        ? color ?? seat.wildColor(s, p, opp, rng)
        : undefined
    let discardAllTopPickId: string | undefined
    if (card.type === 'discardAll') {
        const matches = p.hand.filter(c => c.color === card.color && c.id !== card.id)
        if (matches.length > 1) discardAllTopPickId = seat.discardAllTop(s, p, matches, rng).id
    }
    g.trace?.push(`${p.id}:${card.id}`)
    const res = engine.playCard(s, p.id, card.id, { selectedColor, discardAllTopPickId, rng })
    applyEvents(g, res.events)
}

/** Eat the stack, or draw until playable and auto-play — the store's drawCardsForCurrentPlayer. */
export function drawFor(g: Playout, p: Player) {
    const { s, rng } = g
    const ev: EngineEvent[] = []
    if (s.drawStack > 0) {
        const n = s.drawStack
        s.drawStack = 0
        g.trace?.push(`${p.id}:eat${n}`)
        for (let i = 0; i < n; i++) {
            if (p.isEliminated || s.gameState === 'GAME_OVER') break
            engine.drawCardToHand(s, p.id, ev, rng)
        }
        if (s.gameState !== 'GAME_OVER') engine.advanceTurn(s, ev)
        applyEvents(g, ev)
        return
    }
    for (;;) {
        const top = engine.topCard(s)
        if (!top) { engine.advanceTurn(s, ev); break }
        const card = engine.drawCardToHand(s, p.id, ev, rng)
        if (!card) { engine.advanceTurn(s, ev); break }
        if (canPlayCard(card, top, s.currentColor, 0, s.stackingMode)) {
            applyEvents(g, ev)
            playFor(g, p, card)
            return
        }
        if (p.isEliminated) { engine.advanceTurn(s, ev); break }
    }
    applyEvents(g, ev)
}

/** One decision point. Returns false once the game is over. */
export function step(g: Playout): boolean {
    const { s, seats, rng } = g
    if (s.gameState !== 'PLAYING') return false
    const p = engine.currentPlayer(s)!
    const seat = seats[p.id]!
    const opp = other(s, p)
    switch (s.turnState) {
        case 'CHOOSING_ROULETTE_COLOR':
        case 'ROULETTE_DRAWING': {
            if (s.turnState === 'CHOOSING_ROULETTE_COLOR') engine.setRouletteColor(s, seat.rouletteColor(s, p, rng))
            const ev: EngineEvent[] = []
            for (;;) {
                const out = engine.rouletteDrawStep(s, ev, rng)
                if (out === 'match' || out === 'eliminated') { engine.finishRouletteTurn(s, ev); break }
                if (out !== 'continue') break
            }
            applyEvents(g, ev)
            break
        }
        case 'CHOOSING_PLAYER_TO_SWAP': {
            const ev: EngineEvent[] = []
            if (seat.wantsSwap(s, p, opp, rng)) engine.swapHands(s, opp.id, ev)
            else engine.skipSwap(s, ev)
            applyEvents(g, ev)
            break
        }
        case 'CHOOSING_DISCARD_ALL_TOP': {
            const pick = seat.discardAllTop(s, p, s.pendingDiscardAllCards, rng)
            applyEvents(g, engine.selectDiscardAllTop(s, pick.id, rng))
            break
        }
        case 'WAITING_FOR_ACTION': {
            const card = seat.chooseCard(s, p, opp, rng)
            if (card) {
                playFor(g, p, card)
            } else {
                drawFor(g, p)
            }
            break
        }
        default:
            s.turnState = 'WAITING_FOR_ACTION'
    }
    return s.gameState === 'PLAYING'
}

/** Run to the end (or `maxSteps`). Returns steps taken. */
export function playOut(g: Playout, maxSteps: number): number {
    let n = 0
    while (n < maxSteps && step(g)) n++
    return n
}
