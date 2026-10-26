import { describe, expect, it } from 'vitest'
import type { Card, CardType } from '../../types/card'
import { CARD_TYPE_PRESENTATIONS, cardPresentation, playabilityExplanation } from '../cardPresentation'

const TYPES: CardType[] = [
  'number', 'skip', 'reverse', 'draw2', 'skipEveryone', 'discardAll',
  'wild', 'draw4', 'draw6', 'draw10', 'wildReverseDraw4', 'wildColorRoulette',
]

const EXPECTED: Record<CardType, { name: string, effect: string }> = {
  number: { name: 'Runenzahl 5', effect: 'dieselbe Zahl' },
  skip: { name: 'Sperrsiegel', effect: 'übersprungen' },
  reverse: { name: 'Schicksalswende', effect: 'Spielrichtung' },
  draw2: { name: 'Runenzug +2', effect: '2 Karten' },
  skipEveryone: { name: 'Zeitbann', effect: 'erneut am Zug' },
  discardAll: { name: 'Runenflut', effect: 'oberste Karte löst ihren Effekt aus' },
  wild: { name: 'Farbwahl', effect: 'neue aktive Kartenfamilie' },
  draw4: { name: 'Runenbruch +4', effect: '4 Karten' },
  draw6: { name: 'Arkaner Zug +6', effect: '6 Karten' },
  draw10: { name: 'Arkaner Zug +10', effect: '10 Karten' },
  wildReverseDraw4: { name: 'Schicksalsbruch +4', effect: 'Spielrichtung um' },
  wildColorRoulette: { name: 'Chaos-Roulette', effect: 'zieht, bis eine Karte dieser Familie erscheint' },
}

const card = (type: CardType, value?: number): Card => ({
  id: `${type}-${value ?? 'x'}`,
  type,
  value,
  color: type.startsWith('wild') || ['wild', 'draw6', 'draw10'].includes(type) ? 'wild' : 'red',
})

describe('German card presentation', () => {
  it('maps every real card type to a name and an effect', () => {
    expect(Object.keys(CARD_TYPE_PRESENTATIONS).sort()).toEqual([...TYPES].sort())
    for (const type of TYPES) {
      const presentation = cardPresentation(card(type, type === 'number' ? 5 : undefined))
      expect(presentation.name.length).toBeGreaterThan(2)
      expect(presentation.shortName.length).toBeGreaterThan(2)
      expect(presentation.effect.endsWith('.')).toBe(true)
      expect(presentation.name).toBe(EXPECTED[type].name)
      expect(presentation.effect).toContain(EXPECTED[type].effect)
    }
  })

  it('describes the actual special effects of zero and seven', () => {
    expect(cardPresentation(card('number', 0)).effect).toContain('Rotiert')
    expect(cardPresentation(card('number', 7)).effect).toContain('tauschen')
    expect(cardPresentation(card('number', 7)).shortName).toBe('Flammenrunen')
  })

  it('explains an authoritative blocked result without changing the rule decision', () => {
    const topCard = { ...card('number', 5), color: 'blue' as const }
    expect(playabilityExplanation({ card: card('skip'), playable: false, isMyTurn: false, drawStack: 0, currentColor: 'blue', topCard })).toContain('nicht am Zug')
    expect(playabilityExplanation({ card: card('number', 3), playable: false, isMyTurn: true, drawStack: 4, currentColor: 'blue', topCard })).toContain('Ziehstapel')
    expect(playabilityExplanation({ card: card('number', 3), playable: false, isMyTurn: true, drawStack: 0, currentColor: 'blue', topCard })).toContain('Familie, Zahl und Symbol')
    expect(playabilityExplanation({ card: card('draw6'), playable: true, isMyTurn: true, drawStack: 4, currentColor: 'blue', topCard })).toContain('Ziehstapel von 4')
  })
})
