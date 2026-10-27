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

    colors.forEach(color => {
        // Number Cards: 0 (1 of each), 1-9 (2 of each)
        deck.push(createCard(color, 'number', 0))
        for (let i = 1; i <= 9; i++) {
            deck.push(createCard(color, 'number', i))
            deck.push(createCard(color, 'number', i))
        }

        // Action Cards: 3 of each per color (Total 72)
        for (let i = 0; i < 3; i++) {
            deck.push(createCard(color, 'skip'))
            deck.push(createCard(color, 'reverse'))
            deck.push(createCard(color, 'draw2'))
            deck.push(createCard(color, 'draw4'))
            deck.push(createCard(color, 'skipEveryone'))
            deck.push(createCard(color, 'discardAll'))
        }
    })

    // Wild Cards: 4 plain wilds + special wilds
    // Plain Wild cards (choose color, no penalty)
    for (let i = 0; i < 4; i++) {
        deck.push(createCard('wild', 'wild'))
    }
    // Special Wild cards: 4 of each type
    for (let i = 0; i < 4; i++) {
        deck.push(createCard('wild', 'wildReverseDraw4'))
        deck.push(createCard('wild', 'draw6'))
        deck.push(createCard('wild', 'draw10'))
        deck.push(createCard('wild', 'wildColorRoulette'))
    }

    return deck
}

/**
 * The deliberately small living-room deck: 108 cards, no Mercy additions.
 * Four blank/custom cards found in some retail packs are intentionally absent
 * because RUNE RIOT does not define a rule for them.
 */
export function generateClassicDeck(): Card[] {
    idCounter = 0
    const deck: Card[] = []
    const colors: CardColor[] = ['red', 'blue', 'green', 'yellow']

    for (const color of colors) {
        deck.push(createCard(color, 'number', 0))
        for (let value = 1; value <= 9; value++) {
            deck.push(createCard(color, 'number', value))
            deck.push(createCard(color, 'number', value))
        }
        for (let copy = 0; copy < 2; copy++) {
            deck.push(createCard(color, 'skip'))
            deck.push(createCard(color, 'reverse'))
            deck.push(createCard(color, 'draw2'))
        }
    }

    for (let copy = 0; copy < 4; copy++) {
        deck.push(createCard('wild', 'wild'))
        deck.push(createCard('wild', 'draw4'))
    }
    return deck
}

/** Classic 108-card deck plus exactly one copy of every Chaos card. */
export function generateChaosDeck(): Card[] {
    const deck = generateClassicDeck()
    deck.push(createCard('wild', 'fateSwap'))
    deck.push(createCard('wild', 'curseMirror'))
    deck.push(createCard('wild', 'diceCurse'))
    deck.push(createCard('wild', 'runeShield'))
    deck.push(createCard('wild', 'runeWhirl'))
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
