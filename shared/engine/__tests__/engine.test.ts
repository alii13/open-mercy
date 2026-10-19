import { describe, expect, it } from 'vitest'
import type { Card, EngineEvent, EngineState, Player } from '../types'
import { generateFullDeck, getDeckBreakdown } from '../deck'
import { canPlayCard } from '../rules'
import {
    playCard,
    rouletteDrawStep,
    finishRouletteTurn,
    selectDiscardAllTop,
    drawCardToHand,
    eliminatePlayer,
} from '../engine'

function card(id: string, color: Card['color'], type: Card['type'], value?: number): Card {
    return { id, color, type, value }
}

function player(id: string, name: string, hand: Card[] = []): Player {
    return { id, name, hand, isEliminated: false, score: 0 }
}

const red5 = card('c-red-5', 'red', 'number', 5)

function makeState(overrides: Partial<EngineState> = {}): EngineState {
    return {
        players: [],
        deck: [],
        discardPile: [red5],
        currentPlayerIndex: 0,
        direction: 1,
        drawStack: 0,
        currentColor: 'red',
        turnState: 'WAITING_FOR_ACTION',
        gameState: 'PLAYING',
        winnerId: null,
        rouletteTargetColor: null,
        pendingDiscardAllCards: [],
        swapInitiatorId: null,
        hasCalledUno: {},
        stackingMode: 'official',
        ...overrides,
    }
}

describe('deck composition', () => {
    it('generates the full 168-card No Mercy deck', () => {
        const deck = generateFullDeck()
        expect(deck.length).toBe(168)
        const breakdown = getDeckBreakdown(deck)
        expect(breakdown['number-0']).toBe(4)
        expect(breakdown['number-5']).toBe(8)
        expect(breakdown['skipEveryone-red']).toBe(3)
        expect(breakdown['discardAll-blue']).toBe(3)
        expect(breakdown['wild-wild']).toBe(4)
        expect(breakdown['wildColorRoulette-wild']).toBe(4)
    })
})

describe('canPlayCard stacking', () => {
    const topDraw4 = card('t', 'red', 'draw4')
    it('official mode requires equal-or-higher draw value', () => {
        expect(canPlayCard(card('a', 'blue', 'draw2'), topDraw4, 'red', 4, 'official')).toBe(false)
        expect(canPlayCard(card('b', 'blue', 'draw4'), topDraw4, 'red', 4, 'official')).toBe(true)
        expect(canPlayCard(card('c', 'wild', 'draw6'), topDraw4, 'red', 4, 'official')).toBe(true)
    })
    it('non-draw cards never answer a stack', () => {
        expect(canPlayCard(red5, topDraw4, 'red', 4, 'casual')).toBe(false)
    })
})

