import type { Card, CardColor, CardType, Rng } from './types'

let idCounter = 0

function createCard(color: CardColor, type: CardType, value?: number): Card {
    return {
        id: `card-${idCounter++}`,
        color,
        type,
        value,
        isPlayable: false // Default
    }
}

export function generateFullDeck(): Card[] {
    idCounter = 0
    const deck: Card[] = []
    const colors: CardColor[] = ['red', 'blue', 'green', 'yellow']

    // Mattel's UNO Show 'Em No Mercy box (HWV18): 168 cards, no plain Wild.
    colors.forEach(color => {
        // Number cards: 2 of each 0-9 per color (80)
        for (let i = 0; i <= 9; i++) {
            deck.push(createCard(color, 'number', i))
            deck.push(createCard(color, 'number', i))
        }

        // Skip, Reverse, Draw 2, Discard All: 3 of each per color (48)
        for (let i = 0; i < 3; i++) {
            deck.push(createCard(color, 'skip'))
            deck.push(createCard(color, 'reverse'))
            deck.push(createCard(color, 'draw2'))
            deck.push(createCard(color, 'discardAll'))
        }

        // Draw 4 and Skip Everyone: 2 of each per color (16)
        for (let i = 0; i < 2; i++) {
            deck.push(createCard(color, 'draw4'))
            deck.push(createCard(color, 'skipEveryone'))
        }
    })

    // Wilds (24): 8 Wild Reverse Draw 4, 8 Wild Color Roulette, 4 Wild Draw 6, 4 Wild Draw 10
    for (let i = 0; i < 8; i++) {
        deck.push(createCard('wild', 'wildReverseDraw4'))
        deck.push(createCard('wild', 'wildColorRoulette'))
    }
    for (let i = 0; i < 4; i++) {
        deck.push(createCard('wild', 'draw6'))
        deck.push(createCard('wild', 'draw10'))
    }

    return deck
}

export function shuffleDeck(deck: Card[], rng: Rng = Math.random): Card[] {
    const newDeck = [...deck]
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        const temp = newDeck[i]!
        newDeck[i] = newDeck[j]!
        newDeck[j] = temp
    }
    return newDeck
}

export function verifyDeck(deck: Card[]) {
    return {
        count: deck.length,
        valid: deck.length > 0
    }
}

export function getDeckBreakdown(deck: Card[]): Record<string, number> {
    const breakdown: Record<string, number> = {}

    deck.forEach(card => {
        const key = card.type === 'number'
            ? `${card.type}-${card.value}`
            : `${card.type}-${card.color}`
        breakdown[key] = (breakdown[key] || 0) + 1
    })

    return breakdown
}
