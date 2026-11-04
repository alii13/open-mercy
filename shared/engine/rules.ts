import type { Card, CardColor, GameRuleset, Rng } from './types'
import { shuffleDeck } from './deck'

export type { StackingMode } from './types'
import type { StackingMode } from './types'

export const DEFAULT_STACKING_MODE: StackingMode = 'official'

/**
 * Checks if a card can be played on top of the current top card.
 *
 * Stacking modes:
 *  - 'official': any draw card stacks only if its draw value >= the top card's
 *  - 'house':    wild draw cards stack on any draw card; colored draw cards still need equal-or-higher
 *  - 'casual':   any draw card stacks on any draw card
 */
export function canPlayCard(
    card: Card,
    topCard: Card,
    currentColor: CardColor,
    drawStack: number,
    stackingMode: StackingMode = DEFAULT_STACKING_MODE,
    ruleset: GameRuleset = 'mercy',
): boolean {
    // Classic penalties are never stackable. The affected player must resolve
    // the draw (or the dedicated +4 challenge) instead of playing a card.
    if (ruleset !== 'mercy' && drawStack > 0) return false

    // 1. Stacking Logic - varies by stacking mode
    if (drawStack > 0) {
        const drawVal = getDrawValue(card)
        if (drawVal <= 0) return false

        if (stackingMode === 'casual') {
            return true
        }

        if (stackingMode === 'house') {
            // Wild draw cards stack on anything
            if (card.color === 'wild') return true
            // Colored draw cards still need equal-or-higher
            return drawVal >= getDrawValue(topCard)
        }

        // 'official'
        return drawVal >= getDrawValue(topCard)
    }

    // 2. Standard Uno Logic

    // Wilds are always playable
    if (card.color === 'wild') return true

    // Color Match
    if (card.color === currentColor) return true

    // Value/Symbol Match
    if (card.type === topCard.type) {
        if (card.type === 'number') {
            return card.value === topCard.value
        }
        return true
    }

    return false
}

export function getDrawValue(card: Card): number {
    switch (card.type) {
        case 'draw2': return 2
        case 'draw4': return 4
        case 'wildReverseDraw4': return 4
        case 'draw6': return 6
        case 'draw10': return 10
        default: return 0
    }
}

export function getNextPlayerIndex(
    current: number,
    direction: 1 | -1,
    playerCount: number
): number {
    let next = current + direction
    if (next >= playerCount) next = 0
    if (next < 0) next = playerCount - 1
    return next
}

/**
 * Calculate the next player index based on current position and direction
 */
export function calculateNextPlayerIndex(
    currentIndex: number,
    direction: 1 | -1,
    playerCount: number
): number {
    let nextIdx = currentIndex + direction
    if (nextIdx < 0) nextIdx = playerCount - 1
    if (nextIdx >= playerCount) nextIdx = 0
    return nextIdx
}

/**
 * Calculate score for a winning player based on opponents' remaining hands
 */
export function calculateScore(
    hands: Card[][],
    eliminatedFlags: boolean[]
): number {
    let totalPoints = 0

    hands.forEach((hand, idx) => {
        if (eliminatedFlags[idx]) {
            // Rule: CAUSE a player to be eliminated = 250 bonus points
            totalPoints += 250
        } else {
            hand.forEach(card => {
                if (card.color === 'wild') {
                    totalPoints += 50
                } else if (card.type !== 'number') {
                    totalPoints += 20
                } else {
                    totalPoints += card.value || 0
                }
            })
        }
    })

    return totalPoints
}

/**
 * Reshuffle discard pile into deck when deck is empty.
 * Mutates both arrays in place; returns false if not enough cards.
 */
export function reshuffleDeck(
    deck: Card[],
    discardPile: Card[],
    rng: Rng = Math.random
): boolean {
    if (discardPile.length <= 1) return false

    const top = discardPile.pop()!
    const rest = [...discardPile]

    // Clear and refill deck with shuffled cards
    deck.length = 0
    deck.push(...shuffleDeck(rest, rng))

    // Reset discard pile to just the top card
    discardPile.length = 0
    discardPile.push(top)

    return true
}

/**
 * Check if mercy rule is triggered (25+ cards in hand)
 */
export function checkMercyRule(handLength: number): boolean {
    return handLength >= 25
}

/**
 * Pick the most common color from a hand (used for wild card color selection)
 */
export function getWildCardColor(hand: Card[], rng: Rng = Math.random): CardColor {
    const counts = hand.reduce((acc, card) => {
        if (card.color !== 'wild') {
            acc[card.color] = (acc[card.color] || 0) + 1
        }
        return acc
    }, {} as Record<string, number>)

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const bestColor = sorted[0]?.[0] as CardColor | undefined

    // Fallback to random color if no colored cards in hand
    if (!bestColor) {
        const colors: CardColor[] = ['red', 'blue', 'green', 'yellow']
        return colors[Math.floor(rng() * colors.length)]!
    }

    return bestColor
}

/**
 * Count a hand's cards per pickable color (wilds excluded).
 * Used by the color picker to show what each choice keeps playable.
 */
export function countByColor(hand: Card[]): Record<'red' | 'blue' | 'green' | 'yellow', number> {
    const counts = { red: 0, blue: 0, green: 0, yellow: 0 }
    hand.forEach(card => {
        if (card.color !== 'wild') counts[card.color]++
    })
    return counts
}

/**
 * Rotate hands between players (for 0 card effect)
 */
export function rotateHands(hands: Card[][], direction: 1 | -1): Card[][] {
    const playerCount = hands.length
    if (playerCount < 2) return hands.map(h => [...h])

    const rotated: Card[][] = []
    for (let i = 0; i < playerCount; i++) {
        let sourceIdx = i - direction
        if (sourceIdx < 0) sourceIdx = playerCount - 1
        if (sourceIdx >= playerCount) sourceIdx = 0
        rotated.push([...(hands[sourceIdx] || [])])
    }

    return rotated
}