describe('playCard', () => {
    it('detects a win when wildColorRoulette is played as the last card', () => {
        const roulette = card('c-roul', 'wild', 'wildColorRoulette')
        const s = makeState({
            players: [player('p-0', 'You', [roulette]), player('p-1', 'Bot')],
        })

        const res = playCard(s, 'p-0', 'c-roul')

        expect(res.ok).toBe(true)
        expect(s.winnerId).toBe('p-0')
        expect(s.gameState).toBe('GAME_OVER')
    })

    it('rotates hands only among active players when a 0 is played', () => {
        const zero = card('c-zero', 'red', 'number', 0)
        const cardA = card('c-a', 'blue', 'number', 1)
        const cardB = card('c-b', 'green', 'number', 2)
        const cardC = card('c-c', 'yellow', 'number', 3)
        const elim = player('p-1', 'Elim', [])
        elim.isEliminated = true
        const s = makeState({
            players: [player('p-0', 'You', [zero, cardA]), elim, player('p-2', 'Bot', [cardB, cardC])],
        })

        playCard(s, 'p-0', 'c-zero')

        expect(s.players[1]!.hand).toEqual([])
        expect(s.players[0]!.hand.map(c => c.id).sort()).toEqual(['c-b', 'c-c'])
        expect(s.players[2]!.hand.map(c => c.id)).toEqual(['c-a'])
    })

    it('applies the top card effect on a single-match Discard All', () => {
        const discallRed = card('c-da', 'red', 'discardAll')
        const redReverse = card('c-rr', 'red', 'reverse')
        const blue3 = card('c-b3', 'blue', 'number', 3)
        const s = makeState({
            players: [player('p-0', 'You', [discallRed, redReverse, blue3]), player('p-1', 'B1'), player('p-2', 'B2')],
        })

        playCard(s, 'p-0', 'c-da')

        expect(s.direction).toBe(-1)
        expect(s.players[0]!.hand.map(c => c.id)).toEqual(['c-b3'])
    })

    it('wins through the picker when a Discard All empties the hand', () => {
        const discallRed = card('c-da', 'red', 'discardAll')
        const r3 = card('c-r3', 'red', 'number', 3)
        const r9 = card('c-r9', 'red', 'number', 9)
        const s = makeState({
            players: [player('p-0', 'You', [discallRed, r3, r9]), player('p-1', 'B1')],
        })

        // Multiple matches without a host pick → picker state (the top-card
        // choice is the player's), never a silent resolve.
        playCard(s, 'p-0', 'c-da')
        expect(s.turnState).toBe('CHOOSING_DISCARD_ALL_TOP')

        // Resolving empties the hand → immediate win, no stranded turn.
        selectDiscardAllTop(s, 'c-r3')
        expect(s.winnerId).toBe('p-0')
        expect(s.gameState).toBe('GAME_OVER')
        expect(s.pendingDiscardAllCards).toEqual([])
    })

    it('advances the turn when a Discard All matches nothing else in hand', () => {
        // The played card is already out of the hand when the effect runs, so a
        // Discard All whose colour is unique in the hand has zero cards left to
        // dump. That must still be a normal completed play.
        const discallRed = card('c-da', 'red', 'discardAll')
        const blue3 = card('c-b3', 'blue', 'number', 3)
        const s = makeState({
            players: [player('p-0', 'You', [discallRed, blue3]), player('p-1', 'B1')],
        })

        const res = playCard(s, 'p-0', 'c-da')

        expect(res.ok).toBe(true)
        expect(s.turnState).toBe('WAITING_FOR_ACTION')
        expect(s.currentPlayerIndex).toBe(1)
        expect(res.events.some(e => e.t === 'TURN_ADVANCED')).toBe(true)
    })

    it('wins when a Discard All that matches nothing else is the last card', () => {
        const discallRed = card('c-da', 'red', 'discardAll')
        const s = makeState({
            players: [player('p-0', 'You', [discallRed]), player('p-1', 'B1')],
        })

        const res = playCard(s, 'p-0', 'c-da')

        expect(res.ok).toBe(true)
        expect(s.winnerId).toBe('p-0')
        expect(s.gameState).toBe('GAME_OVER')
    })

    it('enters the picker state on a multi-match Discard All without a pick', () => {
        const discallRed = card('c-da', 'red', 'discardAll')
        const r3 = card('c-r3', 'red', 'number', 3)
        const r9 = card('c-r9', 'red', 'number', 9)
        const blue3 = card('c-b3', 'blue', 'number', 3)
        const s = makeState({
            players: [player('p-0', 'You', [discallRed, r3, r9, blue3]), player('p-1', 'B1')],
        })

        const res = playCard(s, 'p-0', 'c-da')

        expect(s.turnState).toBe('CHOOSING_DISCARD_ALL_TOP')
        expect(s.pendingDiscardAllCards.map(c => c.id).sort()).toEqual(['c-r3', 'c-r9'])
        expect(res.events.some(e => e.t === 'CHOOSE_DISCARD_ALL_TOP')).toBe(true)

        // Resolving via the picker passes the turn with the chosen top applied.
        selectDiscardAllTop(s, 'c-r9')
        expect(s.turnState).toBe('WAITING_FOR_ACTION')
        expect(s.currentPlayerIndex).toBe(1)
        expect(s.discardPile[s.discardPile.length - 1]!.id).toBe('c-r9')
        expect(s.players[0]!.hand.map(c => c.id)).toEqual(['c-b3'])
    })

    it('keeps the turn after Skip Everyone and reports PLAY_AGAIN', () => {
        const skipAll = card('c-se', 'red', 'skipEveryone')
        const s = makeState({
            players: [player('p-0', 'You', [skipAll, red5]), player('p-1', 'B1')],
        })

        const res = playCard(s, 'p-0', 'c-se')

        expect(s.currentPlayerIndex).toBe(0)
        expect(res.events.some(e => e.t === 'PLAY_AGAIN')).toBe(true)
        expect(res.events.some(e => e.t === 'TURN_ADVANCED')).toBe(false)
    })

    it('flags AT_ONE_UNCALLED at 1 card and wins on going out', () => {
        const s = makeState({
            players: [
                player('p-0', 'You', [card('c-play', 'red', 'number', 5), card('c-extra', 'red', 'number', 2)]),
                player('p-1', 'B1', [red5]),
            ],
            deck: Array.from({ length: 10 }, (_, i) => card(`d-${i}`, 'blue', 'number', 3)),
        })

        // 2 → 1 without calling UNO: host is told (it decides catch windows /
        // bot auto-calls); the rules themselves apply no penalty here.
        const res = playCard(s, 'p-0', 'c-play')
        expect(res.events.some(e => e.t === 'AT_ONE_UNCALLED')).toBe(true)
        expect(s.players[0]!.hand.length).toBe(1)

        // Going out from 1 card wins; UNO exposure was the catch window.
        s.currentPlayerIndex = 0
        s.turnState = 'WAITING_FOR_ACTION'
        playCard(s, 'p-0', 'c-extra')
        expect(s.winnerId).toBe('p-0')
        expect(s.gameState).toBe('GAME_OVER')
    })

    it('wins with a 0 as the last card instead of rotating the empty hand away', () => {
        const s = makeState({
            players: [
                player('p-0', 'You', [card('c-red-0', 'red', 'number', 0)]),
                player('p-1', 'B1', [red5, card('c-x', 'blue', 'number', 3)]),
                player('p-2', 'B2', [card('c-y', 'green', 'number', 4)]),
            ],
            hasCalledUno: { 'p-0': true },
        })

        playCard(s, 'p-0', 'c-red-0')

        expect(s.winnerId).toBe('p-0')
        expect(s.gameState).toBe('GAME_OVER')
        expect(s.players[1]!.hand.length).toBe(2)
        expect(s.players[2]!.hand.length).toBe(1)
    })
})

describe('roulette', () => {
    it('ends the turn instead of spinning forever when nothing can be drawn', () => {
        const s = makeState({
            players: [player('p-0', 'You'), player('p-1', 'Friend')],
            deck: [],
            discardPile: [red5],
            currentPlayerIndex: 1,
            turnState: 'ROULETTE_DRAWING',
            rouletteTargetColor: 'blue',
        })
        const ev: EngineEvent[] = []

        const outcome = rouletteDrawStep(s, ev)

        expect(outcome).toBe('exhausted')
        expect(s.turnState).toBe('WAITING_FOR_ACTION')
        expect(s.currentPlayerIndex).toBe(0)
        expect(ev.some(e => e.t === 'TURN_ADVANCED')).toBe(true)
    })

    it('keeps the matching card in the hand and reports match', () => {
        const s = makeState({
            players: [player('p-0', 'You'), player('p-1', 'Victim', [red5])],
            deck: [card('d-blue', 'blue', 'number', 4)],
            discardPile: [card('d-roul', 'wild', 'wildColorRoulette')],
            currentPlayerIndex: 1,
            turnState: 'ROULETTE_DRAWING',
            rouletteTargetColor: 'blue',
        })
        const ev: EngineEvent[] = []

        const outcome = rouletteDrawStep(s, ev)

        // A first-card match must still cost the victim the card they drew —
        // discarding it read as "the roulette did nothing but change color".
        expect(outcome).toBe('match')
        expect(s.players[1]!.hand.map(c => c.id)).toEqual(['c-red-5', 'd-blue'])
        expect(s.discardPile[s.discardPile.length - 1]!.id).toBe('d-roul')
        expect(s.currentColor).toBe('blue')
    })

    it('clears the target color once the roulette turn finishes', () => {
        const s = makeState({
            players: [player('p-0', 'You'), player('p-1', 'Victim', [red5])],
            currentPlayerIndex: 1,
            turnState: 'ROULETTE_DRAWING',
            rouletteTargetColor: 'blue',
        })
        const ev: EngineEvent[] = []

        finishRouletteTurn(s, ev)

        expect(s.rouletteTargetColor).toBeNull()
        expect(s.turnState).toBe('WAITING_FOR_ACTION')
        expect(s.currentPlayerIndex).toBe(0)
    })
})

describe('forced elimination (kick)', () => {
    it('dumps the hand, unparks the turn, and clears a pending stack', () => {
        const s = makeState({
            players: [player('p-0', 'A', [red5]), player('p-1', 'B', [blueCard('k-1'), blueCard('k-2')]), player('p-2', 'C', [red5])],
            currentPlayerIndex: 1,
            drawStack: 4,
            turnState: 'WAITING_FOR_ACTION',
        })
        const ev: EngineEvent[] = []

        expect(eliminatePlayer(s, 'p-1', ev)).toBe(true)

        expect(s.players[1]!.isEliminated).toBe(true)
        expect(s.players[1]!.hand).toEqual([])
        expect(s.drawStack).toBe(0)
        expect(s.currentPlayerIndex).toBe(2)
        expect(s.gameState).toBe('PLAYING')
        expect(ev.some(e => e.t === 'ELIMINATED')).toBe(true)
    })

    it('ends the game when only one player remains', () => {
        const s = makeState({
            players: [player('p-0', 'A', [red5]), player('p-1', 'B', [red5])],
        })
        const ev: EngineEvent[] = []

        eliminatePlayer(s, 'p-1', ev)

        expect(s.winnerId).toBe('p-0')
        expect(s.gameState).toBe('GAME_OVER')
    })
})

function blueCard(id: string): Card {
    return card(id, 'blue', 'number', 3)
}

describe('mercy rule', () => {
    it('eliminates at 25 cards and ends the game when one player remains', () => {
        const bigHand = Array.from({ length: 24 }, (_, i) => card(`h-${i}`, 'green', 'number', 2))
        const s = makeState({
            players: [player('p-0', 'You', bigHand), player('p-1', 'B1', [red5])],
            deck: [card('d-0', 'blue', 'number', 3)],
        })
        const ev: EngineEvent[] = []

        drawCardToHand(s, 'p-0', ev)

        expect(s.players[0]!.isEliminated).toBe(true)
        expect(s.players[0]!.hand).toEqual([])
        expect(s.winnerId).toBe('p-1')
        expect(s.gameState).toBe('GAME_OVER')
        expect(ev.some(e => e.t === 'ELIMINATED')).toBe(true)
        expect(ev.some(e => e.t === 'GAME_OVER')).toBe(true)
    })
})
